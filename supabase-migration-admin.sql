-- Painel do Admin (dono do SaaS): planos editáveis, assinaturas e pagamentos.
-- Execute no Supabase: SQL Editor > New query. Cole e rode TODO o ficheiro de uma vez.
--
-- Idempotente: pode ser executado mais de uma vez sem erro.
-- Leitura cross-tenant (admin vê tudo) é feita no app via service role; a RLS aqui
-- só libera para o lojista a leitura da PRÓPRIA assinatura. Escrita é só service role.

-- =====================================================================
-- 1) PLANOS (catálogo editável pelo painel admin)
-- =====================================================================
create table if not exists public.plans (
  id text primary key,
  title text not null,
  description text,
  monthly numeric(10, 2) not null default 0,
  features text[] not null default '{}',
  accent text not null default 'pink',     -- pink | cyan | purple
  icon text not null default 'bolt',        -- bolt | star | briefcase
  highlight boolean not null default false,
  sort_order int not null default 0,
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

-- Seed dos 3 planos atuais (não sobrescreve se já existirem)
insert into public.plans (id, title, description, monthly, features, accent, icon, highlight, sort_order)
values
  (
    'essencial',
    'Sem IA',
    'A vitrine essencial para sua loja aparecer bem e vender mais.',
    89.90,
    array[
      'Vitrine da loja',
      'Catálogo de produtos',
      'Link para WhatsApp',
      'Página de contato',
      'Localização da loja',
      'Suporte básico'
    ],
    'pink', 'bolt', false, 0
  ),
  (
    'profissional',
    'IA Completo',
    'Atendimento inteligente com IA para responder rápido e vender melhor.',
    499.90,
    array[
      'Tudo do plano Sem IA',
      'IA para tirar dúvidas dos clientes',
      'Respostas sobre valores e produtos',
      'Envio do link do catálogo',
      'Envio de catálogo em PDF',
      'Localização da loja pela IA',
      'Até 1.000 conversas com clientes por mês',
      'Ideal para atendimento frequente'
    ],
    'cyan', 'star', true, 1
  ),
  (
    'empresarial',
    'IA Sob Medida',
    'IA personalizada para o seu negócio, com pagamento por uso.',
    349.90,
    array[
      'Ajustes personalizados nas respostas',
      'Treinamento com dados da sua loja',
      'Configuração mais fina do fluxo',
      'Integrações específicas',
      'Suporte mais próximo',
      'Créditos pré-pagos para uso da IA',
      'Recarrega quando quiser, a partir de R$ 30',
      'Controle total do seu custo'
    ],
    'purple', 'briefcase', false, 2
  )
on conflict (id) do nothing;

alter table public.plans enable row level security;

-- Planos são públicos (landing + painel exibem)
drop policy if exists "Planos são públicos" on public.plans;
create policy "Planos são públicos"
  on public.plans for select
  using (true);
-- Sem policy de insert/update: só o service role escreve (via API admin).

-- =====================================================================
-- 2) ASSINATURAS (1 por loja)
-- =====================================================================
create table if not exists public.subscriptions (
  id uuid default gen_random_uuid() primary key,
  store_id uuid references public.stores(id) on delete cascade not null unique,
  plan_id text references public.plans(id),
  status text not null default 'trial',         -- trial | active | past_due | canceled | expired
  billing_cycle text not null default 'monthly', -- monthly | annual
  amount numeric(10, 2),                          -- valor cobrado (pode divergir do plano)
  started_at timestamptz default now(),
  expires_at timestamptz,                         -- o "vencimento"
  notes text,
  -- preparado para o Mercado Pago (fase 2): fica nulo por enquanto
  gateway text,
  gateway_customer_id text,
  gateway_subscription_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists subscriptions_expires_idx
  on public.subscriptions (expires_at);
create index if not exists subscriptions_status_idx
  on public.subscriptions (status);

alter table public.subscriptions enable row level security;

-- Lojista lê apenas a própria assinatura. Escrita só via service role.
drop policy if exists "Dono lê a própria assinatura" on public.subscriptions;
create policy "Dono lê a própria assinatura"
  on public.subscriptions for select
  using (
    store_id in (select id from public.stores where user_id = auth.uid())
  );

-- =====================================================================
-- 3) PAGAMENTOS (histórico de pagamentos, hoje manuais)
-- =====================================================================
create table if not exists public.payments (
  id uuid default gen_random_uuid() primary key,
  store_id uuid references public.stores(id) on delete cascade not null,
  amount numeric(10, 2) not null,
  method text,                  -- pix | manual | mercadopago
  paid_at timestamptz default now(),
  period_end timestamptz,       -- até quando este pagamento estende o vencimento
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists payments_store_paid_idx
  on public.payments (store_id, paid_at desc);

alter table public.payments enable row level security;

drop policy if exists "Dono lê os próprios pagamentos" on public.payments;
create policy "Dono lê os próprios pagamentos"
  on public.payments for select
  using (
    store_id in (select id from public.stores where user_id = auth.uid())
  );

comment on table public.plans is 'Catálogo de planos editável pelo painel admin; leitura pública.';
comment on table public.subscriptions is 'Assinatura por loja; escrita só por service role (painel admin).';
comment on table public.payments is 'Histórico de pagamentos (hoje manuais); escrita só por service role.';

select pg_notify('pgrst', 'reload schema');
