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
- **Avisos flutuantes (toast):** [src/components/Toast.tsx](src/components/Toast.tsx) expõe
  `ToastProvider` (montado no [layout raiz](src/app/layout.tsx), cobre painel + admin + loja) e o
  hook `useToast()` → `showToast(mensagem, "success" | "error")`. Ao criar uma nova tela que salva,
  chame `showToast("... salvo!")` no sucesso para manter o feedback consistente (já usado em
  categoria, configurações, produtos, WhatsApp e admin).
- **Imagens prontas de categoria:** [src/lib/categoryPresets.ts](src/lib/categoryPresets.ts) tem
  `CATEGORY_PRESETS` (emoji + cor) e `emojiCategoryImage()`, que gera um SVG embutido (data URI)
  usado como `imageUrl` da categoria — sem hospedagem. A galeria fica no
  [CategoryFormModal.tsx](src/components/CategoryFormModal.tsx) (variant `store`), ao lado do upload
  e do campo de URL.
- **Categorias salvam na hora:** no editor da loja, salvar/excluir uma categoria pelo modal
  **persiste imediatamente** (não espera o "Salvar loja"). As categorias moram no JSONB
  `storefront.categories`; o `onSave`/`onDelete` em
  [StoreVisualEditor.tsx](src/components/dashboard/StoreVisualEditor.tsx) atualiza o estado `sf` **e**
  chama a prop `onAutoSaveStorefront`, implementada por `autoSaveStorefront` em
  [configuracoes/page.tsx](src/app/dashboard/configuracoes/page.tsx) (grava o `storefront` em
  `stores` na hora e recarrega a prévia). O toast "Categoria salva!" vem do modal; o auto-save só
  avisa em caso de erro. O resto da vitrine (banner, cores, logo, rodapé…) continua só no "Salvar
  loja". Produtos têm página própria (`/dashboard/produtos/[id]` e `/novo`) com seu próprio Salvar,
  independente disso. A **ordem** das categorias = ordem do array `storefront.categories` (vale na
  prévia e na loja pública); no painel "Categorias" cada item tem setas **▲/▼** (`moveStoreCategory`
  em [StoreVisualEditor.tsx](src/components/dashboard/StoreVisualEditor.tsx)) que trocam a posição e
  **salvam na hora** (via `onAutoSaveStorefront`, igual salvar/excluir).
- **Banner da loja (um carrossel só):** o banner é **uma lista única de fotos**
  (`storefront.heroImages: string[]` em [src/lib/storefront.ts](src/lib/storefront.ts)) que
  passam **uma atrás da outra** (1→2→…) no mesmo lugar — não há faixas empilhadas. Renderizado por
  `HeroBannerBlock` em [LojaClient.tsx](src/app/loja/[slug]/LojaClient.tsx) (auto-avança; setas +
  bolinhas; o título/subtítulo/CTA ficam por cima). Sem foto = sem banner. O **número de fotos**
  depende do plano: `bannerPhotoLimitForPlan()` → plano mais barato 5, demais 10 (teto absoluto
  `MAX_BANNER_PHOTOS_ABS`). O editor
  ([StoreVisualEditor.tsx](src/components/dashboard/StoreVisualEditor.tsx), painel `banner`) lista as
  fotos numeradas. Ao escolher cada foto, abre o **ajuste/recorte** no formato do banner
  ([ProductImageCropModal.tsx](src/components/ProductImageCropModal.tsx), generalizado com `aspect` —
  aqui `HERO_TARGET_RATIO`; o mesmo modal recorta 1:1 nas fotos de produto). Depois do recorte o
  **upload é imediato** (vai pro bucket `product-images`, em
  [configuracoes/page.tsx](src/app/dashboard/configuracoes/page.tsx) → `selectHeroPhotos` →
  `uploadOneHeroPhoto`), então o "Salvar" só persiste as URLs no JSONB. `storefrontFromDb` migra
  formatos antigos (`heroCarousels` faixas → achata numa lista; `heroImage` foto única). Mostra dica
  de tamanho ideal (1920×600) e avisa por foto quando a proporção vai cortar muito
  (`heroImageProportionWarning`).
