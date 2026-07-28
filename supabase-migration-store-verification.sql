-- Verificação de identidade do dono da loja (KYC anti-golpe).
-- Execute no Supabase: SQL Editor > New query. Cole e rode TODO o ficheiro.
-- Idempotente: pode ser executado mais de uma vez sem erro.
--
-- O lojista envia dados pessoais + selfie + foto do documento (frente/verso).
-- O dono do SaaS (admin) revisa no painel e aprova/recusa. É só INFORMATIVO:
-- nada é bloqueado — serve para o admin identificar quem pode estar usando a
-- vitrine para golpe.
--
-- Os arquivos vão para um bucket PRIVADO (`verification-docs`): documentos de
-- identidade nunca podem ficar num bucket público. O admin vê por URL assinada
-- (service role); o lojista só envia (e vê o próprio, para conferir).

create table if not exists public.store_verifications (
  store_id uuid primary key references public.stores(id) on delete cascade,
  -- Dados pessoais do responsável pela loja
  full_name text,
  cpf text,               -- só dígitos
  birth_date date,
  -- Endereço do responsável
  cep text,
  street text,
  number text,
  complement text,
  neighborhood text,
  city text,
  uf text,
  -- Caminhos no bucket privado `verification-docs` (não são URLs públicas)
  selfie_path text,
  doc_front_path text,
  doc_back_path text,
  -- Fluxo de revisão
  status text not null default 'pending',  -- pending | approved | rejected
  review_notes text,
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.store_verifications enable row level security;

-- O dono só LÊ a própria verificação (para conferir status/o que já enviou).
-- A ESCRITA é só via service role (a rota de API grava status='pending'), então
-- o lojista não consegue se auto-aprovar mudando o status.
drop policy if exists "Donos veem a própria verificação" on public.store_verifications;
create policy "Donos veem a própria verificação"
  on public.store_verifications for select
  using (
    store_id in (select id from public.stores where user_id = auth.uid())
  );

comment on table public.store_verifications is
  'Verificação de identidade (KYC) do dono da loja; escrita só por service role.';

-- ── Bucket privado dos documentos ──────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('verification-docs', 'verification-docs', false)
on conflict (id) do nothing;

-- O lojista só mexe na PASTA dele (o 1º segmento do caminho = id da loja dele).
-- O admin lê tudo via service role (que ignora RLS), então não há policy de
-- SELECT pública aqui.
drop policy if exists "Donos enviam docs de verificação" on storage.objects;
create policy "Donos enviam docs de verificação"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'verification-docs'
    and (storage.foldername(name))[1] in (
      select id::text from public.stores where user_id = auth.uid()
    )
  );

drop policy if exists "Donos atualizam docs de verificação" on storage.objects;
create policy "Donos atualizam docs de verificação"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'verification-docs'
    and (storage.foldername(name))[1] in (
      select id::text from public.stores where user_id = auth.uid()
    )
  );

drop policy if exists "Donos veem docs de verificação" on storage.objects;
create policy "Donos veem docs de verificação"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'verification-docs'
    and (storage.foldername(name))[1] in (
      select id::text from public.stores where user_id = auth.uid()
    )
  );

select pg_notify('pgrst', 'reload schema');
