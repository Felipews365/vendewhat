-- Rode no Supabase: SQL Editor → New query → Run
-- Estoque por combinação cor + tamanho (JSON)

alter table public.products
  add column if not exists variant_stock jsonb default '[]'::jsonb;

select pg_notify('pgrst', 'reload schema');
