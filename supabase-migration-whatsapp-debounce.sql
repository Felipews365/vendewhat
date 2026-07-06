-- Debounce/agrupamento de mensagens do atendente de IA no WhatsApp.
--
-- O webhook grava a mensagem do cliente e AGENDA uma resposta aqui
-- (respond_after = agora + alguns segundos), sem gerar nada na hora. Cada nova
-- mensagem do mesmo cliente reagenda (empurra o respond_after para frente), então
-- a resposta só sai depois que ele para de digitar. Um cron externo (~1 min)
-- chama /api/whatsapp/debounce, que responde às conversas cujo tempo venceu,
-- juntando todas as mensagens do lote numa única resposta.
--
-- Uma linha por (loja, cliente): o UPSERT com onConflict cuida do reagendamento.

create table if not exists whatsapp_pending_replies (
  store_id       uuid        not null references stores(id) on delete cascade,
  customer_phone text        not null,
  respond_after  timestamptz not null,
  created_at     timestamptz not null default now(),
  primary key (store_id, customer_phone)
);

-- O cron busca os vencidos ordenando por respond_after.
create index if not exists whatsapp_pending_replies_due_idx
  on whatsapp_pending_replies (respond_after);

-- Sem policies de acesso: a tabela é manipulada só pelo service role (webhook + cron).
alter table whatsapp_pending_replies enable row level security;
