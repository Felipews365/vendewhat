# CLAUDE.md

Orientações para o Claude Code trabalhar neste repositório.

## O que é o projeto

**VendeWhat** (`vendemais` no Supabase) — plataforma de e-commerce para quem vende pelo WhatsApp: catálogo digital, pedidos organizados e um link de loja para compartilhar com clientes.

## Stack

- **Next.js 14** (App Router) + **React 18** + **TypeScript**
- **Tailwind CSS**
- **Supabase** (Auth + PostgreSQL + Storage) — pacotes `@supabase/ssr` e `@supabase/supabase-js`
- Deploy na **Vercel**

## Comandos

- `npm run dev` — servidor de desenvolvimento (usa **Turbopack** `--turbo`)
- `npm run dev:webpack` — dev com Webpack (para comparar)
- `npm run dev:fresh` — limpa `.next` e inicia o dev
- `npm run build` — build de produção
- `npm run start` — servidor de produção (após build)
- `npm run lint` — ESLint
- `npm run clean` — apaga a pasta `.next`

## Estrutura

- `src/app/` — rotas (App Router)
  - `dashboard/` — painel do lojista (produtos, pedidos, conta, configurações, compartilhar, WhatsApp & IA)
  - `loja/[slug]/` — página pública da loja
  - `admin/` — painel do dono do SaaS (route group `(panel)` + `login`)
  - `api/` — rotas de API (auth, orders, whatsapp, admin)
- `src/lib/supabase/` — clients do Supabase: `client.ts` (browser), `server.ts` (server), `admin.ts` (service role)
- `src/components/` — componentes React
- `*.sql` na raiz — migrations manuais do Supabase

## UI do painel (layout, tema, animações)

- **Layout do dashboard:** [src/components/dashboard/DashboardLayoutClient.tsx](src/components/dashboard/DashboardLayoutClient.tsx)
  (usado por [src/app/dashboard/layout.tsx](src/app/dashboard/layout.tsx)). Navegação por
  ícones **no topo** (desktop, `lg+`) e numa **barra inferior fixa** (celular). Editar
  `DASH_NAV` lá muda os itens do menu. Rotas "imersivas" (`/dashboard/produtos/novo` e
  `/dashboard/produtos/[id]`) têm barra de ações própria no rodapé, então a navegação
  inferior é escondida nelas (`isImmersiveRoute`).
- **Tema claro/escuro:** Tailwind com `darkMode: "class"` ([tailwind.config.ts](tailwind.config.ts)).
  Botão [src/components/ThemeToggle.tsx](src/components/ThemeToggle.tsx) alterna a classe `dark`
  no `<html>` e salva em `localStorage` (`vw-theme`). Um script anti-flash em
  [src/app/layout.tsx](src/app/layout.tsx) aplica o tema antes do render. Ao estilizar telas do
  painel, **sempre adicionar variantes `dark:`** (ex.: `bg-white dark:bg-slate-900`).
- **Animações:** keyframes/utilitários (`vw-fade-in-up`, `vw-pop-in`, `vw-aurora`) em
  [src/app/globals.css](src/app/globals.css); respeitam `prefers-reduced-motion`.
- **Pendente:** os widgets internos compartilhados ainda estão só no tema claro — editor visual
  da loja ([StoreVisualEditor.tsx](src/components/dashboard/StoreVisualEditor.tsx), cuja
  pré-visualização da loja pública deve continuar clara de propósito), seletor de fotos,
  editores de cor/tamanho/estoque, autocomplete de categoria e os modais.

## Supabase

- **Project URL:** `https://dbtoinsifpevufbtwyzu.supabase.co`
- **Tabelas principais:** `stores`, `products`, `orders`, `store_whatsapp`, `whatsapp_messages`,
  `plans`, `subscriptions`, `payments`
