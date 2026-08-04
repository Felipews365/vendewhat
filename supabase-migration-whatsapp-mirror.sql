-- Execute este SQL no Supabase: Dashboard > SQL Editor > New Query
-- Espelho completo do WhatsApp na aba Conversas do painel:
--   * o que o DONO manda pelo celular também entra no histórico;
--   * fotos, áudios, vídeos, documentos, figurinhas e localização ficam visíveis;
--   * dá para importar o que a Evolution guardou de antes.
--
-- Nada aqui é obrigatório para o que já funciona: o código tolera as colunas
-- ausentes (só deixa de espelhar até a migration ser aplicada).

alter table public.whatsapp_messages
  -- `key.id` da mensagem no WhatsApp. É o que distingue o ECO das mensagens que
  -- nós mesmos enviamos (IA/painel) do que o dono digitou no celular: se o id já
  -- está gravado, aquele fromMe é nosso; se não, é o dono assumindo a conversa.
  add column if not exists wa_message_id text,
  -- Quem falou de verdade: customer | ai | owner. O `role` continua sendo o que
  -- vai para a OpenAI (user/assistant); `sender` é só para o painel mostrar
  -- "IA" x "Você".
  add column if not exists sender text,
  -- image | audio | video | document | sticker | location  (null = só texto)
  add column if not exists media_type text,
  -- URL pública do arquivo (bucket product-images, pasta whatsapp/).
  add column if not exists media_url text,
  -- Nome do arquivo mostrado no anexo (documentos).
  add column if not exists media_name text;

-- Um mesmo `key.id` só pode entrar uma vez por loja. É o que torna a gravação
-- idempotente: o webhook e a importação podem tentar inserir a mesma mensagem
-- sem duplicar o balão no painel.
--
-- ⚠️ Índice SEM `where wa_message_id is not null` de propósito: no Postgres dois
-- NULLs não colidem (então as mensagens antigas/sem id convivem à vontade), e um
-- índice PARCIAL não seria inferido pelo `on conflict (store_id, wa_message_id)`
-- que o supabase-js emite no upsert — a gravação passaria a falhar.
create unique index if not exists whatsapp_messages_wa_id_idx
  on public.whatsapp_messages (store_id, wa_message_id);

-- Limpeza por idade (retenção de ~30 dias) varre por created_at.
create index if not exists whatsapp_messages_created_idx
  on public.whatsapp_messages (created_at);
