-- CRM: campanhas / lista de disparo (fase 3)
--
-- Execute no Supabase: SQL Editor > New query. Cole e rode TODO o ficheiro.
-- Idempotente: pode ser executado mais de uma vez sem erro.
-- Depende das fases 1 e 2.
--
-- ⚠️ CONTEXTO DE RISCO: o WhatsApp da loja é conectado por Evolution API (não
-- oficial). Disparo em massa é a forma mais rápida de o número ser banido — e o
-- número banido derruba JUNTO o atendimento da IA, que é o produto. Por isso as
-- travas (ritmo, teto diário, janela de horário, elegibilidade, opt-out) são
-- CONSTANTES DE CÓDIGO em src/lib/crm/campaigns.ts, não campos editáveis. O
-- lojista escolhe o público e o texto; o resto não se negocia.

-- ---------------------------------------------------------------------------
-- Cliente: quem saiu da lista e quando recebeu a última campanha
-- ---------------------------------------------------------------------------
alter table public.crm_customers
  add column if not exists opted_out_at timestamptz;

alter table public.crm_customers
  add column if not exists last_campaign_at timestamptz;

-- Achar rápido quem está elegível (não saiu e não recebeu nada há dias).
create index if not exists crm_customers_campaign_idx
  on public.crm_customers (store_id, opted_out_at, last_campaign_at);

comment on column public.crm_customers.opted_out_at is
  'Cliente pediu para não receber campanhas (respondeu SAIR). Não afeta o atendimento normal.';

-- ---------------------------------------------------------------------------
-- Campanhas
-- ---------------------------------------------------------------------------
create table if not exists public.crm_campaigns (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,

  name text not null,
  -- Precisa conter {nome}: mensagem idêntica em massa é o padrão que o
  -- WhatsApp detecta. A validação está na API.
  message text not null,
  -- Snapshot do filtro usado, só para auditoria ("para quem isso foi?").
  audience jsonb not null default '{}'::jsonb,

  status text not null default 'rascunho',
  -- rascunho | enviando | pausada | concluida | cancelada

  total integer not null default 0,
  sent integer not null default 0,
  failed integer not null default 0,

  -- Respiro entre lotes: o cron não toca nesta campanha antes desta hora.
  next_send_at timestamptz,

  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists crm_campaigns_store_idx
  on public.crm_campaigns (store_id, created_at desc);
create index if not exists crm_campaigns_due_idx
  on public.crm_campaigns (status, next_send_at);

-- ---------------------------------------------------------------------------
-- Destinatários (a fila)
--
-- O público é CONGELADO aqui na criação. Um envio de 300 contatos leva dias;
-- se a lista fosse recalculada a cada passada do cron, ela mudaria no meio do
-- caminho e ninguém saberia quem já recebeu.
-- ---------------------------------------------------------------------------
create table if not exists public.crm_campaign_targets (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.crm_campaigns(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  customer_id uuid not null references public.crm_customers(id) on delete cascade,

  wa_phone text not null,
  name text not null default '',

  status text not null default 'pendente',
  -- pendente | enviando | enviado | falhou | pulado

  -- Lock otimista, igual ao claimPendingReply do debounce: impede que dois
  -- crons simultâneos mandem a MESMA mensagem duas vezes.
  claimed_until timestamptz,

  sent_at timestamptz,
  error text,

  unique (campaign_id, customer_id)
);

create index if not exists crm_targets_queue_idx
  on public.crm_campaign_targets (campaign_id, status);
-- Teto diário por loja: conta os enviados de hoje.
create index if not exists crm_targets_cap_idx
  on public.crm_campaign_targets (store_id, sent_at desc);

comment on table public.crm_campaign_targets is
  'Fila de envio de uma campanha. Público congelado na criação. Só service role.';

-- Sem policies: as duas tabelas são acessadas só pelo service role, via
-- /api/crm/campaigns (mesmo critério das tabelas whatsapp_*).
alter table public.crm_campaigns enable row level security;
alter table public.crm_campaign_targets enable row level security;

select pg_notify('pgrst', 'reload schema');
