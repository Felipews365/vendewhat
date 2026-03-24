-- Incremental: só colunas + backfill + índice único.
-- Preferível: reexecutar supabase-migration-orders.sql completo (já inclui isto antes dos índices).

alter table public.orders add column if not exists customer_name text;
alter table public.orders add column if not exists customer_phone text;
alter table public.orders add column if not exists order_number integer;

-- Numeração por loja: pedidos sem número recebem o próximo após o maior já existente
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

create unique index if not exists orders_store_order_number_uidx
  on public.orders (store_id, order_number);