- **Pendente:** os widgets internos compartilhados ainda estão só no tema claro — editor visual
  da loja ([StoreVisualEditor.tsx](src/components/dashboard/StoreVisualEditor.tsx), cuja
  pré-visualização da loja pública deve continuar clara de propósito), seletor de fotos,
  editores de cor/tamanho/estoque, autocomplete de categoria e os modais.

## Loja pública — carrinho e formas de envio

O checkout fica no carrinho de [src/app/loja/[slug]/LojaClient.tsx](src/app/loja/[slug]/LojaClient.tsx).
As **formas de envio** estão em [src/lib/shippingModes.ts](src/lib/shippingModes.ts)
(`SHIPPING_MODES`: excursão, correios, retirada) e definem campos extras no carrinho:

- **Excursão / Correios** → o cliente preenche o **endereço de entrega** (CEP, rua, número,
  bairro, cidade, UF, complemento). Validação em `addressComplete`; o **CEP é obrigatório só no
  Correios** (`cepRequired` + 8 dígitos). O endereço entra na mensagem do WhatsApp
  (`*Endereço de entrega:*`) e no `payload.customerAddress` do pedido.
- **Excursão** → além do endereço, exige o **nome da excursão** (`excursionName`, validado por
  `excursionComplete`). Vai na mensagem do WhatsApp (`*Excursão:*`) e em `payload.excursionName`.
  A liberação dos botões de finalizar usa `checkoutReady` (junta nome, telefone, forma de envio,
  endereço quando aplicável e nome da excursão).
- **Retirada** → mostra o **endereço da loja** (`storefront.pickupAddress`), configurado no editor
  da vitrine ([StoreVisualEditor.tsx](src/components/dashboard/StoreVisualEditor.tsx), painel
  "Rodapé da vitrine"). Se vazio, exibe aviso de combinar pelo WhatsApp.

**Pix na mensagem do WhatsApp:** se a loja preencher a **chave Pix** (`storefront.pixKey` + titular
`pixName`, no mesmo painel "Rodapé da vitrine"), a mensagem do **Enviar pedido no WhatsApp**
(`buildOrderMessage` em LojaClient) termina com a chave para o cliente pagar e enviar o comprovante.
Sem migration: mora no JSONB `stores.storefront`. É o fluxo de pagamento dos pedidos que **não**
passam pelo Mercado Pago.

O endereço e o nome da excursão aparecem no painel em
[/dashboard/pedidos](src/app/dashboard/pedidos/page.tsx) (tela e comprovante impresso). Não há
migration: `pickupAddress` mora no JSONB `stores.storefront` e os dados do cliente
(`customerAddress`, `excursionName`) no `orders.payload` (ver
[src/app/api/orders/route.ts](src/app/api/orders/route.ts)).

### Impressão de pedidos

A página de pedidos tem **Imprimir** (por pedido), **Imprimir todos** (no topo) e um botão
**Selecionar** que entra no *modo de seleção*: aparece um checkbox em cada card e uma barra com
"Selecionar todos"/"Limpar", o contador e **Imprimir selecionados (N)** (estados `selectMode` e
`selectedIds: Set<string>`; `printSelected` filtra os visíveis marcados). Os três caminhos chamam
`printReceipts()` em [src/app/dashboard/pedidos/page.tsx](src/app/dashboard/pedidos/page.tsx),
que abre uma janela `window.open` com um recibo montado em HTML/CSS próprios (string em
`PRINT_STYLES` + `buildReceiptHtml`), independente do tema escuro do painel. A janela mostra uma
**pré-visualização** com barra "Imprimir"/"Fechar" (escondida no `@media print`); no modo "todos"
cada pedido vai numa página separada (`page-break-before`). O cabeçalho usa a **logo** (`stores.logo`)
e os dados da loja do `storefront` (`footerPhone`, `footerEmail`, `footerWebsite`, `pickupAddress`) —
cada linha só aparece se preenchida. Não há migration nova.

### Painel de pedidos (status, pagamento, filtros)