- **Storage bucket:** `product-images`
- **Variáveis de ambiente** (`.env` local / Vercel):
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY` (chave publishable/anon — pública)
  - `SUPABASE_SERVICE_ROLE_KEY` (opcional para pedidos; **obrigatória** para o painel admin; **nunca** expor no frontend)
  - `ADMIN_EMAILS` (e-mails autorizados em `/admin`, separados por vírgula)
- O `.env` **não** sobe pro git (está no `.gitignore`).

## Painel do Admin (dono do SaaS)

Área em `/admin` para você (dono) gerenciar os lojistas-clientes: ver todos, seus planos,
status e **vencimento**, mudar valores/planos e registrar pagamentos manuais. O gateway
**Mercado Pago** está previsto para a fase 2 (cobrança automática); por enquanto o controle
de pagamento/vencimento é **manual**.

- **Migration:** rode [supabase-migration-admin.sql](supabase-migration-admin.sql)
  (cria `plans`, `subscriptions`, `payments`; semeia os 3 planos atuais).
- **Acesso:** login **próprio e separado** em `/admin/login` (não passa pelo painel da loja),
  identificado por e-mail via `ADMIN_EMAILS`. As páginas do painel ficam no route group
  `src/app/admin/(panel)/*` (layout protegido por `requireAdmin`); o middleware
  ([src/middleware.ts](src/middleware.ts)) protege `/admin/*` (exceto `/admin/login`) e
  redireciona não-admins para `/admin/login`.
- **Libs:** [src/lib/admin.ts](src/lib/admin.ts) (`isAdminEmail`, `requireAdmin`),
  [src/lib/adminData.ts](src/lib/adminData.ts) (leitura cross-tenant via service role),
  [src/lib/plans.server.ts](src/lib/plans.server.ts) (`loadPlans` com fallback p/ `plans.ts`).
- **Rotas:** login em `src/app/admin/login/`; painel em `src/app/admin/(panel)/*`; APIs em
  `src/app/api/admin/{login,subscriptions,payments,plans}/route.ts` (cada uma valida admin
  e escreve via service role).
- **Planos editáveis:** os preços/recursos saíram do estático `plans.ts` para a tabela `plans`.
  A landing (`/`) e `/dashboard/planos` leem do banco via `loadPlans()`; `plans.ts` vira fallback.

## Atendimento por IA no WhatsApp (Evolution API)

Cada loja conecta o próprio WhatsApp via **QR Code** em `/dashboard/whatsapp` (usando a
**Evolution API**) e uma IA (**OpenAI gpt-4o-mini**) atende os clientes, tira dúvidas
(catálogo + FAQ que o lojista configura) e envia o link da loja para a compra. Multi-tenant:
uma instância Evolution e uma config de IA por loja.

- **Migration:** rode [supabase-migration-whatsapp.sql](supabase-migration-whatsapp.sql)
  (cria `store_whatsapp` e `whatsapp_messages`).
- **Libs:** [src/lib/evolution.ts](src/lib/evolution.ts) (wrapper REST da Evolution),
  [src/lib/whatsappConfig.ts](src/lib/whatsappConfig.ts) (config/histórico),
  [src/lib/ai/attendant.ts](src/lib/ai/attendant.ts) (OpenAI).
- **Rotas:** `src/app/api/whatsapp/{connect,status,disconnect,config,webhook}/route.ts`.
  O `webhook` é público e validado por um `token` por loja (query string).
- **Variáveis de ambiente extras** (`.env` local / Vercel):
  - `EVOLUTION_API_URL` — base da Evolution (ex.: `https://evo.seudominio.com`)
  - `EVOLUTION_API_KEY` — apikey global da Evolution
  - `OPENAI_API_KEY` — chave da OpenAI
  - `OPENAI_MODEL` — opcional; default `gpt-4o-mini`
  - `APP_BASE_URL` — URL pública do app (monta o link da loja e a URL do webhook;
    o webhook roda no servidor, então não dá pra usar `window.location`). Em dev, use
    um túnel (cloudflared/ngrok) pois a Evolution precisa alcançar o app.

### Keep-alive (evitar pausa do plano Free)

O Supabase Free pausa o projeto após **7 dias** de inatividade. Para evitar isso há um
GitHub Action em [.github/workflows/supabase-keep-alive.yml](.github/workflows/supabase-keep-alive.yml)
que faz um `SELECT` leve na tabela `stores` **a cada 2 dias** (e pode ser disparado manualmente em
Actions → Run workflow).

- Usa os secrets do repositório: `SUPABASE_URL` e `SUPABASE_ANON_KEY` (já cadastrados no GitHub).
- Se um dia precisar mudar a frequência, edite o `cron` no arquivo do workflow.

## Notas do ambiente (Windows / OneDrive)

O repositório fica dentro do **OneDrive**, o que pode quebrar symlinks da pasta `.next` e causar
erros tipo `Cannot find module './276.js'`, `EINVAL readlink` ou `.next\package.json`.

- `npm run dev` já usa Turbopack, que evita boa parte desses erros.
- Se travar: `Ctrl+C`, depois `npm run dev:fresh`.
- Solução de longo prazo: mover o repo para fora do OneDrive (ex.: `C:\dev\vendewhat`).

## Deploy (Vercel)

Detalhes completos no [README.md](README.md). Pontos críticos:

- Configurar `NEXT_PUBLIC_SUPABASE_*` nas Environment Variables da Vercel.
- No Supabase → Authentication → URL Configuration: ajustar **Site URL** e **Redirect URLs**
  para a URL de produção, senão login/cookies falham.
