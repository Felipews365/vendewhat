-- CRM: base de clientes (fase 1)
--
-- Execute no Supabase: SQL Editor > New query. Cole e rode TODO o ficheiro.
-- Idempotente: pode ser executado mais de uma vez sem erro.
--
-- POR QUE UMA TABELA, E NÃO UMA VIEW: hoje o "cliente" não existe como entidade.
-- Ele aparece como telefone em `orders`, em `whatsapp_messages`, em
-- `whatsapp_contacts` e em `whatsapp_conversation_tags` — em três formatos
-- diferentes e sem id estável. Além disso `whatsapp_messages` é APAGADA a cada
-- 30 dias (MESSAGE_RETENTION_DAYS), então quem só conversou sumiria do sistema.
-- Materializar resolve os três problemas: id estável (para funil/anotações/
-- campanha), agregados indexáveis (ordenar por LTV) e memória permanente.
--
-- CHAVE CANÔNICA: crm_phone_key() = 55 + DDD + 9 dígitos. É a gêmea EXATA de
-- crmPhoneKey() em src/lib/crm/phone.ts — se as duas divergirem, o backfill e o
-- sync criam linhas separadas para o mesmo cliente. Mexeu numa, mexa na outra.

-- ---------------------------------------------------------------------------
-- Chave canônica do telefone
-- ---------------------------------------------------------------------------
create or replace function public.crm_phone_key(raw text)
returns text
language sql
immutable
as $$
  with d as (
    select regexp_replace(coalesce(raw, ''), '\D', '', 'g') as v
  ),
  ddi as (
    -- 10 (fixo) ou 11 (celular) dígitos = o cliente digitou sem o DDI.
    select case when length(v) in (10, 11) then '55' || v else v end as v from d
  )
  select case
    -- 12 dígitos com DDI = celular antigo, gravado sem o 9. O 5º dígito é o
    -- primeiro do número local: 6-9 é celular (ganha o 9), 2-5 é fixo (fica).
    when length(v) = 12
     and left(v, 2) = '55'
     and substr(v, 5, 1) between '6' and '9'
      then substr(v, 1, 4) || '9' || substr(v, 5)
    else v
  end
  from ddi;
$$;

comment on function public.crm_phone_key(text) is
  'Telefone canônico do CRM (55+DDD+9 dígitos). Gêmea de crmPhoneKey() em src/lib/crm/phone.ts.';