Em [/dashboard/pedidos](src/app/dashboard/pedidos/page.tsx):

- **Abas Em aberto × Finalizados** (com contador), **seletor de dia** (`Dia:`) e **agrupamento por
  dia** (cabeçalhos "Hoje"/"Ontem"/data por extenso — `dayLabel`/`dayKey`). O status de atendimento
  usa `orders.status` (`"novo"` = em aberto; `"finalizado"`).
- **Marcar finalizado / reabrir** e **marcar pago / não pago** chamam
  [/api/orders/update](src/app/api/orders/update/route.ts), que autentica o dono (server client) e
  escreve via **service role** (a tabela `orders` só tem policy de SELECT). Pagamento confirmado na
  mão grava `payment_provider='manual'`; quem veio do gateway mantém `'mercadopago'`.
- **Selo de pagamento** (`paymentInfo`): "Pago pelo Mercado Pago" / "Pago (confirmado pela loja)"
  (verde), pendente/falhou (amarelo/vermelho). Só aparece quando há `payment_provider` — pedidos só
  de WhatsApp sem confirmação não mostram selo. Também sai no comprovante impresso.

Sem migration nova: usa `orders.status` e as colunas de pagamento do
[supabase-migration-mercadopago.sql](supabase-migration-mercadopago.sql).

### Números do painel inicial e visitas

[/dashboard/page.tsx](src/app/dashboard/page.tsx) mostra **Produtos**, **Pedidos**, **Vendas hoje**
(soma de `orders.subtotal` do dia) e **Visitas** — todos consultados no banco (antes eram fixos em
"0"). As **visitas** vêm da tabela `store_visits` (uma linha por acesso à loja pública): a página
pinga [/api/loja/visit](src/app/api/loja/visit/route.ts) no carregamento (`LojaClient`, uma vez por
load via `useRef`, gravação por service role). Migration:
[supabase-migration-store-visits.sql](supabase-migration-store-visits.sql).

## Supabase

- **Project URL:** `https://dbtoinsifpevufbtwyzu.supabase.co`
- **Tabelas principais:** `stores`, `products`, `orders`, `store_whatsapp`, `whatsapp_messages`,
  `plans`, `subscriptions`, `payments`, `store_payment_gateway`, `store_visits`
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
- **Rotas:** `src/app/api/whatsapp/{connect,status,disconnect,config,webhook,pause,followups}/route.ts`.
  O `webhook` é público e validado por um `token` por loja (query string); o `followups` (cron) é
  protegido por `CRON_SECRET`.
- **Apresentação no 1º contato:** na primeira mensagem de cada cliente a IA se apresenta com o
  **nome do atendente** (`ai_name`) + **nome da loja** e depois não repete. O webhook detecta o
  primeiro contato por `getRecentHistory(...).length === 0` (lido **antes** de gravar a mensagem
  nova) e passa `isFirstContact` para `buildSystemPrompt` em
  [src/lib/ai/attendant.ts](src/lib/ai/attendant.ts).
- **Variáveis de ambiente extras** (`.env` local / Vercel):
  - `EVOLUTION_API_URL` — base da Evolution (ex.: `https://evo.seudominio.com`)
  - `EVOLUTION_API_KEY` — apikey global da Evolution
  - `OPENAI_API_KEY` — chave da OpenAI
  - `OPENAI_MODEL` — opcional; default `gpt-4o-mini`
  - `APP_BASE_URL` — URL pública do app (monta o link da loja e a URL do webhook;
    o webhook roda no servidor, então não dá pra usar `window.location`). Em dev, use
    um túnel (cloudflared/ngrok) pois a Evolution precisa alcançar o app.
  - `CRON_SECRET` — segredo que protege o endpoint de follow-up (ver subseção abaixo). Também
    precisa estar nos **secrets do GitHub** (junto de `APP_BASE_URL`) para o workflow do cron.

### Pausar o atendimento da IA (assumir a conversa)

