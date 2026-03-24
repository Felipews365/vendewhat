-- Execute este SQL no Supabase: Dashboard > SQL Editor > New Query

-- Tabela de lojas
create table public.stores (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null unique,
  name text not null,
  slug text not null unique,
  description text,
  logo text,
  phone text,
  storefront jsonb default '{}'::jsonb,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- Tabela de produtos
create table public.products (
  id uuid default gen_random_uuid() primary key,
  store_id uuid references public.stores(id) on delete cascade not null,
  name text not null,
  description text,
  price decimal(10,2) not null,
  image text,
  images jsonb default '[]'::jsonb,
  colors jsonb default '[]'::jsonb,
  sizes jsonb default '[]'::jsonb,
  variant_stock jsonb default '[]'::jsonb,
  stock int default 0 not null,
  active boolean default true not null,
  is_promotion boolean default false not null,
  compare_at_price decimal(10,2),
  category text,
  product_reference text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- Habilitar RLS (Row Level Security)
alter table public.stores enable row level security;
alter table public.products enable row level security;

-- Políticas de segurança para stores
create policy "Usuários podem ver qualquer loja"
  on public.stores for select
  using (true);

create policy "Usuários podem criar sua própria loja"
  on public.stores for insert
  with check (auth.uid() = user_id);

create policy "Usuários podem editar sua própria loja"
  on public.stores for update
  using (auth.uid() = user_id);

-- Políticas de segurança para products
create policy "Qualquer um pode ver produtos ativos"
  on public.products for select
  using (true);

create policy "Donos podem inserir produtos na sua loja"
  on public.products for insert
  with check (
    store_id in (select id from public.stores where user_id = auth.uid())
  );

create policy "Donos podem editar produtos da sua loja"
  on public.products for update
  using (
    store_id in (select id from public.stores where user_id = auth.uid())
  );

create policy "Donos podem deletar produtos da sua loja"
  on public.products for delete
  using (
    store_id in (select id from public.stores where user_id = auth.uid())
  );
