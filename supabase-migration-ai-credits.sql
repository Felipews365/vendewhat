-- =====================================================================
-- Motor de créditos da IA (Fase 1)
-- Cada loja tem um saldo de tokens. O painel mostra em "conversas" (1 conversa
-- ≈ 80.000 tokens), mas o desconto interno é por token real gasto na OpenAI.
--
-- Modelo:
--   included_tokens  = franquia mensal do plano (IA Completo = 80.000.000;
--                      IA Sob Medida = 0, só usa créditos). Renova a cada ciclo.
--   used_tokens      = consumido no ciclo atual (zera na renovação).
--   credit_tokens    = créditos comprados/creditados (acumula, NÃO expira).
--
--   saldo disponível = max(0, included_tokens - used_tokens) + credit_tokens
--   desconta primeiro da franquia, depois dos créditos.
--
-- Sem policies: só o service role lê/escreve (a API do painel autentica o dono
-- e usa service role, igual a orders/store_payment_gateway).
-- =====================================================================

create table if not exists public.store_ai_credits (
  store_id uuid primary key references public.stores(id) on delete cascade,
  cycle_start date not null default current_date,
  included_tokens bigint not null default 0,
  used_tokens bigint not null default 0,
  credit_tokens bigint not null default 0,
  low_warned_at timestamptz,
  empty_warned_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.store_ai_credits enable row level security;
-- Sem policy de select/insert/update: acesso apenas via service role.
