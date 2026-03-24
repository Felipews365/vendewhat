-- Categoria opcional por produto (rótulo livre, ex.: "Vestidos").
-- Supabase → SQL Editor → executar; depois recarregar schema da API se necessário.

alter table public.products
  add column if not exists category text;

comment on column public.products.category is 'Nome da categoria do produto (opcional).';

select pg_notify('pgrst', 'reload schema');
