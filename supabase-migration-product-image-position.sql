-- Enquadramento da foto principal no catálogo (card). Modal da loja mostra fotos completas (object-contain).
-- Supabase → SQL Editor → Run. Depois: reload schema se necessário.

alter table public.products
  add column if not exists image_object_position text;

comment on column public.products.image_object_position is
  'object-position da 1.ª foto nos cards (center, top, bottom, …). Ver src/lib/productImagePosition.ts';

select pg_notify('pgrst', 'reload schema');
notify pgrst, 'reload schema';
