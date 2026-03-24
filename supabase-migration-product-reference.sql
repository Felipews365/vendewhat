-- Referência / código do produto (opcional, exibido na vitrine)
-- Supabase → SQL Editor → colar e executar TUDO de uma vez.
--
-- Se o erro "schema cache" continuar: Dashboard → Settings → API →
-- "Reload schema" (ou Project Settings → pausar e retomar o projeto).
--
-- Confirme que a coluna existe (deve devolver uma linha):
-- select column_name from information_schema.columns
-- where table_schema = 'public' and table_name = 'products' and column_name = 'product_reference';

alter table public.products
  add column if not exists product_reference text;

comment on column public.products.product_reference is 'Código ou referência opcional (SKU); exibido na loja como Ref.';

select pg_notify('pgrst', 'reload schema');
-- Alguns projetos: também dispare o NOTIFY nativo (redundante, inofensivo se duplicar)
notify pgrst, 'reload schema';
