-- Execute este SQL no Supabase: Dashboard > SQL Editor > New Query
-- Atendimento por IA no WhatsApp (Evolution API) — multi-tenant.

-- Configuração do WhatsApp / IA por loja (1:1 com stores)
create table if not exists public.store_whatsapp (
  store_id uuid primary key references public.stores(id) on delete cascade,
  evolution_instance text unique not null,                 -- ex.: vendewhat_<store_id>
  webhook_token text not null,                             -- segredo p/ validar o webhook
  connection_status text default 'disconnected' not null,  -- disconnected | connecting | connected
  connected_number text,
  ai_enabled boolean default false not null,
  ai_name text default 'Atendente' not null,
  ai_tone text default 'simpatico' not null,               -- simpatico | formal | descontraido
  faq text default '' not null,                            -- frete, pagamento, trocas, horário...
  updated_at timestamptz default now() not null
);

-- Histórico curto de conversa (memória do atendente por cliente)
create table if not exists public.whatsapp_messages (
  id uuid default gen_random_uuid() primary key,
  store_id uuid references public.stores(id) on delete cascade not null,
  customer_phone text not null,
  role text not null,                                      -- user | assistant
  content text not null,
  created_at timestamptz default now() not null
);
create index if not exists whatsapp_messages_store_phone_idx
  on public.whatsapp_messages (store_id, customer_phone, created_at);

-- RLS
alter table public.store_whatsapp enable row level security;
alter table public.whatsapp_messages enable row level security;

-- O dono lê e edita apenas a configuração da própria loja.
-- (O webhook e as rotas de API usam a service role, que ignora RLS.)
create policy "dono vê seu whatsapp"
  on public.store_whatsapp for select
  using (store_id in (select id from public.stores where user_id = auth.uid()));

create policy "dono edita seu whatsapp"
  on public.store_whatsapp for all
  using (store_id in (select id from public.stores where user_id = auth.uid()))
  with check (store_id in (select id from public.stores where user_id = auth.uid()));

create policy "dono vê suas mensagens"
  on public.whatsapp_messages for select
  using (store_id in (select id from public.stores where user_id = auth.uid()));
