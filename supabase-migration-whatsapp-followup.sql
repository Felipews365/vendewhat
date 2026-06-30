-- Execute no Supabase: Dashboard > SQL Editor > New Query
-- Follow-up automático: se o cliente fica um tempo sem responder, a IA cutuca
-- perguntando se quer fechar o pedido. O tempo é configurado por loja.

alter table public.store_whatsapp
  add column if not exists ai_followup_minutes integer default 0 not null,  -- 0 = desativado
  add column if not exists ai_followup_message text default '' not null;     -- vazio = a IA gera a mensagem

-- Controle de "já cutuquei este cliente" (evita repetir no mesmo período de silêncio).
create table if not exists public.whatsapp_followups (
  store_id uuid references public.stores(id) on delete cascade not null,
  customer_phone text not null,
  last_followup_at timestamptz not null default now(),
  primary key (store_id, customer_phone)
);

-- Só a service role mexe nesta tabela (o cron). Sem policy = negado para anon.
alter table public.whatsapp_followups enable row level security;
