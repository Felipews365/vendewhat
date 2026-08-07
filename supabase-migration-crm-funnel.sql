-- CRM: funil de vendas (fase 2)
--
-- Execute no Supabase: SQL Editor > New query. Cole e rode TODO o ficheiro.
-- Idempotente: pode ser executado mais de uma vez sem erro.
-- Depende de supabase-migration-crm-customers.sql (fase 1).
--
-- A ETAPA É UMA COLUNA, não uma tabela de "negociações". O público é o
-- micro-lojista de WhatsApp: um cliente tem UMA negociação por vez, e o card do
-- kanban precisa mostrar LTV/etiquetas que já estão em crm_customers. Uma tabela
-- crm_deals exigiria join em toda leitura e uma UI de abrir/fechar negociação —
-- complexidade que ninguém pediu. Se um dia precisar de várias negociações por
-- cliente, ela entra SEM tocar aqui: esta coluna vira o cache da etapa aberta.
--
-- As transições automáticas (pedido novo → "ganho") ficam no TypeScript
-- (src/lib/crm/customers.ts), de propósito: em trigger elas seriam invisíveis
-- para quem lê o código do painel.

alter table public.crm_customers
  add column if not exists stage text not null default 'novo';

-- Quando a etapa mudou pela última vez — alimenta o "parado há N dias" no card.
alter table public.crm_customers
  add column if not exists stage_changed_at timestamptz not null default now();

-- Ordena cada coluna do kanban (mais parado primeiro é decisão da tela).
create index if not exists crm_customers_stage_idx
  on public.crm_customers (store_id, stage, stage_changed_at desc);

comment on column public.crm_customers.stage is
  'Etapa do funil: novo | atendimento | orcamento | pagamento | ganho | perdido (ver src/lib/crm/stages.ts).';

-- Backfill: quem já comprou nasce em "Comprou". Só mexe em quem está no valor
-- padrão, para não desfazer nenhuma curadoria caso o script rode de novo.
update public.crm_customers
set stage = 'ganho',
    stage_changed_at = coalesce(last_order_at, now()),
    updated_at = now()
where orders_count > 0
  and stage = 'novo';

-- ---------------------------------------------------------------------------
-- Números do topo da tela de Clientes
--
-- Somar total_spent/orders_count pelo supabase-js exigiria baixar a base
-- inteira só para fazer a conta. Uma função resolve numa ida ao banco.
-- `sem_telefone` explica ao lojista por que a conta não bate com a de Pedidos:
-- pedido sem telefone válido não vira cliente.
-- ---------------------------------------------------------------------------
create or replace function public.crm_store_stats(p_store_id uuid)
returns table (
  total        bigint,
  novos_30d    bigint,
  compradores  bigint,
  receita      numeric,
  ticket_medio numeric,
  sem_telefone bigint
)
language sql
stable
as $$
  select
    count(*)                                            as total,
    count(*) filter (where c.first_seen_at >= now() - interval '30 days') as novos_30d,
    count(*) filter (where c.orders_count > 0)          as compradores,
    coalesce(sum(c.total_spent), 0)                     as receita,
    case
      when coalesce(sum(c.orders_count), 0) > 0
        then coalesce(sum(c.total_spent), 0) / sum(c.orders_count)
      else 0
    end                                                 as ticket_medio,
    (
      select count(*)
      from public.orders o
      where o.store_id = p_store_id
        and length(regexp_replace(coalesce(o.customer_phone, ''), '\D', '', 'g')) < 10
    )                                                   as sem_telefone
  from public.crm_customers c
  where c.store_id = p_store_id;
$$;

comment on function public.crm_store_stats(uuid) is
  'Resumo da base de clientes de uma loja (topo de /dashboard/clientes).';

-- ---------------------------------------------------------------------------
-- Séries para os gráficos do topo de /dashboard/clientes
--
-- `novos` sai de crm_customers (quando o cliente apareceu) e `receita` sai de
-- orders (quando o dinheiro entrou) — são perguntas diferentes e não podem sair
-- da mesma tabela. generate_series garante que MÊS SEM VENDA apareça zerado, em
-- vez de sumir do gráfico e distorcer a leitura.
-- ---------------------------------------------------------------------------
create or replace function public.crm_store_timeline(
  p_store_id uuid,
  p_months integer default 6
)
returns table (mes date, novos bigint, receita numeric)
language sql
stable
as $$
  with meses as (
    select (date_trunc('month', now()) - (g || ' month')::interval)::date as m
    from generate_series(0, greatest(coalesce(p_months, 6), 1) - 1) as g
  )
  select
    meses.m as mes,
    (
      select count(*)
      from public.crm_customers c
      where c.store_id = p_store_id
        and c.first_seen_at >= meses.m
        and c.first_seen_at < (meses.m + interval '1 month')
    ) as novos,
    (
      select coalesce(sum(o.subtotal), 0)
      from public.orders o
      where o.store_id = p_store_id
        and o.created_at >= meses.m
        and o.created_at < (meses.m + interval '1 month')
    ) as receita
  from meses
  order by meses.m;
$$;

comment on function public.crm_store_timeline(uuid, integer) is
  'Novos clientes e receita por mês (gráficos de /dashboard/clientes).';

-- Quantos clientes (e quanto valor) há em cada etapa do funil.
create or replace function public.crm_store_funnel(p_store_id uuid)
returns table (stage text, total bigint, valor numeric)
language sql
stable
as $$
  select c.stage, count(*) as total, coalesce(sum(c.total_spent), 0) as valor
  from public.crm_customers c
  where c.store_id = p_store_id
  group by c.stage;
$$;

comment on function public.crm_store_funnel(uuid) is
  'Contagem e valor por etapa do funil (gráfico e cabeçalho do kanban).';

select pg_notify('pgrst', 'reload schema');
