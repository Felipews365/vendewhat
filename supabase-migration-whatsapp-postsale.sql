-- Execute no Supabase: Dashboard > SQL Editor > New Query
-- Pós-venda automático: alguns dias depois do pedido, a IA manda uma mensagem
-- perguntando se chegou tudo certinho. O prazo (em dias) é configurado por loja.

alter table public.store_whatsapp
  add column if not exists ai_postsale_days integer default 0 not null,   -- 0 = desativado
  add column if not exists ai_postsale_message text default '' not null;   -- vazio = a IA gera a mensagem

-- Marca quando o pós-venda já foi enviado para o pedido (evita repetir).
alter table public.orders
  add column if not exists postsale_sent_at timestamptz;

-- Acelera a varredura do cron (só os pedidos que ainda não receberam o pós-venda).
create index if not exists orders_postsale_pending_idx
  on public.orders (store_id, created_at)
  where postsale_sent_at is null;
