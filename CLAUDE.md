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
  - `dashboard/` — painel do lojista (produtos, pedidos, conta, configurações, compartilhar)
  - `loja/[slug]/` — página pública da loja
  - `api/` — rotas de API (auth, orders)
- `src/lib/supabase/` — clients do Supabase: `client.ts` (browser), `server.ts` (server), `admin.ts` (service role)
- `src/components/` — componentes React
- `*.sql` na raiz — migrations manuais do Supabase

## Supabase

- **Project URL:** `https://dbtoinsifpevufbtwyzu.supabase.co`
- **Tabelas principais:** `stores`, `products`, `orders`
- **Storage bucket:** `product-images`
- **Variáveis de ambiente** (`.env` local / Vercel):
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY` (chave publishable/anon — pública)
  - `SUPABASE_SERVICE_ROLE_KEY` (opcional, **nunca** expor no frontend)
- O `.env` **não** sobe pro git (está no `.gitignore`).

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
