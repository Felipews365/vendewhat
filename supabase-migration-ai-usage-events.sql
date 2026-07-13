-- =====================================================================
-- Log de consumo da IA (medição real de tokens por resposta / conversa)
--
-- Cada resposta da IA que gasta tokens grava UMA linha aqui. Serve para o
-- painel admin mostrar o consumo REAL: média de tokens por resposta e por
-- conversa (cliente), validando a conversão "1 conversa ≈ 80 mil tokens".
--
-- O motor de créditos (store_ai_credits) continua sendo a fonte do SALDO;
-- esta tabela é só histórico/telemetria (não afeta o desconto).
--
-- Sem policies: só o service role escreve/lê (igual a store_ai_credits).
-- O código tolera esta tabela ausente (o insert e a leitura ignoram o erro),
-- então aplicar a migration é opcional para a IA funcionar — mas necessário
-- para o painel mostrar a medição.
-- =====================================================================

create table if not exists public.ai_usage_events (
  id bigint generated always as identity primary key,
  store_id uuid not null references public.stores(id) on delete cascade,
  -- Telefone do cliente atendido (agrupa tokens por conversa). Pode ser nulo.
  customer_phone text,
  -- Origem do gasto: reply (atendimento) | followup | postsale | cart.
  kind text not null default 'reply',
  -- Tokens reais gastos na OpenAI nesta resposta (total_tokens da API).
  tokens integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists ai_usage_events_created_idx
  on public.ai_usage_events (created_at desc);
create index if not exists ai_usage_events_store_phone_idx
  on public.ai_usage_events (store_id, customer_phone);

alter table public.ai_usage_events enable row level security;
-- Sem policy de select/insert/update: acesso apenas via service role.
