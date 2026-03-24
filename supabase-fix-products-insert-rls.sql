-- CORRIGE: produto não salva / "row-level security" ao cadastrar no painel.
-- Rode no Supabase → SQL Editor (mesmo projeto do .env).

alter table public.products enable row level security;

drop policy if exists "Donos podem inserir produtos na sua loja" on public.products;
create policy "Donos podem inserir produtos na sua loja"
  on public.products for insert
  with check (
    store_id in (select id from public.stores where user_id = auth.uid())
  );

drop policy if exists "Donos podem editar produtos da sua loja" on public.products;
create policy "Donos podem editar produtos da sua loja"
  on public.products for update
  using (
    store_id in (select id from public.stores where user_id = auth.uid())
  );

drop policy if exists "Donos podem deletar produtos da sua loja" on public.products;
create policy "Donos podem deletar produtos da sua loja"
  on public.products for delete
  using (
    store_id in (select id from public.stores where user_id = auth.uid())
  );

select pg_notify('pgrst', 'reload schema');
