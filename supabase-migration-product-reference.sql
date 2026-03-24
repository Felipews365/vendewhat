-- Referência / código do produto (opcional, exibido na vitrine)
-- Rode no Supabase → SQL Editor

alter table public.products
  add column if not exists product_reference text;

comment on column public.products.product_reference is 'Código ou referência opcional (SKU); exibido na loja como Ref.';

select pg_notify('pgrst', 'reload schema');