O lojista pode pausar a IA quando quiser, em `/dashboard/whatsapp` (seção **Pausar atendimento**).
Tudo por loja. **Migration:** rode
[supabase-migration-whatsapp-pause.sql](supabase-migration-whatsapp-pause.sql) (adiciona
`ai_paused`, `ai_paused_until`, `ai_handoff_minutes` em `store_whatsapp` e cria a tabela
`whatsapp_pauses` — chave `(store_id, customer_phone)`).

- **Pausa global** (todos os clientes): `store_whatsapp.ai_paused` + `ai_paused_until` (ISO; `null`
  = até a loja reativar). `globalPauseActive()` em
  [src/lib/whatsappConfig.ts](src/lib/whatsappConfig.ts) considera a expiração.
- **Pausa por cliente**: linha em `whatsapp_pauses` (`paused_until` `null` = indefinido). A simples
  existência da linha = pausado; `isCustomerPaused()` **limpa a linha** quando expira, então o
  retorno acontece no tempo certo **sem job agendado** (lazy cleanup no próximo evento). Também há
  limpeza preguiçosa no `GET /api/whatsapp/pause` (lista) e da pausa global.
- **Handoff ("quando a loja fala, a IA pausa")**: `ai_handoff_minutes` (0 = desativado). No
  [webhook](src/app/api/whatsapp/webhook/route.ts), uma mensagem `fromMe` que **não** seja o eco da
  própria IA (comparada com `getLastAssistantMessages`) é tratada como o dono respondendo → cria
  uma pausa `reason='handoff'` daquele cliente por X minutos. Necessário porque a Evolution assina
  `MESSAGES_UPSERT` e reflete também as mensagens enviadas pela API.
- **Onde o webhook checa**: só responde se a IA está ligada (`aiEnabled`), **não** há pausa global
  ativa e **não** há pausa do cliente.
- **API/UI:** `src/app/api/whatsapp/pause/route.ts` (`GET` lista estado **+ conversas recentes**;
  `POST` com `{action: pause|resume, scope: global|customer, phone?, minutes?}` — `minutes` `null`/0
  = indefinido, com teto de 7 dias). O `ai_handoff_minutes` é salvo junto do resto da config IA
  (`saveAiConfig` + `POST /api/whatsapp/config`).

A tela [whatsapp/page.tsx](src/app/dashboard/whatsapp/page.tsx) é dividida em **abas**
(`tab`: Conexão · Atendente de IA · Pausar). A aba **Pausar** lista os clientes que já conversaram
(`listRecentCustomers` em [whatsappConfig.ts](src/lib/whatsappConfig.ts), das `whatsapp_messages`)
mesclados com os pausados; cada linha mostra um **selo de status** — "IA atendendo" (verde),
"Você assumiu" (handoff) / "Pausado por você" (manual), "IA pausada"/"IA desligada" — e um botão
**Pausar** (usa a duração escolhida no seletor) ou **Reativar**. Durações: 15min/30min/1h/3h/1 dia/
"até eu reativar". Há ainda um campo para pausar um número que ainda não apareceu.

### Follow-up automático (cutucar quem sumiu)

Se o cliente fica um tempo sem responder, a IA manda uma mensagem puxando para fechar o pedido. O
tempo é por loja. **Migration:** rode
[supabase-migration-whatsapp-followup.sql](supabase-migration-whatsapp-followup.sql) (adiciona
`ai_followup_minutes` (0 = desativado) e `ai_followup_message` em `store_whatsapp`; cria a tabela
`whatsapp_followups` que guarda `last_followup_at` por cliente para não repetir).

- **Configuração:** no painel (aba Atendente de IA), o lojista escolhe o tempo de silêncio
  (30min/1h/2h/3h/6h/1 dia) e, opcionalmente, uma **mensagem fixa**; vazio = a IA gera com base na
  conversa (`generateFollowupReply` em [src/lib/ai/attendant.ts](src/lib/ai/attendant.ts)).
