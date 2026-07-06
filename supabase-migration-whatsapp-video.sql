-- Vídeo da loja para o atendente de IA no WhatsApp.
--
-- Igual à foto (ai_store_photo_url), mas para um vídeo curto que a IA pode enviar
-- quando o cliente pede para ver a loja/os produtos. Guarda a URL pública do
-- arquivo (bucket product-images). A IA envia com sendMedia (mediatype "video").

alter table store_whatsapp
  add column if not exists ai_store_video_url text;
