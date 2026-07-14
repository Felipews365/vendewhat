-- Nome personalizado do contato por conversa (o lojista pode renomear quem
-- fala com a loja no WhatsApp). Sobrepõe o nome vindo de pedidos anteriores.
-- Sem RLS: acessada só pela service role (igual a whatsapp_conversation_tags).

create table if not exists whatsapp_contacts (
  store_id uuid not null references stores(id) on delete cascade,
  customer_phone text not null,
  display_name text not null default '',
  updated_at timestamptz not null default now(),
  primary key (store_id, customer_phone)
);

-- Sem policies: apenas a service role escreve/lê (o app usa createAdminSupabase).
alter table whatsapp_contacts enable row level security;
