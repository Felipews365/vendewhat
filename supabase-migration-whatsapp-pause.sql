-- Execute no Supabase: Dashboard > SQL Editor > New Query
-- Pausar o atendimento por IA: global, por cliente e "handoff" (quando a loja responde).

-- Pausa global + tempo de handoff (na config de WhatsApp/IA de cada loja).
alter table public.store_whatsapp
  add column if not exists ai_paused boolean default false not null,
  add column if not exists ai_paused_until timestamptz,                 -- null = pausa até a loja reativar
  add column if not exists ai_handoff_minutes integer default 30 not null; -- 0 = não pausar quando a loja responde

-- Pausas por cliente (manual ou automática quando a loja responde — "handoff").
create table if not exists public.whatsapp_pauses (
  store_id uuid references public.stores(id) on delete cascade not null,
  customer_phone text not null,
  paused_until timestamptz,                 -- null = pausado até a loja reativar
  reason text default 'manual' not null,    -- manual | handoff
  created_at timestamptz default now() not null,
  primary key (store_id, customer_phone)
);

alter table public.whatsapp_pauses enable row level security;

-- O dono lê as pausas da própria loja. (As escritas usam a service role nas rotas de API.)
create policy "dono vê suas pausas"
  on public.whatsapp_pauses for select
  using (store_id in (select id from public.stores where user_id = auth.uid()));
