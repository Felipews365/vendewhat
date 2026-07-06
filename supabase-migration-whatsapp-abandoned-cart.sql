-- Recuperação de carrinho abandonado (WhatsApp/IA)
--
-- Quando o cliente monta o carrinho na loja pública e digita nome + telefone,
-- mas não finaliza o pedido, salvamos um "rascunho" aqui. Um cron (o mesmo do
-- follow-up, no n8n) cutuca via WhatsApp quem ficou X minutos parado sem
-- concluir. Sem RLS: só o service role lê/escreve (igual às tabelas de
-- follow-up / debounce).

-- 1) Config por loja (na store_whatsapp)
alter table public.store_whatsapp
  add column if not exists ai_cart_minutes int not null default 0,
  add column if not exists ai_cart_message text;

comment on column public.store_whatsapp.ai_cart_minutes is
  'Minutos de carrinho parado até a IA mandar a recuperação. 0 = desativado.';
comment on column public.store_whatsapp.ai_cart_message is
  'Mensagem fixa de recuperação de carrinho. Vazio = a IA gera citando os itens.';

-- 2) Rascunhos de carrinho abandonado
create table if not exists public.whatsapp_abandoned_carts (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  -- Telefone já normalizado para o formato WhatsApp (DDI 55 + DDD + número).
  customer_phone text not null,
  customer_name text,
  -- Itens compactos: [{ name, quantity, price }]
  items jsonb not null default '[]'::jsonb,
  subtotal numeric(12,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Quando a IA mandou a mensagem de recuperação (null = ainda não).
  recovered_at timestamptz,
  -- Virou pedido de verdade (não cutuca mais).
  converted boolean not null default false,
  unique (store_id, customer_phone)
);

-- Sem policies: a tabela fica acessível só pelo service role.
alter table public.whatsapp_abandoned_carts enable row level security;

-- Índice para o cron varrer os rascunhos pendentes de cada loja.
create index if not exists whatsapp_abandoned_carts_due_idx
  on public.whatsapp_abandoned_carts (store_id, updated_at)
  where recovered_at is null and converted = false;
