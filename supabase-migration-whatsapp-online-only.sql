-- Loja só online (sem ponto físico) — WhatsApp/IA
--
-- Quando a loja marca que é 100% online, ela não tem endereço/foto/vídeo de
-- fachada. A IA passa a saber disso: se o cliente pedir localização, endereço
-- ou para visitar, ela explica que a loja é só online e direciona para o
-- catálogo — sem enviar pino do mapa, foto nem vídeo.

alter table public.store_whatsapp
  add column if not exists ai_online_only boolean not null default false;

comment on column public.store_whatsapp.ai_online_only is
  'Loja é só online (sem ponto físico). Quando true, a IA não envia localização/foto/vídeo e avisa que não há endereço.';