-- ---------------------------------------------------------------------------
-- Tabela
-- ---------------------------------------------------------------------------
create table if not exists public.crm_customers (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,

  -- Canônica: é o que a tela e a segmentação usam. Única por loja.
  phone_key text not null,
  -- 8 últimos dígitos: preserva o casamento tolerante que o painel de conversas
  -- fazia por samePhone() (o WhatsApp às vezes omite o 9 ou o DDI).
  phone_tail text not null,
  -- Os dígitos EXATOS com que este cliente aparece nas tabelas whatsapp_*.
  -- Toda escrita do CRM naquelas tabelas usa esta coluna, para o painel de
  -- conversas continuar achando as mesmas linhas (nada legado é reescrito).
  wa_phone text not null,

  name text not null default '',

  first_seen_at timestamptz not null default now(),
  last_message_at timestamptz,
  last_order_at timestamptz,

  orders_count integer not null default 0,
  total_spent numeric(12,2) not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists crm_customers_store_phone_idx
  on public.crm_customers (store_id, phone_key);
create index if not exists crm_customers_tail_idx
  on public.crm_customers (store_id, phone_tail);
create index if not exists crm_customers_ltv_idx
  on public.crm_customers (store_id, total_spent desc);
create index if not exists crm_customers_order_idx
  on public.crm_customers (store_id, last_order_at desc nulls last);
create index if not exists crm_customers_seen_idx
  on public.crm_customers (store_id, last_message_at desc nulls last);

comment on table public.crm_customers is
  'CRM: um cliente por loja (chave canônica de telefone). Escrita só por service role.';

-- Leitura pelo dono (o painel lista direto pelo browser, como store_visits).
-- Escrita: só service role, via /api/crm/* (igual a orders).
alter table public.crm_customers enable row level security;

drop policy if exists "Donos veem clientes da loja" on public.crm_customers;
create policy "Donos veem clientes da loja" on public.crm_customers
  for select
  using (
    store_id in (select id from public.stores where user_id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- Sincronização (chamada por /api via rpc)
--
-- Fica em SQL, e não no TypeScript, por um motivo prático: `orders.customer_phone`
-- guarda o que o cliente DIGITOU (com máscara, parênteses, espaços). Casar isso
-- com a chave canônica pelo supabase-js exigiria adivinhar todas as variantes;
-- aqui o próprio crm_phone_key() normaliza os dois lados. De quebra, o upsert e
-- o recálculo dos agregados viram uma ida só ao banco, e os agregados nunca
-- podem divergir da fonte da verdade (orders).
-- ---------------------------------------------------------------------------

-- Torna o casamento por chave canônica indexável (crm_phone_key é immutable).
create index if not exists orders_crm_phone_idx
  on public.orders (store_id, public.crm_phone_key(customer_phone));

create or replace function public.crm_sync_customer(
  p_store_id uuid,
  p_phone text,
  p_name text default null,
  p_wa_phone text default null,
  p_touch_message boolean default false
)
returns uuid
language plpgsql
as $$
declare
  v_key  text := public.crm_phone_key(p_phone);
  v_name text := coalesce(nullif(trim(coalesce(p_name, '')), ''), '');
  v_wa   text := nullif(regexp_replace(coalesce(p_wa_phone, ''), '\D', '', 'g'), '');
  v_id   uuid;
begin
  -- Telefone curto demais (ou vazio) não vira cliente.
  if v_key is null or length(v_key) < 10 then
    return null;
  end if;

  insert into public.crm_customers
    (store_id, phone_key, phone_tail, wa_phone, name, last_message_at)
  values
    (p_store_id, v_key, right(v_key, 8), coalesce(v_wa, v_key), v_name,
     case when p_touch_message then now() else null end)
  on conflict (store_id, phone_key) do update set
    -- Nome só avança: nunca apaga o que o lojista renomeou à mão.
    name = case
             when v_name <> '' then v_name
             else crm_customers.name
           end,
    wa_phone = coalesce(v_wa, crm_customers.wa_phone),
    last_message_at = case
                        when p_touch_message then now()
                        else crm_customers.last_message_at
                      end,
    updated_at = now()
  returning id into v_id;

  -- Agregados SEMPRE recalculados de orders: divergência se auto-corrige.
  update public.crm_customers c set
    orders_count  = agg.n,
    total_spent   = agg.total,
    last_order_at = agg.last_at,
    first_seen_at = least(c.first_seen_at, coalesce(agg.first_at, c.first_seen_at)),
    updated_at    = now()
  from (
    select
      count(*)                      as n,
      coalesce(sum(o.subtotal), 0)  as total,
      max(o.created_at)             as last_at,
      min(o.created_at)             as first_at
    from public.orders o
    where o.store_id = p_store_id
      and public.crm_phone_key(o.customer_phone) = v_key
  ) agg
  where c.id = v_id;

  return v_id;
end;
$$;

comment on function public.crm_sync_customer(uuid, text, text, text, boolean) is
  'Upsert do cliente + recálculo dos agregados a partir de orders. Chamada por /api/crm/* via rpc.';

-- Recadastra a loja inteira (botão "Atualizar base" do painel). Mesma lógica dos
-- backfills, escopada a uma loja: serve para reparar divergência e para trazer
-- quem entrou antes de a migration ser aplicada.
create or replace function public.crm_resync_store(p_store_id uuid)
returns integer
language plpgsql
as $$
declare
  v_total integer := 0;
begin
  -- Quem comprou (orders é sempre a fonte da verdade dos agregados).
  insert into public.crm_customers
    (store_id, phone_key, phone_tail, wa_phone, name,
     first_seen_at, last_order_at, orders_count, total_spent)
  select
    o.store_id,
    public.crm_phone_key(o.customer_phone),
    right(public.crm_phone_key(o.customer_phone), 8),
    public.crm_phone_key(o.customer_phone),
    coalesce((array_agg(o.customer_name order by o.created_at desc))[1], ''),
    min(o.created_at), max(o.created_at), count(*), coalesce(sum(o.subtotal), 0)
  from public.orders o
  where o.store_id = p_store_id
    and o.customer_phone is not null
    and length(regexp_replace(o.customer_phone, '\D', '', 'g')) >= 10
  group by o.store_id, public.crm_phone_key(o.customer_phone)
  on conflict (store_id, phone_key) do update set
    orders_count  = excluded.orders_count,
    total_spent   = excluded.total_spent,
    last_order_at = excluded.last_order_at,
    first_seen_at = least(crm_customers.first_seen_at, excluded.first_seen_at),
    name          = case
                      when crm_customers.name = '' then excluded.name
                      else crm_customers.name
                    end,
    updated_at    = now();

  get diagnostics v_total = row_count;

  -- Quem só conversou (a tabela pode não existir em instalações antigas).
  if to_regclass('public.whatsapp_messages') is not null then
    insert into public.crm_customers
      (store_id, phone_key, phone_tail, wa_phone, name, first_seen_at, last_message_at)
    select
      m.store_id,
      public.crm_phone_key(m.customer_phone),
      right(public.crm_phone_key(m.customer_phone), 8),
      (array_agg(m.customer_phone order by length(m.customer_phone) desc))[1],
      '',
      min(m.created_at),
      max(m.created_at)
    from public.whatsapp_messages m
    where m.store_id = p_store_id
      and length(regexp_replace(coalesce(m.customer_phone, ''), '\D', '', 'g')) >= 10
    group by m.store_id, public.crm_phone_key(m.customer_phone)
    on conflict (store_id, phone_key) do update set
      last_message_at = greatest(
        crm_customers.last_message_at, excluded.last_message_at
      ),
      first_seen_at = least(
        crm_customers.first_seen_at, excluded.first_seen_at
      ),
      wa_phone = excluded.wa_phone,
      updated_at = now();
  end if;

  -- Nomes renomeados pelo lojista têm prioridade sobre o nome do pedido.
  if to_regclass('public.whatsapp_contacts') is not null then
    update public.crm_customers c set
      name = t.display_name,
      updated_at = now()
    from public.whatsapp_contacts t
    where t.store_id = p_store_id
      and c.store_id = p_store_id
      and c.phone_key = public.crm_phone_key(t.customer_phone)
      and coalesce(nullif(trim(t.display_name), ''), '') <> ''
      and c.name is distinct from t.display_name;
  end if;

  return v_total;
end;
$$;

comment on function public.crm_resync_store(uuid) is
  'Recadastra os clientes de uma loja a partir de orders + whatsapp_messages/contacts.';

-- ---------------------------------------------------------------------------
-- BACKFILL 1 — quem já comprou (orders é o histórico que sobrevive à purga)
-- ---------------------------------------------------------------------------
insert into public.crm_customers
  (store_id, phone_key, phone_tail, wa_phone, name,
   first_seen_at, last_order_at, orders_count, total_spent)
select
  o.store_id,
  public.crm_phone_key(o.customer_phone) as k,
  right(public.crm_phone_key(o.customer_phone), 8),
  public.crm_phone_key(o.customer_phone),
  coalesce((array_agg(o.customer_name order by o.created_at desc))[1], ''),
  min(o.created_at),
  max(o.created_at),
  count(*),
  coalesce(sum(o.subtotal), 0)
from public.orders o
where o.customer_phone is not null
  and length(regexp_replace(o.customer_phone, '\D', '', 'g')) >= 10
group by o.store_id, public.crm_phone_key(o.customer_phone)
on conflict (store_id, phone_key) do update set
  -- orders é a fonte da verdade dos agregados: sempre recalcula.
  orders_count  = excluded.orders_count,
  total_spent   = excluded.total_spent,
  last_order_at = excluded.last_order_at,
  first_seen_at = least(crm_customers.first_seen_at, excluded.first_seen_at),
  name          = case
                    when crm_customers.name = '' then excluded.name
                    else crm_customers.name
                  end,
  updated_at    = now();

-- ---------------------------------------------------------------------------
-- BACKFILL 2 — quem só conversou (nunca comprou)
--
-- As tabelas de WhatsApp vêm de migrations posteriores e podem não existir
-- ainda; por isso cada origem entra só se a tabela estiver criada. `wa_phone`
-- recebe os DÍGITOS ORIGINAIS da tabela de origem (é assim que o painel de
-- conversas encontra a linha), preferindo a variante mais longa (com DDI).
-- ---------------------------------------------------------------------------
do $backfill$
declare
  parts text[] := array[]::text[];
  sql text;
begin
  -- array_append (e não o operador ||): com `text[] || text` o Postgres resolve
  -- para a concatenação de DOIS arrays e tenta ler o SQL como literal de array
  -- ("malformed array literal").
  if to_regclass('public.whatsapp_messages') is not null then
    parts := array_append(parts, $q$
      select store_id, customer_phone as wa, ''::text as nome,
             max(created_at) as last_msg, min(created_at) as seen
      from public.whatsapp_messages
      group by store_id, customer_phone
    $q$);
  end if;

  if to_regclass('public.whatsapp_contacts') is not null then
    parts := array_append(parts, $q$
      select store_id, customer_phone as wa, coalesce(display_name, '')::text as nome,
             null::timestamptz as last_msg, updated_at as seen
      from public.whatsapp_contacts
    $q$);
  end if;

  if to_regclass('public.whatsapp_conversation_tags') is not null then
    parts := array_append(parts, $q$
      select store_id, customer_phone as wa, ''::text as nome,
             null::timestamptz as last_msg, updated_at as seen
      from public.whatsapp_conversation_tags
    $q$);
  end if;

  if array_length(parts, 1) is null then
    return;
  end if;

  sql := $head$
    insert into public.crm_customers
      (store_id, phone_key, phone_tail, wa_phone, name, first_seen_at, last_message_at)
    select
      s.store_id,
      public.crm_phone_key(s.wa),
      right(public.crm_phone_key(s.wa), 8),
      -- variante mais longa = a que traz o DDI, que é como o webhook grava.
      (array_agg(s.wa order by length(s.wa) desc))[1],
      coalesce((array_agg(nullif(s.nome, '') order by s.seen desc nulls last))[1], ''),
      -- first_seen_at é NOT NULL: origem sem data não pode abortar a migration.
      coalesce(min(s.seen), now()),
      max(s.last_msg)
    from (
  $head$ || array_to_string(parts, ' union all ') || $tail$
    ) s
    where length(regexp_replace(coalesce(s.wa, ''), '\D', '', 'g')) >= 10
    group by s.store_id, public.crm_phone_key(s.wa)
    on conflict (store_id, phone_key) do update set
      last_message_at = greatest(
        crm_customers.last_message_at, excluded.last_message_at
      ),
      first_seen_at = least(
        crm_customers.first_seen_at, excluded.first_seen_at
      ),
      -- não toca em orders_count/total_spent: quem manda neles é o backfill 1.
      name = case
               when crm_customers.name = '' then excluded.name
               else crm_customers.name
             end,
      wa_phone = excluded.wa_phone,
      updated_at = now()
  $tail$;

  execute sql;
end
$backfill$;

select pg_notify('pgrst', 'reload schema');
