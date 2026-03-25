-- Enquadramento por foto (arraste no painel): array JSON alinhado a `products.images`.
-- Cada elemento: {"x":0-100,"y":0-100} → CSS object-position.

alter table public.products
  add column if not exists image_object_positions jsonb default '[]'::jsonb;

comment on column public.products.image_object_positions is
  'Foco por índice de `images`: [{"x":50,"y":50},...] para object-position em % (arraste no painel).';

select pg_notify('pgrst', 'reload schema');
