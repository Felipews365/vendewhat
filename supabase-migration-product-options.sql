-- Rode no Supabase: SQL Editor → New query → Run
-- Opções de cor e tamanho por produto (arrays JSON)

alter table public.products
  add column if not exists colors jsonb default '[]'::jsonb;

alter table public.products
  add column if not exists sizes jsonb default '[]'::jsonb;

select pg_notify('pgrst', 'reload schema');
