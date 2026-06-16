-- Visitas da loja pública (contador simples de acessos ao catálogo).
-- Execute no Supabase: SQL Editor > New query. Cole e rode TODO o ficheiro.
-- Idempotente: pode ser executado mais de uma vez sem erro.
--
-- Uma linha por acesso à página /loja/[slug]. A escrita é feita pela API
-- (service role); o dono lê (conta) as visitas da própria loja no painel.

create table if not exists public.store_visits (
  id uuid default gen_random_uuid() primary key,
  store_id uuid references public.stores(id) on delete cascade not null,
  created_at timestamptz not null default now()
);

create index if not exists store_visits_store_created_idx
  on public.store_visits (store_id, created_at desc);

alter table public.store_visits enable row level security;

-- O dono vê (conta) as visitas da própria loja. A inserção é só via service role.
drop policy if exists "Donos veem visitas da loja" on public.store_visits;
create policy "Donos veem visitas da loja"
  on public.store_visits for select
  using (
    store_id in (select id from public.stores where user_id = auth.uid())
  );

comment on table public.store_visits is
  'Uma linha por acesso à loja pública; gravada pela API com service role.';

select pg_notify('pgrst', 'reload schema');
