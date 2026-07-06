-- Vídeo do produto
--
-- Cada produto pode ter um vídeo curto (URL pública no bucket product-images),
-- exibido no detalhe do produto na loja pública. Sem tabela nova: só uma coluna.

alter table public.products
  add column if not exists video_url text;

comment on column public.products.video_url is
  'URL pública do vídeo do produto (bucket product-images). Null = sem vídeo.';
