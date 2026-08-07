-- CRM: anotações, tarefas e automações (fase 4)
--
-- Execute no Supabase: SQL Editor > New query. Cole e rode TODO o ficheiro.
-- Idempotente: pode ser executado mais de uma vez sem erro.
-- Depende das fases 1 e 2.

-- ---------------------------------------------------------------------------
-- Anotações internas do cliente (só o lojista vê)
-- ---------------------------------------------------------------------------
create table if not exists public.crm_notes (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  customer_id uuid not null references public.crm_customers(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists crm_notes_cust_idx
  on public.crm_notes (store_id, customer_id, created_at desc);

comment on table public.crm_notes is
  'CRM: anotações internas por cliente. Nunca vão para o cliente.';

-- ---------------------------------------------------------------------------
-- Tarefas / lembretes
--
-- `customer_id` é NULLABLE de propósito: nem toda tarefa é sobre alguém
-- ("conferir estoque na terça"). `source` distingue o que o lojista escreveu do
-- que uma automação criou (manual | auto:<regra>).
-- ---------------------------------------------------------------------------
create table if not exists public.crm_tasks (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  customer_id uuid references public.crm_customers(id) on delete cascade,
  title text not null,
  due_at timestamptz not null,
  done_at timestamptz,
  source text not null default 'manual',
  created_at timestamptz not null default now()
);

-- A tela lista por "em aberto, mais vencida primeiro".
create index if not exists crm_tasks_due_idx
  on public.crm_tasks (store_id, done_at, due_at);
-- Evita a automação criar a mesma tarefa duas vezes para o mesmo cliente.
create index if not exists crm_tasks_auto_idx
  on public.crm_tasks (store_id, customer_id, source, done_at);

comment on table public.crm_tasks is
  'CRM: tarefas e lembretes. customer_id nulo = tarefa geral da loja.';

-- Leitura pelo dono (o painel lista direto pelo browser); escrita por /api.
alter table public.crm_notes enable row level security;
alter table public.crm_tasks enable row level security;

drop policy if exists "Donos veem anotacoes da loja" on public.crm_notes;
create policy "Donos veem anotacoes da loja" on public.crm_notes
  for select
  using (store_id in (select id from public.stores where user_id = auth.uid()));

drop policy if exists "Donos veem tarefas da loja" on public.crm_tasks;
create policy "Donos veem tarefas da loja" on public.crm_tasks
  for select
  using (store_id in (select id from public.stores where user_id = auth.uid()));

-- ---------------------------------------------------------------------------
-- Automações ligadas/desligadas por loja
--
-- Sem policy: quem lê é o cron (service role). O catálogo de regras é FIXO em
-- src/lib/crm/automations.ts — isto aqui guarda só o interruptor e o parâmetro
-- (ex.: quantos dias de silêncio). Não é um construtor de regras.
-- ---------------------------------------------------------------------------
create table if not exists public.crm_automations (
  store_id uuid not null references public.stores(id) on delete cascade,
  rule_id text not null,
  enabled boolean not null default false,
  params jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (store_id, rule_id)
);

alter table public.crm_automations enable row level security;

comment on table public.crm_automations is
  'CRM: interruptor por regra de automação. Catálogo fixo em src/lib/crm/automations.ts.';

select pg_notify('pgrst', 'reload schema');
