-- =====================================================================
-- Custo real da IA por loja (painel do admin)
--
-- Complementa `supabase-migration-ai-usage-events.sql`. Desde a separação de
-- modelos (OPENAI_MODEL no atendimento × OPENAI_MODEL_BASIC nos crons/visão),
-- o token deixou de ter preço único: o mesmo total custa ~2,6x mais numa
-- resposta de atendimento do que num follow-up. Sem saber QUAL modelo gerou a
-- linha — e sem separar entrada de saída (a saída custa 4x a entrada) — não dá
-- para converter tokens em reais sem mentir sobre a margem.
--
-- As três colunas são NULLABLE de propósito: as linhas já gravadas continuam
-- válidas e o código as precifica pelo modelo antigo (gpt-4o-mini), estimando
-- a fração de saída (ver src/lib/aiPricing.ts). Nada é reprocessado.
--
-- Sem policies: só o service role escreve/lê (igual à tabela original).
-- O código tolera estas colunas ausentes, então aplicar é opcional para a IA
-- funcionar — mas necessário para o custo em R$ ficar exato daqui pra frente.
-- =====================================================================

alter table public.ai_usage_events
  add column if not exists model text,
  add column if not exists input_tokens integer,
  add column if not exists output_tokens integer;

-- O painel soma por loja dentro de uma janela de dias.
create index if not exists ai_usage_events_store_created_idx
  on public.ai_usage_events (store_id, created_at desc);
