-- Localização da loja (pino do mapa) e foto do estabelecimento que a IA pode
-- enviar no WhatsApp. Tudo por loja, em store_whatsapp.
--
-- - ai_location_address: endereço de onde a loja fica (pode ser igual ou
--   diferente do endereço de retirada do storefront). Vazio = usa o de retirada.
-- - ai_location_lat / ai_location_lng: coordenadas para o pino nativo do
--   WhatsApp (extraídas de um link do Google Maps no painel).
-- - ai_location_url: o link do mapa colado pelo lojista (para reexibir/editar).
-- - ai_store_photo_url: foto da loja/fachada que a IA envia quando o cliente pede.

alter table store_whatsapp
  add column if not exists ai_location_address text,
  add column if not exists ai_location_lat double precision,
  add column if not exists ai_location_lng double precision,
  add column if not exists ai_location_url text,
  add column if not exists ai_store_photo_url text;
