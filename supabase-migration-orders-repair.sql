-- =============================================================================
-- PASSO 1 de 2 — Reparação: tabela orders antiga / incompleta (erro 42703, etc.)
-- =============================================================================
-- Supabase → SQL Editor: execute ESTE ficheiro inteiro.
-- Depois execute supabase-migration-orders.sql do início ao fim (PASSO 2).
--
-- Se aparecer erro sobre store_id NULL:
--   1) Corra: select id, name, slug from public.stores;
--   2) Copie o valor da coluna id (36 caracteres: hex + hífens, ex. f47ac10b-58cc-4372-a567-0e02b2c3d479).
--      NÃO cole texto explicativo — só o id que apareceu na grelha de resultados.
--   3) update public.orders set store_id = '...' where store_id is null;
-- Uma única loja e pedidos órfãos são todos dela (só nesse caso):
--   update public.orders set store_id = (select id from public.stores limit 1) where store_id is null;
-- Só testes: delete from public.orders where store_id is null;
-- =============================================================================

create table if not exists public.orders (
  id uuid default gen_random_uuid() primary key
);

alter table public.orders add column if not exists store_id uuid references public.stores(id) on delete cascade;
alter table public.orders add column if not exists subtotal decimal(12, 2);
alter table public.orders add column if not exists payload jsonb default '{}'::jsonb;
alter table public.orders add column if not exists notes text;
alter table public.orders add column if not exists status text default 'novo';
alter table public.orders add column if not exists created_at timestamptz default now();

alter table public.orders add column if not exists order_number integer;
alter table public.orders add column if not exists customer_name text;
alter table public.orders add column if not exists customer_phone text;

update public.orders set payload = coalesce(payload, '{}'::jsonb);
update public.orders set status = coalesce(nullif(trim(status), ''), 'novo');
update public.orders set created_at = coalesce(created_at, now());
update public.orders set subtotal = coalesce(subtotal, 0);

do $$
begin
  if exists (select 1 from public.orders where store_id is null limit 1) then
    raise exception
      'orders: há linhas com store_id NULL. Atualize com o UUID da loja (select id from public.stores) ou delete linhas de teste; depois volte a executar este script.';
  end if;
  if exists (select 1 from public.orders where payload is null limit 1) then
    raise exception 'orders: payload ainda NULL após correção — contacte suporte ou preencha manualmente.';
  end if;
end $$;

alter table public.orders alter column subtotal set not null;
alter table public.orders alter column payload set not null;
alter table public.orders alter column status set not null;
alter table public.orders alter column created_at set not null;

-- FK com nome fixo (ignora se já existir, p.ex. criada pelo REFERENCES acima)
do $$
begin
  alter table public.orders
    add constraint orders_store_id_fkey
    foreign key (store_id) references public.stores(id) on delete cascade;
exception
  when duplicate_object then null;
end $$;

alter table public.orders alter column store_id set not null;

comment on table public.orders is 'Pedidos; a seguir correr supabase-migration-orders.sql completo.';
