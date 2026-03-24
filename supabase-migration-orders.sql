-- Pedidos (catálogo → WhatsApp). Execute no Supabase: SQL Editor > New query
--
-- Cole e execute TODO este ficheiro de uma vez (não só o bloco dos índices).
--
-- Se aparecer 42703 em order_number ou store_id: a tabela orders já existia incompleta.
-- Pare e execute primeiro: supabase-migration-orders-repair.sql
-- Depois volte a correr ESTE ficheiro completo.
--
-- Importante: se a tabela `orders` já existia SEM order_number / customer_*,
-- `CREATE TABLE IF NOT EXISTS` não altera nada. Por isso os ALTER abaixo vêm
-- SEMPRE antes dos índices que usam essas colunas.

create table if not exists public.orders (
  id uuid default gen_random_uuid() primary key,
  store_id uuid references public.stores(id) on delete cascade not null,
  subtotal decimal(12, 2) not null,
  payload jsonb not null default '{}'::jsonb,
  notes text,
  status text not null default 'novo',
  created_at timestamptz not null default now()
);

-- Colunas novas (ou tabela recém-criada acima): idempotente
alter table public.orders add column if not exists order_number integer;
alter table public.orders add column if not exists customer_name text;
alter table public.orders add column if not exists customer_phone text;

do $$
begin
  if exists (select 1 from public.orders where store_id is null limit 1) then
    raise exception
      'orders.store_id não pode ser NULL. Corra supabase-migration-orders-repair.sql ou faça UPDATE com o id correto de public.stores em cada linha.';
  end if;
end $$;

-- Preencher número e nome em linhas antigas
with per_store as (
  select id, store_id, created_at,
    row_number() over (partition by store_id order by created_at asc) as rnk
  from public.orders
  where order_number is null
),
base as (
  select distinct p.store_id,
    coalesce(
      (
        select max(o.order_number)
        from public.orders o
        where o.store_id = p.store_id
          and o.order_number is not null
      ),
      0
    ) as base_n
  from per_store p
)
update public.orders o
set order_number = b.base_n + p.rnk
from per_store p
join base b on b.store_id = p.store_id
where o.id = p.id;

update public.orders
set customer_name = 'Cliente'
where customer_name is null or trim(customer_name) = '';

-- Obrigatório para novos pedidos
alter table public.orders alter column customer_name set not null;

do $$
begin
  if exists (
    select 1 from public.orders where order_number is null limit 1
  ) then
    raise exception 'Ainda existem linhas com order_number nulo; verifique a tabela orders.';
  end if;
end $$;

alter table public.orders alter column order_number set not null;

create index if not exists orders_store_created_idx
  on public.orders (store_id, created_at desc);

create unique index if not exists orders_store_order_number_uidx
  on public.orders (store_id, order_number);

alter table public.orders enable row level security;

drop policy if exists "Donos veem pedidos da loja" on public.orders;
create policy "Donos veem pedidos da loja"
  on public.orders for select
  using (
    store_id in (select id from public.stores where user_id = auth.uid())
  );

comment on table public.orders is 'Pedidos gerados a partir do catálogo público; gravados pela API com service role.';
comment on column public.orders.payload is 'JSON: lines, subtotal, customerName, customerPhone, orderNumber (espelho dos campos da linha)';

select pg_notify('pgrst', 'reload schema');
