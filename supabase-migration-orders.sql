-- Pedidos registrados quando o cliente envia pelo WhatsApp (via API).
-- Execute no Supabase: SQL Editor > New query

create table if not exists public.orders (
  id uuid default gen_random_uuid() primary key,
  store_id uuid references public.stores(id) on delete cascade not null,
  order_number integer not null,
  customer_name text not null,
  customer_phone text,
  subtotal decimal(12, 2) not null,
  payload jsonb not null default '{}'::jsonb,
  notes text,
  status text not null default 'novo',
  created_at timestamptz not null default now()
);

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

-- Insert apenas pelo backend com service role (sem policy de insert para anon).

comment on table public.orders is 'Pedidos gerados a partir do catálogo público; gravados pela API com service role.';
comment on column public.orders.payload is 'JSON: lines, subtotal, customerName, customerPhone, orderNumber (espelho dos campos da linha)';
