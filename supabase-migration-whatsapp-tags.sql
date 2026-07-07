-- Tags de conversa (WhatsApp/IA)
--
-- Permite ao lojista rotular cada conversa no painel (ex.: "Interessado",
-- "Aguardando pagamento", "VIP") para organizar o atendimento. Uma linha por
-- conversa (loja + telefone), com as tags num array JSONB. Sem RLS: só o
-- service role lê/escreve (igual às demais tabelas de WhatsApp).

create table if not exists public.whatsapp_conversation_tags (
  store_id uuid not null references public.stores(id) on delete cascade,
  -- Telefone do cliente (só dígitos), mesma chave usada nas pausas/mensagens.
  customer_phone text not null,
  -- Lista de tags: ["Interessado", "VIP", ...]
  tags jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (store_id, customer_phone)
);

-- Sem policies: a tabela fica acessível só pelo service role.
alter table public.whatsapp_conversation_tags enable row level security;
