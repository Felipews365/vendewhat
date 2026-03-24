-- CORRIGE: "Loja não encontrada" na URL pública OU catálogo sem produtos.
-- Causa comum: Row Level Security (RLS) sem política de SELECT para visitantes (anon).
-- Rode no Supabase → SQL Editor (projeto igual ao .env do site / Vercel).

-- Lojas: qualquer um pode ver (catálogo público)
drop policy if exists "Usuários podem ver qualquer loja" on public.stores;
create policy "Usuários podem ver qualquer loja"
  on public.stores for select
  using (true);

-- Produtos: qualquer um pode ler (o app filtra active = true)
drop policy if exists "Qualquer um pode ver produtos ativos" on public.products;
create policy "Qualquer um pode ver produtos ativos"
  on public.products for select
  using (true);

select pg_notify('pgrst', 'reload schema');