- **Cron:** o GitHub Action
  [.github/workflows/whatsapp-followups.yml](.github/workflows/whatsapp-followups.yml) chama
  `POST /api/whatsapp/followups?key=<CRON_SECRET>` **a cada 15 min**. O endpoint
  ([followups/route.ts](src/app/api/whatsapp/followups/route.ts)) varre as lojas com follow-up
  ligado (`listFollowupConfigs`), e para cada cliente cutuca se: tem mensagem do cliente,
  `idle ∈ [minutos, minutos×3]` (não ressuscita conversas muito antigas), **não** está pausado
  (global/handoff/manual) e ainda não foi cutucado desde a última fala dele
  (`whatsapp_followups.last_followup_at >= lastUserAt`). Tetos de envio por loja/execução evitam
  timeout. Depois de enviar, grava a mensagem como `assistant` e atualiza `last_followup_at`.
- **Variável de ambiente extra:** `CRON_SECRET` (segredo que protege o endpoint; sem ele o endpoint
  recusa). **Secrets do GitHub** para o workflow: `APP_BASE_URL` e `CRON_SECRET`.

### Keep-alive (evitar pausa do plano Free)

O Supabase Free pausa o projeto após **7 dias** de inatividade. Para evitar isso há um
GitHub Action em [.github/workflows/supabase-keep-alive.yml](.github/workflows/supabase-keep-alive.yml)
que faz um `SELECT` leve na tabela `stores` **a cada 2 dias** (e pode ser disparado manualmente em
Actions → Run workflow).

- Usa os secrets do repositório: `SUPABASE_URL` e `SUPABASE_ANON_KEY` (já cadastrados no GitHub).
- Se um dia precisar mudar a frequência, edite o `cron` no arquivo do workflow.

## Pagamentos (Mercado Pago)

Duas integrações distintas, ambas via wrapper REST [src/lib/mercadopago.ts](src/lib/mercadopago.ts)
(sem SDK, no padrão do `evolution.ts`). Migration: rode
[supabase-migration-mercadopago.sql](supabase-migration-mercadopago.sql).

1. **Mensalidade do SaaS (você → lojistas)** — assinatura **automática** (preapproval). O botão
   "Assinar" em [PlansView.tsx](src/app/dashboard/planos/PlansView.tsx) chama
   `POST /api/billing/subscribe`, que cria o preapproval na **sua** conta MP e redireciona ao
   checkout. O `POST /api/billing/webhook` confirma os pagamentos, ativa a `subscription`, estende
   `expires_at` (+1 mês) e grava em `payments` (`method='mercadopago'`). Usa `MP_ACCESS_TOKEN`.
   O registro **manual** no admin continua existindo como fallback.
2. **Gateway da loja (clientes → lojista)** — cada lojista cola o **Access Token** dele em
   `/dashboard/pagamentos` (`POST /api/store/payment-gateway`, validado via `/users/me` e guardado
   em `store_payment_gateway`; o token **nunca** vai ao browser). Na loja pública, o botão "Pagar com
   Mercado Pago" chama `POST /api/pay/preference` (cria a preference com o token do lojista) e o
   `POST /api/pay/webhook?store=<slug>` marca `orders.payment_status='pago'`
   (`payment_provider='mercadopago'`). Na transição para pago, o webhook também **avisa a loja no
   WhatsApp** (mensagem para o próprio número conectado via Evolution — `getConfig` + `sendText`),
   com o pedido e "Pagamento confirmado". Só dispara uma vez (checa o status anterior) e exige o
   WhatsApp da loja conectado; sem conexão, fica só o selo no painel.

- **Segurança:** access tokens só no servidor; `store_payment_gateway` não tem policy de select
  (só service role). Os webhooks **sempre reconsultam** o status na API do MP antes de confirmar e
  são idempotentes (checam `payment_id`/`payment_id_external`).
- **Variáveis de ambiente extras** (`.env` local / Vercel):
  - `MP_ACCESS_TOKEN` — Access Token da **sua** conta MP (use `TEST-...` para testar). Só servidor.
  - `APP_BASE_URL` — reaproveitada para `back_url`/`notification_url` (o MP precisa alcançar os
    webhooks; em dev, use um túnel cloudflared/ngrok).
- **Modo teste:** comece com credenciais `TEST-...` (tanto a sua quanto a do lojista). A UI mostra um
  selo "Modo teste" quando o token do lojista começa com `TEST-`.

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
