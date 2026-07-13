-- =====================================================================
-- Recarga de créditos da IA (Fase 2) — compras via Mercado Pago
-- Cada recarga vira uma linha aqui. O webhook do MP confirma o pagamento e credita
-- os tokens em store_ai_credits. A linha dá idempotência (não credita 2x) + histórico.
--
-- Sem policies: só o service role lê/escreve (a API autentica o dono e usa service role).
-- =====================================================================

create table if not exists public.ai_credit_purchases (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  brl numeric(10, 2) not null,
  tokens bigint not null,
  conversations int not null,
  status text not null default 'pending',   -- pending | approved | rejected
  payment_id text,                           -- id do pagamento no Mercado Pago
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ai_credit_purchases_store_idx
  on public.ai_credit_purchases (store_id, created_at desc);

-- Um pagamento do MP só pode creditar uma vez.
create unique index if not exists ai_credit_purchases_payment_idx
  on public.ai_credit_purchases (payment_id)
  where payment_id is not null;

alter table public.ai_credit_purchases enable row level security;
-- Sem policy de select/insert/update: acesso apenas via service role.
