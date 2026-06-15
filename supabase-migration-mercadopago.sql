-- Integração Mercado Pago (modo teste primeiro).
-- Execute no Supabase: SQL Editor > New query. Cole e rode TODO o ficheiro de uma vez.
-- Idempotente: pode ser executado mais de uma vez sem erro.
--
-- Cobre os dois fluxos:
--   1) Mensalidade do SaaS (você cobra os lojistas) via assinatura automática (preapproval).
--   2) Gateway da loja (clientes dos lojistas pagam o lojista) via token próprio do lojista.

-- =====================================================================
-- 1) MENSALIDADE — campos extras em subscriptions
-- (gateway, gateway_customer_id, gateway_subscription_id já existem na
--  migration admin; aqui só completamos o que falta)
-- =====================================================================
alter table public.subscriptions
  add column if not exists gateway_status text,   -- status cru vindo do Mercado Pago
  add column if not exists payer_email text;       -- e-mail usado no preapproval

-- payments.method já aceita 'mercadopago' (texto livre); só guardamos o id do MP
-- para idempotência (não registrar o mesmo pagamento duas vezes).
alter table public.payments
  add column if not exists payment_id_external text;

create unique index if not exists payments_external_id_uidx
  on public.payments (payment_id_external)
  where payment_id_external is not null;

-- =====================================================================
-- 2) GATEWAY DA LOJA — credenciais do Mercado Pago por loja
-- O access_token é do LOJISTA e nunca pode ir para o browser:
-- não há policy de SELECT para o dono; toda leitura/escrita é via service
-- role (rotas /api). O dashboard só recebe um status derivado no servidor.
-- =====================================================================
create table if not exists public.store_payment_gateway (
  store_id uuid primary key references public.stores(id) on delete cascade,
  provider text not null default 'mercadopago',
  access_token text not null,          -- token do lojista (somente service role)
  public_key text,
  mp_user_id text,
  is_test boolean not null default false,
  enabled boolean not null default true,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.store_payment_gateway enable row level security;
-- Sem policy de select/insert/update/delete: apenas o service role acessa.

comment on table public.store_payment_gateway is
  'Credenciais do gateway (Mercado Pago) por loja. access_token nunca exposto ao frontend; só service role.';

-- =====================================================================
-- 3) PEDIDOS — status de pagamento
-- =====================================================================
alter table public.orders
  add column if not exists payment_status text not null default 'pendente', -- pendente | pago | falhou
  add column if not exists payment_provider text,
  add column if not exists payment_id text,
  add column if not exists paid_at timestamptz;

create index if not exists orders_payment_id_idx
  on public.orders (payment_id);

select pg_notify('pgrst', 'reload schema');
