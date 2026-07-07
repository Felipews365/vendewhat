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
- **Banner da loja (carrossel com formato por foto):** o banner é **uma lista de fotos**
  (`storefront.heroSlides: HeroSlide[]` em [src/lib/storefront.ts](src/lib/storefront.ts), cada
  `{ url, layout, photoSide }`) que passam **uma atrás da outra** (1→2→…). Renderizado por
  `HeroBannerBlock` em [LojaClient.tsx](src/app/loja/[slug]/LojaClient.tsx) (auto-avança; setas +
  bolinhas). **Cada foto tem seu próprio formato** — o carrossel renderiza só o slide ativo (por
  isso a altura acompanha o formato de cada um). Sem foto = sem banner. O **número de fotos** depende
  do plano: `bannerPhotoLimitForPlan()` → plano mais barato 5, demais 10 (teto `MAX_BANNER_PHOTOS_ABS`).
  - **Formato por foto (`HeroSlide.layout`):** `"overlay"` (foto de fundo, texto por cima) ou
    `"split"` (foto de um lado, texto num painel `--store-secondary` do outro; `photoSide`
    `"left"`/`"right"`). O CTA usa sempre `--store-primary` (visível nos dois fundos).
  - **Texto por banner (`HeroSlide.badge/title/highlight/subtitle/couponCode/ctaLabel/ctaHref`):**
    cada slide tem seu próprio texto; **campo vazio = usa o texto geral** (fallback: `heroSubtitle`→
    badge, `heroTitle`||nome da loja→title, `store.description`→subtitle, `heroCouponCode`,
    `heroCtaLabel`, `heroCtaHref`). O `HeroBannerBlock` resolve o conteúdo do slide ativo e recebe o
    fallback via prop `fallback` + `onCta` (não usa mais `children`). `heroSlideTextFromRaw` só guarda
    os campos preenchidos no JSONB.
  - **Destaque cursivo animado (`HeroSlide.highlight`):** 2ª linha do título em fonte **cursiva**
    (`.font-script` = `Dancing_Script`, carregada em [layout.tsx](src/app/layout.tsx) como
    `--font-script`) com **degradê animado** (`.vw-anim-gradient` + keyframe `vw-gradient-pan` em
    [globals.css](src/app/globals.css); gradiente `--store-primary`→branco→`--store-primary`).
    Inspirado no `AnimatedGradientText` do projeto de referência. É por banner (sem fallback geral).
  - **Recorte por formato:** ao adicionar, o `ProductImageCropModal` recorta na proporção do formato
    escolhido — `HERO_TARGET_RATIO` (largo) para "de fundo", `HERO_SPLIT_RATIO` (1:1) para "ao lado"
    (`heroCropRatioForLayout`). `heroImageProportionWarning(w,h,layout)` avisa por foto conforme o
    formato. Upload imediato (bucket `product-images`).
  - **Editor = página dedicada** [/dashboard/banner](src/app/dashboard/banner/page.tsx) (não é mais
    modal): lista de banners com prévia fiel (`SlidePreview`), formato por banner (Fundo/Ao lado +
    lado), textos por banner, reordenar (▲▼), remover, adicionar (com formato padrão p/ a próxima
    foto), + a seção "Texto geral". Carrega/salva o próprio `storefront` (botão **Salvar**). O clique
    no banner dentro do [StoreVisualEditor.tsx](src/components/dashboard/StoreVisualEditor.tsx)
    (canvas + FAB) navega para essa página (`openBannerEditor`); o antigo painel `banner` do modal
    ficou **legado/inacessível** (marcado no código, a remover depois). Ao **adicionar** uma foto, a
    página **rola até o card recém-criado e o destaca** (anel + etiqueta "Ajuste texto e formato
    aqui", some após 3s) — via `highlightUrl`/`highlightRef` — para o lojista não perder o card lá no
    fim da lista e configurar texto/formato na hora.
  - **Migração:** `storefrontFromDb` (`heroSlidesFromDb`) migra formatos antigos — `heroImages:
    string[]`, `heroCarousels` (faixas), `heroImage` (única) → viram slides herdando o antigo formato
    global `heroLayout`/`heroSplitPhotoSide`. Sem migration de banco: tudo no JSONB.
  - `heroLayout`/`heroSplitPhotoSide` em `StorefrontSettings` agora são só o **padrão para novas
    fotos** (não afetam o render, que é por slide).
  - **Estilos/templates de banner (inspirados no projeto de referência `sitederoupa`):** além de
    `overlay`/`split`, cada slide pode usar um **template** (`HeroSlide.template`): `gradient`,
    `diagonal`, `fashion`, `magazine`, `spring`, `sale` (os 8 valores em `HERO_TEMPLATES` de
    [storefront.ts](src/lib/storefront.ts); `strips`/`duo` da referência **ainda não** foram
    portados). São painéis coloridos com **recortes diagonais** (clip-path), badge em círculo
    (giratório no `spring`, pulsante no `sale`) e o **destaque cursivo em degradê animado**. Campos
    extras por slide no JSONB (sem migration): `bgFrom`/`bgVia`/`bgTo` (gradiente), `ctaBgColor` (cor
    do botão), `height` (altura px). Renderizados por
    [HeroTemplateSlide.tsx](src/components/storefront/HeroTemplateSlide.tsx) — **componente único
    compartilhado** pela loja (`HeroBannerBlock` em [LojaClient.tsx](src/app/loja/[slug]/LojaClient.tsx),
    quando `template` não é overlay/split, renderiza num container de altura fixa) **e** pela prévia
    do editor (`SlidePreview` em [banner/page.tsx](src/app/dashboard/banner/page.tsx)). **Sem
    framer-motion/magicui:** o destaque usa `.vw-anim-gradient`/`.font-script` e os badges usam
    `.vw-spin-slow`/`.vw-pulse-soft` ([globals.css](src/app/globals.css), respeitam
    `prefers-reduced-motion`). O editor [/dashboard/banner](src/app/dashboard/banner/page.tsx) ganhou
    um **seletor de estilo por banner** + controles de gradiente (De/Via/Até), cor do botão, altura e
    lado da foto (`applyTemplate` define os padrões ao trocar de estilo). Ao **adicionar**, a foto
    entra como `overlay`; troca-se o estilo depois em cada banner.
- **Cards promocionais abaixo do banner (`storefront.promoCards: PromoCard[]`):** faixa de até
  `MAX_PROMO_CARDS` (6) cartões coloridos (gradiente `from`→`to`) com etiqueta/título/frase/link.
  Renderizados em [LojaClient.tsx](src/app/loja/[slug]/LojaClient.tsx) logo **abaixo do banner**
  (grid `sm:grid-cols-3`); link usa `handleHeroCta`. Editados na página
  [/dashboard/banner](src/app/dashboard/banner/page.tsx) com **modelos prontos** (`PROMO_CARD_PRESETS`
  em [storefront.ts](src/lib/storefront.ts) — Imperdível/Destaque/Oferta/Frete/Novidade/Premium),
  seletor de cor (`PROMO_CARD_COLORS`), reordenar/remover. Sem migration (JSONB).
- **Menu de categorias no topo (`storefront.showCategoryNav`, default `true`):** barra horizontal
  (`CategoryNavBar` em [LojaClient.tsx](src/app/loja/[slug]/LojaClient.tsx)) abaixo do cabeçalho,
  reaproveita os `categoryStripItems` (mesma fonte do strip de bolinhas) e o `categoryFilter`; item
  ativo usa `--store-primary`. Só aparece se houver categorias (logo, precisa de produtos). Toggle na
  página do banner. Sem migration (JSONB).
- **Pixels e rastreamento (por loja):** cada lojista cola o **próprio** Pixel do Facebook/Meta
  (`storefront.facebookPixelId`, só dígitos) e a **tag do Google** (`storefront.googleAnalyticsId` —
  GA4 `G-…`, Google Ads `AW-…` ou Tag Manager `GTM-…`) na página dedicada
  [/dashboard/pixels](src/app/dashboard/pixels/page.tsx), acessada por uma linha "Pixels e
  rastreamento" na seção "Loja" da [Conta](src/app/dashboard/conta/page.tsx) (ficam junto dos IDs no
  JSONB `storefront`, então a página só edita esses dois campos e preserva o resto). Os scripts
  carregam **só na loja pública**
  (`/loja/[slug]`), renderizados por
  [StoreTrackingScripts.tsx](src/components/StoreTrackingScripts.tsx) (via `next/script`) injetado no
  server component [page.tsx](src/app/loja/[slug]/page.tsx) — só os IDs **daquela** loja (multi-tenant,
  a loja A nunca carrega o pixel da B). O Meta dispara `PageView`; a tag do Google usa `gtag`
  (GA4/Ads) ou carrega o `gtm.js` quando é `GTM-…`. **Segurança:** os IDs são sanitizados na entrada,
  ao salvar/ler (`sanitizeFacebookPixelId`/`sanitizeGoogleTagId` em
  [storefront.ts](src/lib/storefront.ts)) e de novo antes de entrar no `<script>` (só dígitos /
  `[A-Z0-9-]`), impedindo injeção de código. Sem migration: mora no JSONB `stores.storefront`.

- **Pendente:** os widgets internos compartilhados ainda estão só no tema claro — editor visual
  da loja ([StoreVisualEditor.tsx](src/components/dashboard/StoreVisualEditor.tsx), cuja
  pré-visualização da loja pública deve continuar clara de propósito), seletor de fotos,
  editores de cor/tamanho/estoque, autocomplete de categoria e os modais.

### Blocos de conteúdo (builder de loja)

Biblioteca de blocos reutilizáveis em [src/components/storefront/blocks/](src/components/storefront/blocks/)
para montar seções extras da vitrine (banner promo, boas-vindas, vitrine de categorias, grade de
produtos, chamada WhatsApp, cupom/oferta, destaque imagem+texto). É **aditiva** e mobile-first;
usa os tokens `--store-primary`/`--store-secondary`.

- **Camadas:** [types.ts](src/components/storefront/blocks/types.ts) (config de cada bloco +
  `BLOCK_LIMITS` por campo + `StoreBlock`/`StoreBlockType`), [primitives.tsx](src/components/storefront/blocks/primitives.tsx)
  (peças comuns: `BlockContainer`, `BlockImage` com fallback, `BlockEmpty`, `BlockButton`,
  `formatMoneyBRL`), [registry.ts](src/components/storefront/blocks/registry.ts) (menu do "+":
  `BLOCK_REGISTRY`, `BLOCK_MENU_ORDER`, `createBlock`), [validation.ts](src/components/storefront/blocks/validation.ts)
  (`validateBlock` — avisos p/ texto longo, erros só no essencial) e
  [BlockRenderer.tsx](src/components/storefront/blocks/BlockRenderer.tsx) (renderiza por `type`;
  injeta `products` na grade). Import único via [index.ts](src/components/storefront/blocks/index.ts).
- **Cada bloco** tem fallback de imagem, `line-clamp` p/ textos longos e **se oculta na loja
  pública quando vazio** (com `editing`, aparece na prévia com dica).
- **Armazenamento:** `storefront.contentBlocks: StoreBlock[]` (em [storefront.ts](src/lib/storefront.ts),
  sanitizado por `contentBlocksFromDb` — só tipos conhecidos, teto `MAX_CONTENT_BLOCKS`). **Sem
  migration:** mora no mesmo JSONB `stores.storefront`; persiste no "Salvar loja".
- **Loja pública:** [LojaClient.tsx](src/app/loja/[slug]/LojaClient.tsx) renderiza
  `storefront.contentBlocks` **abaixo do catálogo** (entre `</main>` e o `<footer>`), com os produtos
  mapeados para `BlockProduct` (`blockProducts`).
- **Editor:** [StoreVisualEditor.tsx](src/components/dashboard/StoreVisualEditor.tsx) tem o painel
  `blocks` (atalho "Blocos de destaque") e a prévia no canvas. **Por enquanto só o bloco
  `imageTextFeature`** está exposto para adicionar/editar/reordenar/remover; os outros tipos já
  renderizam se existirem no JSONB. Expansão futura: formulário genérico guiado por
  `BLOCK_REGISTRY[type].fields`, upload de imagem (hoje é URL) e arrastar-e-soltar.

## Formulário de produto (fotos, capa, vídeo)

Páginas [/dashboard/produtos/novo](src/app/dashboard/produtos/novo/page.tsx) e
[/dashboard/produtos/[id]](src/app/dashboard/produtos/[id]/page.tsx) (edição). As fotos usam o
[ProductPhotosPicker.tsx](src/components/ProductPhotosPicker.tsx) (variant `editor`), que sobe as
imagens ao bucket `product-images` e guarda a ordem em `products.images` + o foco por foto em
`image_object_positions`.

- **Foto de capa = 1.ª foto** (`images[0]`) em toda a loja (card, thumbnail, recorte 1:1). No picker,
  a 1.ª foto mostra o selo **★ Capa** e as demais têm o botão **"Tornar capa"** (`makeCover` move o
  item para o índice 0). Não há coluna de "capa" — é só a ordem do array.
- **Vídeo do produto (`products.video_url`):** upload no formulário (MP4/MOV, teto `MAX_VIDEO_BYTES`
  = 50MB) para o mesmo bucket `product-images` (pasta `videos/`), guarda a URL pública. O save inclui
  `video_url` com **fallback de coluna ausente** (`isMissingColumnError`, igual a `images`). Exibido
  no detalhe do produto na loja pública (`ProductDetailModal` em
  [LojaClient.tsx](src/app/loja/[slug]/LojaClient.tsx), abaixo da descrição), via
  `CatalogProduct.videoUrl` (mapeado em [loja/[slug]/page.tsx](src/app/loja/[slug]/page.tsx) a partir
  do `select("*")`). **Migration:** [supabase-migration-product-video.sql](supabase-migration-product-video.sql)
  (só a coluna). O limite real de tamanho do arquivo depende do bucket no Supabase (Storage →
  `product-images` → File size limit).

### Variações (cores, tamanhos e estoque por combinação)

Na aba **Variações** do formulário, três componentes compartilhados montam cor/tamanho/estoque:

- **Cores** ([ProductColorsEditor.tsx](src/components/ProductColorsEditor.tsx)): cada cor tem
  **nome** + **tom da bolinha** (`<input type="color">`, guardado em `products.color_hexes`). Tem
  **chips de cores prontas** (`COLOR_PRESETS`) que adicionam/removem com 1 clique, com a bolinha já na
  cor certa (`hexForColorLabel`/`defaultPickerHex` de [colorSwatch.ts](src/lib/colorSwatch.ts)); dá
  para ajustar o tom depois.
- **Tamanhos** ([ProductOptionsEditor.tsx](src/components/ProductOptionsEditor.tsx)): lista simples de
  strings. A prop opcional `presetGroups` mostra **chips prontos** — `SIZE_PRESET_GROUPS` (Letras
  PP–XGG, Números 36–50, "Tamanho único") passado pelas duas páginas de produto.
- **Estoque** ([VariantStockEditor.tsx](src/components/VariantStockEditor.tsx)): quantidade por
  combinação (`buildVariantCombinations` + `variantStockKey`, guardado em `products.variant_stock`).
  Com cor **E** tamanho, **agrupa por tamanho** (cada tamanho lista as cores com bolinha + Qtd +
  subtotal); com só uma dimensão, vira lista simples. Os helpers de linha são **funções chamadas
  inline** (não componentes) de propósito — como componentes, o `<input>` remontaria e perderia o
  foco a cada dígito.

Obs.: esses três cards ainda são **claros** (sem `dark:`), então os inputs forçam `text-slate-900`
para o texto digitado não herdar a cor clara do tema e sumir no fundo branco.

### Detalhes do produto: tags, tipo de unidade, EAN, dimensões

Campos extras do produto (eram placeholders "em breve" no formulário). **Migration:** rode
[supabase-migration-product-details.sql](supabase-migration-product-details.sql) (adiciona `tags`
jsonb, `unit_type`, `barcode`, `package_height/width/length` e `package_weight` em `products`).
Helpers e o catálogo `UNIT_TYPES` moram em [src/lib/productDetails.ts](src/lib/productDetails.ts).

- **Onde:** as duas páginas de produto ([novo](src/app/dashboard/produtos/novo/page.tsx) e
  [id](src/app/dashboard/produtos/[id]/page.tsx)). **Tags** reusam o `ProductOptionsEditor` (lista de
  chips, guardadas em `tags`, sanitizadas por `sanitizeTags`). **Tipo de unidade** é um `<select>`
  (`UNIT_TYPES`: unidade/kg/g/l/ml/m/par/caixa/pacote). **EAN** é um texto (`sanitizeBarcode`).
  **Dimensões** são 4 inputs numéricos (Alt × Larg × Comp em cm + Peso em kg; `dimensionFromInput`).
- **Save com fallback de coluna ausente:** as 7 colunas vêm da mesma migration, então **um único**
  ramo (`isMissingProductDetailColumn` em [dbColumnErrors.ts](src/lib/dbColumnErrors.ts)) tira todas e
  reenvia, sem derrubar o resto (imagens, etc.). O hint é `PRODUCT_DETAILS_MIGRATION_HINT`. Na página
  nova ainda há o "retry mínimo" como última rede; a de edição depende desse ramo.
- **Uso na loja pública:** [loja/[slug]/page.tsx](src/app/loja/[slug]/page.tsx) mapeia para
  `CatalogProduct` os campos `tags`, `unitShort` (abreviação; vazio p/ "Unidade") e `barcode`. A
  **busca** da loja ([LojaClient.tsx](src/app/loja/[slug]/LojaClient.tsx), `filteredProducts`) passa a
  considerar as **tags** além de nome/descrição/categoria. No **detalhe** do produto, o preço mostra a
  unidade (`/Kg` etc. em vez de `/un.`) e o **EAN** aparece abaixo da referência. Dimensões/peso ficam
  **só armazenadas** por enquanto (não há cálculo de frete que as consuma).

### Formato da foto dos produtos (1:1 ou 3:4)

Toggle `storefront.productCardRatio` (`"1:1"` quadrado — default — ou `"3:4"` retrato; JSONB, **sem
migration**), editado no painel **"Rodapé da vitrine"** do
[StoreVisualEditor.tsx](src/components/dashboard/StoreVisualEditor.tsx) (seletor "Formato da foto dos
produtos", **salva na hora** via `onAutoSaveStorefront`). Vale para **todos** os cards de produto da
loja (promoções + catálogo). O `ProductCatalogCard` em
[LojaClient.tsx](src/app/loja/[slug]/LojaClient.tsx) recebe `imageRatio` e troca `aspect-square` ↔
`aspect-[3/4]`; a foto é `object-cover` com ponto de foco, então **não distorce** em nenhum formato
(nem exige re-recorte das capas já enviadas). Só afeta a grade — a foto grande no **detalhe** do
produto continua inteira (`object-contain`) de propósito.

### Estilo "e-commerce" dos cards + Ofertas Relâmpago (referência `sitederoupa`)

O `ProductCatalogCard` em [LojaClient.tsx](src/app/loja/[slug]/LojaClient.tsx) foi redesenhado no
visual de e-commerce moderno (inspirado no site de referência): card branco com borda, foto no topo,
**selo de desconto** vermelho (`-X%`) ou **"Novo"** azul (produto recente, `isRecent`), **selo "Frete
grátis"** azul, **categoria** (eyebrow), nome, **preço em laranja** + `de` riscado + **selo `-X%`
laranja** ao lado, **parcelamento estimado**, **5 estrelas douradas (4.9)** e botão **"Adicionar à
sacola"** que aparece **no hover** (o card inteiro abre o detalhe). Tem **animação de entrada**
(fade-up ao aparecer na tela via `IntersectionObserver` + `.vw-fade-in-up`, escalonada por card —
substitui o `BlurFade`/framer-motion da referência) e **zoom da foto no hover**. A **paleta é fixa**
(constante `EC` no arquivo: azul `#0062B8`, laranja `#FF6B00`, vermelho `#E63946`, dourado, borda
`#DCE3EC`) — de propósito, para ficar igual à referência em **toda** loja, ignorando o tema por loja
nesses cards. Os cabeçalhos das seções viraram **⚡ Ofertas Relâmpago** (promoções) e **Mais Produtos**
(catálogo, com divisor). Helpers puros em [productCardMeta.ts](src/lib/productCardMeta.ts)
(`discountPercent`; `installmentPlan`/`decorativeRating` existem mas o card usa a fórmula da referência
inline: `~R$20/parcela`, teto 10, e 5 estrelas fixas).

Config por loja no JSONB `storefront` (**sem migration**), editada no painel **"Rodapé da vitrine"** do
[StoreVisualEditor.tsx](src/components/dashboard/StoreVisualEditor.tsx) (bloco "Cartões de produto"):
`flashSaleEndsAt` (data-fim ISO do **contador** "Ofertas Relâmpago" — pílula azul-escura mono
`FlashSaleCountdown`, só aparece se futuro; monta no cliente p/ não quebrar hidratação),
`cardInstallmentsMax` (default 10; 0 = não mostra), `cardFreeShipping` (rótulo do selo; vazio = usa a
regra da referência: preço ≥ R$79) e `cardShowRatings` (default `true`; estrelas **decorativas**, não
são reviews reais). Sanitizados em `storefrontFromDb`/`storefrontToDb`.

### Controlar estoque ou não (por loja)

Toggle `storefront.stockControlEnabled` (default `true`, JSONB — **sem migration**), editado no painel
**"Rodapé da vitrine"** do [StoreVisualEditor.tsx](src/components/dashboard/StoreVisualEditor.tsx)
(caixa "Controle de estoque"). Marcado = comportamento de sempre: produto/variação sem estoque
aparece como **"Esgotado"** e limita a quantidade. Desmarcado = a loja **não controla estoque**:
nunca mostra "Esgotado" e não limita a quantidade (para quem faz sob encomenda / repõe sempre).
Em vez de espalhar a flag por dezenas de componentes, a [LojaClient.tsx](src/app/loja/[slug]/LojaClient.tsx)
**normaliza os produtos** num `useMemo` quando desativado (estoque "infinito" 999999 + `variantStock: []`),
então `productSoldOut`/`maxQtyForCartLine` e os avisos de variação tratam tudo como disponível. Para
manter a **IA** consistente, [whatsappRespond.ts](src/lib/whatsappRespond.ts) também zera o "sem estoque"
do catálogo do prompt quando `stockControlEnabled` é `false`.

## Loja pública — carrinho e formas de envio

O checkout fica no carrinho de [src/app/loja/[slug]/LojaClient.tsx](src/app/loja/[slug]/LojaClient.tsx).
As **formas de envio** estão em [src/lib/shippingModes.ts](src/lib/shippingModes.ts)
(`SHIPPING_MODES`: excursão, correios, transportadora, retirada) e definem campos extras no carrinho:

- **Excursão / Correios / Transportadora** → o cliente preenche o **endereço de entrega** (CEP, rua,
  número, bairro, cidade, UF, complemento). Validação em `addressComplete`; o **CEP é obrigatório no
  Correios e na Transportadora** (`cepRequired` + 8 dígitos), não na excursão. O endereço entra na
  mensagem do WhatsApp (`*Endereço de entrega:*`) e no `payload.customerAddress` do pedido.
- **Excursão** → além do endereço, exige o **nome da excursão** (`excursionName`, validado por
  `excursionComplete`). Vai na mensagem do WhatsApp (`*Excursão:*`) e em `payload.excursionName`.
- **Transportadora** → além do endereço, exige o **nome da transportadora** (`carrierName`, validado
  por `carrierComplete`). Vai na mensagem do WhatsApp (`*Transportadora:*`) e em
  `payload.carrierName`.
- **Retirada** → mostra o **endereço da loja** (`storefront.pickupAddress`) e as **instruções de
  retirada** (`storefront.pickupInstructions` — "Como retirar"), configurados no editor da vitrine
  ([StoreVisualEditor.tsx](src/components/dashboard/StoreVisualEditor.tsx), painel "Rodapé da
  vitrine"). Se vazio, exibe aviso de combinar pelo WhatsApp. As instruções entram na mensagem
  (`*Como retirar:*`) **e** no prompt da IA (a IA atendente explica a retirada — ver seção da IA).

A liberação dos botões de finalizar usa `checkoutReady` (junta nome, telefone, forma de envio,
endereço quando aplicável, nome da excursão/transportadora e **forma de pagamento**).

**Forma de pagamento no checkout ([src/lib/paymentMethods.ts](src/lib/paymentMethods.ts)):** o cliente
escolhe entre `pix` / `dinheiro` / `cartao` / `mercadopago` (`PAYMENT_METHODS`), mas **só aparecem as
que a loja ativou** no painel. Os toggles moram no JSONB `storefront`: `checkoutPixEnabled` (default
`true`, exige `pixKey`), `checkoutCashEnabled`, `checkoutCardEnabled` e `checkoutMercadoPagoEnabled`
(default `true`), editados no painel "Rodapé da vitrine" (subseção "Formas de pagamento no checkout").
Em LojaClient, `enabledPayMethods` deriva a lista; se estiver vazia, **não** mostra o seletor
(retrocompatível). O **Mercado Pago** só aparece se `mpAvailable = paymentEnabled &&
checkoutMercadoPagoEnabled` (ou seja, gateway conectado **E** ativado no painel); o botão azul "Pagar
com Mercado Pago" só é exibido quando `paymentMethod === "mercadopago"`. A escolha vai na mensagem
(`*Forma de pagamento:*`) e em `payload.paymentMethod`.

**Formato da mensagem de pedido (`buildOrderMessage` em LojaClient):** cabeçalho, dados do cliente,
envio/endereço e depois `*Itens do pedido:*` com **um item por bloco** (linha em branco entre eles):
`1x Nome — Cor — Tam. P — R$ 90,00` (dinheiro em BRL com vírgula via `toLocaleString`, sem o antigo
"(un. R$ x)"); fecha com `*Total parcial: R$ …*`. O **nome do cliente e do produto** passam por
`titleCasePtBr` (1ª letra de cada palavra maiúscula, mantendo conectores `da/de/do/das/dos/e/di/du`
minúsculos no meio) — normaliza o que foi digitado em caixa alta/baixa.

**Pix na mensagem do WhatsApp:** se a loja preencher a **chave Pix** (`storefront.pixKey` + titular
`pixName`, no mesmo painel "Rodapé da vitrine"), a mensagem do **Enviar pedido no WhatsApp** termina
com a chave para o cliente pagar e enviar o comprovante — mas **só quando o método escolhido é Pix**
(ou quando a loja não configurou nenhum seletor de pagamento, mantendo o comportamento antigo).
Sem migration: mora no JSONB `stores.storefront`. É o fluxo de pagamento dos pedidos que **não**
passam pelo Mercado Pago.

O endereço, o nome da excursão/transportadora e a forma de pagamento aparecem no painel em
[/dashboard/pedidos](src/app/dashboard/pedidos/page.tsx) (tela e comprovante impresso, via
`paymentMethodLabel`). Não há migration: `pickupAddress`/`pickupInstructions` e os toggles de
pagamento moram no JSONB `stores.storefront`; os dados do cliente (`customerAddress`, `excursionName`,
`carrierName`, `paymentMethod`) no `orders.payload` (ver
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
cada linha só aparece se preenchida. Não há migration nova. Cada item mostra a **Ref.** e, quando
cadastrado, o **EAN** (código de barras) numa sublinha — ambos vêm do `orders.payload.lines[]`
(gravados no checkout junto do preço; ver `barcode` em [orderLines.ts](src/lib/orderLines.ts) e
[api/orders/route.ts](src/app/api/orders/route.ts), com fallback quando a coluna `barcode` não existe).
Pedidos antigos (sem `barcode` no payload) simplesmente não mostram o EAN.

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
- **Mensagens de erro da Evolution v2:** o wrapper (`call()` em
  [evolution.ts](src/lib/evolution.ts)) extrai o texto de erro de `response.message` (que pode vir
  como **array**), não só de `message` no topo. Isso é essencial porque ao (re)conectar uma
  instância **já existente** a Evolution responde **403** com `{response:{message:["...already in
  use..."]}}`; sem ler o aninhado, `createInstance` acha que é erro fatal e o painel mostra
  "Evolution API erro 403" no botão Conectar (em vez de seguir para o QR).
- **Registro do webhook (URL pelo domínio da requisição):** o
  [connect](src/app/api/whatsapp/connect/route.ts) monta o `webhookUrl` a partir do **host real da
  requisição** (`x-forwarded-host`/`host`), caindo no `APP_BASE_URL` só se não der para ler o host.
  Isso auto-corrige o caso clássico de o webhook ficar registrado num endereço antigo/errado (era o
  motivo de a Evolution receber as mensagens mas **não repassar** pro app). O `setWebhook`
  ([evolution.ts](src/lib/evolution.ts)) manda os **dois padrões de nome** de campo
  (`byEvents`/`webhookByEvents`, `base64`/`webhookBase64`) por compatibilidade entre versões da
  Evolution. **Diagnóstico:** ao conectar, o app consulta `getWebhookInfo` (`GET
  /webhook/find/{instance}`) e loga `[whatsapp/connect] webhook { webhookUrl, stored }` (mostra a URL
  que a Evolution realmente gravou + `enabled`/`events`). O [webhook](src/app/api/whatsapp/webhook/route.ts)
  também loga o motivo quando ignora (`msg recebida`, `IA desligada`, `OPENAI_API_KEY ausente`,
  `cliente pausado`, `resposta vazia`) — some pelos Logs da Vercel se a IA "não responder".
  Obs.: em **modo webhook global** na Evolution (`WEBHOOK_GLOBAL_ENABLED=true`) o webhook por
  instância é ignorado; para o multi-tenant do VendeWhat, esse modo deve ficar **desligado**.
- **Selo de conexão:** [whatsapp/page.tsx](src/app/dashboard/whatsapp/page.tsx) deriva
  `displayStatus` — um estado preso em `connecting` no servidor (instância criada mas nunca
  escaneada) é exibido como **"Desconectado"** numa página recém-aberta (sem QR na tela nem clique
  em andamento); "Conectando…" só aparece durante uma conexão ativa.
- **Apresentação no 1º contato:** na primeira mensagem de cada cliente a IA se apresenta com o
  **nome do atendente** (`ai_name`) + **nome da loja** e depois não repete. O webhook detecta o
  primeiro contato quando **a IA ainda não falou** na conversa (`!full.some(t => t.role ===
  "assistant")`, robusto ao agrupamento de mensagens) e passa `isFirstContact` para
  `buildSystemPrompt` em [src/lib/ai/attendant.ts](src/lib/ai/attendant.ts).
- **Envio do link da loja (URL pura, padrão de 3 partes):** o `buildSystemPrompt` instrui a IA a
  mandar o link como **URL pura numa linha só** (nunca markdown `[texto](url)`, que o WhatsApp quebra)
  e num padrão acolhedor de 3 blocos — abertura + link isolado + frase de apoio (ex.: "Claro! 😊
  Segue o link…" / URL / "Dá uma olhada com calma…"). Combinado com a resposta em partes, cada bloco
  vira um balão; o balão do link ganha a **prévia rica** (card de Open Graph) que o WhatsApp gera da
  página `/loja/[slug]`.
- **Rede de segurança do link (determinística, não depende do modelo):** o gpt-4o-mini às vezes
  ANUNCIA o link ("segue o link", "confira o catálogo") mas **esquece de colar a URL** — o cliente
  recebia só a promessa. Em `respondToCustomer` ([whatsappRespond.ts](src/lib/whatsappRespond.ts)),
  se o texto menciona `link`/`catálogo` (ou o cliente pediu o catálogo, ou a IA emitiu
  `[[ENVIAR_CATALOGO]]`) e **não há nenhuma URL** no texto, o sistema **anexa a `storeUrl`** como bloco
  próprio (vira um balão com prévia rica). O loop que envia os balões é isolado em `try/catch`: se um
  balão falha, os demais e os anexos (localização/foto/vídeo/catálogo) ainda saem. A `baseUrl` cai no
  `VERCEL_URL` quando `APP_BASE_URL` está vazio (o cron não tem request, então não pode ler o host —
  evita montar link relativo quebrado); reaproveitada no prompt e no QR do PDF.
- **Fechamento assertivo (não deixa a venda no colo do cliente):** o `buildSystemPrompt` instrui a
  IA a **conduzir para o fechamento** com pergunta direta ("Vamos fechar seu pedido?", "Bora fechar
  seu pedido?", "Posso seguir com o fechamento?") depois que o cliente demonstra interesse, e
  **proíbe** encerramentos passivos ("se quiser, é só avisar", "fico no aguardo"). O mesmo tom vale
  no `generateFollowupReply` (cutucar quem sumiu). Há também uma regra para o **cliente indeciso**
  ("estou na dúvida", "não sei qual escolher"): em vez de responder passivo, a IA se oferece para
  **comparar** modelos/cores/tamanhos ou pergunta o que ele procura, sempre conduzindo à decisão.
  Fixo para todas as lojas (sem config no painel).
- **Espera + agrupamento de mensagens (debounce por tabela + cron):** para o cliente que manda
  várias mensagens seguidas, a IA espera ele parar de digitar e responde tudo de uma vez. O
  [webhook](src/app/api/whatsapp/webhook/route.ts) **não gera resposta** — ele grava a mensagem e
  **agenda** (`schedulePendingReply` em [whatsappConfig.ts](src/lib/whatsappConfig.ts)) uma linha em
  `whatsapp_pending_replies` com `respond_after = agora + DEBOUNCE_SECONDS (15s)`. Cada nova mensagem
  do mesmo cliente faz UPSERT e **empurra o `respond_after`** (o timer reinicia). Um **cron externo
  (~1 min)** chama [/api/whatsapp/debounce](src/app/api/whatsapp/debounce/route.ts) (protegido por
  `CRON_SECRET`, igual aos follow-ups), que pega os agendamentos vencidos (`listDuePendingReplies`),
  **reserva** cada um com lock otimista (`claimPendingReply` empurra o `respond_after` para +5min e
  só reserva se ainda vencido — evita resposta dupla de crons concorrentes e não interrompe quem
  ainda digita) e chama `respondToCustomer` ([whatsappRespond.ts](src/lib/whatsappRespond.ts)).
  Migration: [supabase-migration-whatsapp-debounce.sql](supabase-migration-whatsapp-debounce.sql)
  (tabela sem policies — só service role). **Gatilho:** um workflow do **n8n** (self-hosted no mesmo
  VPS da Evolution) — nó *Schedule Trigger* (1 min) → *HTTP Request* `GET` no endpoint com
  `?key=CRON_SECRET`. Escolhido em vez de crontab porque o painel do VPS (iContainer) só dá shell
  dentro de containers, sem cron no host; o n8n já roda ali, sobrevive a restart e mostra logs. O
  delay efetivo ao cliente é ~15-75s (os 15s de silêncio + o intervalo do cron). O webhook precisa de
  `maxDuration = 30` (transcrição/descrição de mídia), o cron de `= 60`.
- **`respondToCustomer` ([whatsappRespond.ts](src/lib/whatsappRespond.ts)):** monta o lote (mensagens
  do cliente após a última fala da IA = `full.slice(splitIdx)`), o contexto anterior, detecta
  primeiro contato (`!full.some(t => t.role === "assistant")`), gera com `generateReply` e envia. É a
  lógica que antes ficava no webhook — agora vive aqui e roda no cron.
- **Resposta em partes (vários balões) com "digitando…":** `sendText`
  ([evolution.ts](src/lib/evolution.ts)) aceita um `delayMs` — a Evolution mostra o presence
  *composing* por esse tempo e só então entrega a mensagem. Em vez de mandar tudo num balão só,
  `respondToCustomer` ([whatsappRespond.ts](src/lib/whatsappRespond.ts)) quebra a resposta com
  `splitReplyIntoParts` (por **parágrafos** = linha em branco; parágrafo muito longo é dividido por
  **frases**, tetos de 300 chars; linhas com **link** ficam intactas) e envia **cada bloco como uma
  mensagem separada**, com um "digitando…" proporcional antes de cada uma
  (`part.length * 45`, entre 1,2s e 5s) — cara de humano mandando aos poucos. A IA é instruída no
  `buildSystemPrompt` a separar ideias por linha em branco (2 a 4 balões: saudação / resposta /
  link-fechamento). **Cada parte também vira uma linha `assistant` no histórico**, o que importa
  para a detecção de eco do handoff (ver abaixo).
- **Handoff × resposta em partes:** como a IA agora manda vários balões (cada um volta como `fromMe`
  no `MESSAGES_UPSERT`), o [webhook](src/app/api/whatsapp/webhook/route.ts) compara com as **últimas
  8** mensagens `assistant` (`getLastAssistantMessages`, era 3) para reconhecer os ecos e **não**
  tratar os próprios balões da IA como o dono assumindo a conversa.
- **Entende imagem e áudio:** o webhook detecta `imageMessage`/`audioMessage` (desembrulhando
  efêmeras/"ver uma vez" com `unwrapMessage`) e baixa o conteúdo via `getMediaBase64`
  (`POST /chat/getBase64FromMediaMessage/{instance}` em [evolution.ts](src/lib/evolution.ts)). A
  mídia é resolvida **para texto no webhook**, então o cron/`respondToCustomer` trabalha só com texto.
  **Áudio** → transcrito com Whisper (`transcribeAudio` em [attendant.ts](src/lib/ai/attendant.ts),
  `whisper-1`); a transcrição vira o texto da mensagem (se falhar, a IA pede para escrever, sem
  agendar). **Imagem** → o webhook chama `describeImage` (visão do `gpt-4o-mini`) e grava a legenda +
  a descrição da foto (`[Foto enviada pelo cliente — …]`) como texto no histórico.
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

### Retirada de pedidos (a IA explica como retirar)

Quando o pedido é de **Retirada** (ou o cliente pergunta como/onde retirar), a IA atendente explica
proativamente o **endereço** e as **instruções de retirada**. Esses dois campos moram no JSONB
`storefront` (`pickupAddress` + `pickupInstructions`, editados no painel "Rodapé da vitrine") e são
passados por [whatsappRespond.ts](src/lib/whatsappRespond.ts) para
`buildSystemPrompt({ pickupAddress, pickupInstructions })` em
[src/lib/ai/attendant.ts](src/lib/ai/attendant.ts), que só ativa a regra + a seção "RETIRADA DE
PEDIDOS" quando há algum dos dois **e** a loja **não** é só online (`onlineOnly` zera a retirada).
Sem migration (JSONB). É o mesmo `pickupInstructions` que também entra na mensagem do pedido no
carrinho (ver seção "Loja pública — carrinho e formas de envio").

### Localização e foto da loja (a IA envia quando pedem)

Quando o cliente pede a localização ou para ver a loja, a IA pode mandar o **pino
nativo do mapa do WhatsApp** (igual uma pessoa) e a **foto da fachada**. Tudo por
loja, configurado na aba **Atendente de IA** (seção "Localização e foto da loja").
**Migration:** rode
[supabase-migration-whatsapp-location.sql](supabase-migration-whatsapp-location.sql)
(adiciona `ai_location_address`, `ai_location_lat`, `ai_location_lng`,
`ai_location_url`, `ai_store_photo_url` em `store_whatsapp`).

- **Loja só online (`ai_online_only`, default `false`):** caixinha "Minha loja é só
  online (não tem ponto físico)" na aba Atendente de IA. Quando marcada, o painel
  **esconde** a seção "Localização e foto da loja" e o atendimento
  ([whatsappRespond.ts](src/lib/whatsappRespond.ts)) força `storeAddress=""` e
  `hasLocationPin/hasStorePhoto/hasStoreVideo=false` — a IA **nunca** envia pino/foto/vídeo
  e, via `buildSystemPrompt({ onlineOnly })`, é instruída a explicar que a loja é 100% online
  (sem endereço/visita) e mandar o link do catálogo. **Migration:**
  [supabase-migration-whatsapp-online-only.sql](supabase-migration-whatsapp-online-only.sql)
  (só adiciona a coluna booleana).

- **Endereço:** `ai_location_address` (onde a loja fica — pode ser igual ou
  diferente do `storefront.pickupAddress` de retirada). No webhook, se vazio, cai
  no endereço de retirada (`cfg.aiLocationAddress.trim() || pickupAddress`).
- **Pino do mapa:** o lojista cola um **link do Google Maps** (ou `lat,lng`); a rota
  [config](src/app/api/whatsapp/config/route.ts) extrai as coordenadas com
  `parseLatLng` ([src/lib/geoLocation.ts](src/lib/geoLocation.ts)) e grava
  `ai_location_lat/lng`. Links encurtados `maps.app.goo.gl` não têm o ponto na URL,
  então o servidor **segue o redirecionamento** com `resolveMapsLatLng` (fetch no
  runtime nodejs) e, quando resolve, guarda em `ai_location_url` uma URL canônica
  `…/maps/search/?api=1&query=lat,lng` (devolvida ao painel em `resolvedUrl` para
  reexibir já reconhecida). O painel tem um passo a passo (`<details>` "Como pego o
  link do mapa?") ensinando a copiar o link no app/site do Maps. O painel também tem
  **campos de Latitude/Longitude** ([whatsapp/page.tsx](src/app/dashboard/whatsapp/page.tsx):
  `latStr`/`lngStr`, `handleCoordChange`/`handleLocationUrlChange`) sincronizados com o
  campo do link: digitar as coordenadas monta o `locationUrl` como `"lat, lng"` (que o
  save lê por `parseLatLng`); colar um link que tem o ponto preenche os campos. Há também
  um botão **"Abrir o Google Maps para pegar as coordenadas"** que abre o Maps já buscando
  o endereço da loja (`ai_location_address`), se houver.
- **Foto:** upload para o bucket `product-images` (igual às fotos do banner),
  guarda a URL pública em `ai_store_photo_url`.
- **Vídeo:** mesmo esquema da foto — upload para `product-images`, URL pública em
  `ai_store_video_url` (**migration:**
  [supabase-migration-whatsapp-video.sql](supabase-migration-whatsapp-video.sql), só
  adiciona a coluna). O painel limita a ~16 MB (limite prático do WhatsApp/Evolution). A
  IA envia com `sendMedia` usando `mediatype: "video"`.
- **Como a IA dispara:** o `buildSystemPrompt`
  ([src/lib/ai/attendant.ts](src/lib/ai/attendant.ts)) recebe `hasLocationPin` /
  `hasStorePhoto` / `hasStoreVideo` e instrui a IA a incluir os marcadores
  `[[ENVIAR_LOCALIZACAO]]` / `[[ENVIAR_FOTO]]` / `[[ENVIAR_VIDEO]]` no fim da resposta. Quando o
  cliente pede a localização/endereço/como chegar, a IA **manda tudo de uma vez, sem perguntar**
  ("quer que eu envie o mapa?" é proibido no prompt): o **endereço em texto** + o **pino** +
  (se cadastrados) a **foto** e/ou o **vídeo**. O `respondToCustomer`
  ([src/lib/whatsappRespond.ts](src/lib/whatsappRespond.ts)) usa `parseReplyDirectives`
  para separar o texto dos marcadores e então chama `sendLocation` / `sendMedia`
  ([src/lib/evolution.ts](src/lib/evolution.ts)). O texto (sem marcadores) vai pelo
  `sendText` normal, **em partes** (com o `delayMs` do "digitando…").

### Catálogo em PDF (a IA anexa quando pedem)

Quando o cliente pede o catálogo/lista de produtos, a IA manda **o link do site**
(catálogo online, como sempre) **e também anexa um PDF** com todos os produtos, para o
cliente escolher pelo site OU folheando o PDF. **Sem migration** (o PDF mora no bucket
`product-images` que já existe; nada novo em tabela).

- **Geração:** [src/lib/catalogPdf.tsx](src/lib/catalogPdf.tsx) monta o PDF com
  **`@react-pdf/renderer`** (JS puro, roda no serverless da Vercel — sem Chrome/puppeteer).
  Cada produto vira um card: **foto de capa + nome + preço** (com risco no preço antigo em
  promoção) **+ cores + tamanhos + descrição**. O cabeçalho tem **logo + nome da loja** e um
  **QR code** (lib `qrcode`) que abre a loja; o rodapé traz a URL e a paginação. O
  `@react-pdf` só lê **JPG/PNG** — as fotos são baixadas e **recomprimidas com `sharp`**
  (`compressForPdf`: redimensiona p/ máx. 640px + JPEG q70) antes de embutir, o que derruba o
  tamanho do PDF (era ~7MB; as fotos full-res pesavam demais). O `sharp` também **converte WebP→JPEG**,
  então logos/fotos WebP agora entram (antes eram ignoradas). Se o `sharp` falhar, cai no buffer
  original. As imagens são baixadas com concorrência limitada. Como `@react-pdf` e `sharp` trazem
  deps/binários que quebram no bundler, ambos estão em
  `experimental.serverComponentsExternalPackages` no [next.config.mjs](next.config.mjs).
- **Cache no bucket:** `ensureCatalogPdfUrl` (em [catalogPdf.tsx](src/lib/catalogPdf.tsx))
  gera e guarda o PDF em `product-images/catalogos/{slug}.pdf` e devolve a **URL pública**
  (com `?v=` para furar cache de CDN). Regenera só se não existir ou se o cache passar de
  **30 min** (edições do lojista aparecem em até meia hora) — evita regerar a cada pedido no
  WhatsApp. Retorna `null` se a loja não tem produtos (não manda catálogo vazio).
- **Envio pela IA:** o `buildSystemPrompt`
  ([src/lib/ai/attendant.ts](src/lib/ai/attendant.ts)) recebe `hasCatalogPdf` (true quando a
  loja tem produtos) e instrui a IA a incluir o marcador **`[[ENVIAR_CATALOGO]]`** no fim da
  mensagem quando o cliente pede o catálogo/lista/PDF (além de mandar o link do site; no
  máximo uma vez por conversa). `parseReplyDirectives` extrai `sendCatalog`. **Gatilho
  determinístico:** como a IA nem sempre emite o marcador, o `respondToCustomer` também detecta
  quando **o cliente pediu** explicitamente (`customerWantsCatalog` = regex `catálogo`/`lista de
  produtos`/`pdf` no texto do cliente) e envia o PDF mesmo sem o marcador (`sendCatalog ||
  customerWantsCatalog`). O
  `respondToCustomer` ([src/lib/whatsappRespond.ts](src/lib/whatsappRespond.ts)) chama
  `ensureCatalogPdfUrl` (import dinâmico p/ não puxar o `@react-pdf` nas demais respostas) e
  envia com `sendMedia` **`mediatype: "document"`** + `fileName: "Catálogo - {Loja}.pdf"` +
  **`mimetype: "application/pdf"`**. O `sendMedia` em [evolution.ts](src/lib/evolution.ts) aceita
  `fileName` e `mimetype` — **documentos no Evolution v2 exigem o `mimetype`**; sem ele o anexo
  falhava em silêncio (o try/catch em `respondToCustomer` só loga, então o texto saía e o PDF não).
  Imagem/vídeo funcionam sem `mimetype` porque o Evolution infere o tipo.
- **Acesso por link (humanos):** [/api/loja/[slug]/catalogo](src/app/api/loja/[slug]/catalogo/route.ts)
  (`runtime nodejs`, `maxDuration 60`) gera/reaproveita o mesmo PDF e **redireciona** para ele —
  serve para baixar/abrir no navegador com a mesma lógica de cache.

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
(`tab`: Conexão · IA · Conversas · Pausar). A aba **Pausar** lista os clientes que já conversaram
(`listRecentCustomers` em [whatsappConfig.ts](src/lib/whatsappConfig.ts), das `whatsapp_messages`)
mesclados com os pausados; cada linha mostra um **selo de status** — "IA atendendo" (verde),
"Você assumiu" (handoff) / "Pausado por você" (manual), "IA pausada"/"IA desligada" — e um botão
**Pausar** ou **Reativar**. Cada linha tem seu **próprio seletor de tempo** (estado `rowDuration`
por telefone) que começa no **tempo padrão** do topo (`customerDuration`) e pode ser mudado só
naquele contato — o botão Pausar daquela linha usa esse valor. Durações: 15min/30min/1h/3h/1 dia/
"até eu reativar". Há ainda um campo para pausar um número que ainda não apareceu (usa o tempo padrão).

### Responder na mão (aba Conversas — WhatsApp Web dentro do painel)

A aba **Conversas** deixa o lojista **ler o histórico e responder manualmente** um cliente, estilo
WhatsApp Web. Componente [ConversationsPanel.tsx](src/components/dashboard/ConversationsPanel.tsx)
(montado só quando `tab === "conversas"`; nessa aba o container da página vira `max-w-5xl`). Layout
**duas colunas no desktop** (lista de conversas `lg:w-80` + thread) e **uma coluna no celular**
(lista → toca no contato → thread em tela cheia com seta de voltar). Balões: cliente à esquerda
(`role === "user"`), loja/IA à direita (`role === "assistant"`, roxo). Sem migration — usa
`whatsapp_messages`, `whatsapp_pauses` e `store_whatsapp` que já existem.

- **Dados:** a lista de contatos vem do mesmo `conversations` que a página já carrega de
  `GET /api/whatsapp/pause` (`listRecentCustomers`); o histórico completo de um contato vem de
  `GET /api/whatsapp/conversation?phone=` (`getFullConversation` em
  [whatsappConfig.ts](src/lib/whatsappConfig.ts), com horário por mensagem). O thread **atualiza
  sozinho a cada 12s** (polling) enquanto aberto.
- **Enviar (você assume a conversa):** `POST /api/whatsapp/conversation` `{phone, text}`
  ([route](src/app/api/whatsapp/conversation/route.ts), autentica o dono + service role) envia via
  `sendText` (Evolution), grava a mensagem como `assistant` no histórico **e pausa a IA para aquele
  cliente** (`setCustomerPause` com `reason='handoff'`, pelo tempo de `ai_handoff_minutes`; se
  desativado, 30min) — o mesmo comportamento do handoff automático. O painel atualiza as pausas
  (`onSent → loadPauses`), então o selo "você" aparece na lista. Exige o WhatsApp conectado
  (`status === "connected"`), senão o envio é bloqueado com aviso.
- **Pausar/Reativar no cabeçalho:** o botão **Pausar IA / Reativar IA** no topo da conversa chama
  `POST /api/whatsapp/pause` (`scope=customer`, `minutes=null` = até reativar) — o mesmo endpoint da
  aba Pausar, só que sem trocar de aba. Atualiza via `onSent`.
- **Tags na conversa:** cada conversa pode receber **tags** (rótulos como "Interessado", "Pago",
  "VIP"). Ficam numa barra abaixo do cabeçalho (chips removíveis + botão "+ Tag" com sugestões
  prontas `TAG_PRESETS` e campo livre) e também aparecem **na lista** de conversas. Cor por tag é
  determinística (hash → paleta). Armazenamento: tabela `whatsapp_conversation_tags`
  (`(store_id, customer_phone)` PK, `tags jsonb`; sem RLS, só service role) via
  `listConversationTags`/`setConversationTags` em [whatsappConfig.ts](src/lib/whatsappConfig.ts) e a
  rota [/api/whatsapp/tags](src/app/api/whatsapp/tags/route.ts) (GET mapa telefone→tags; POST
  `{phone, tags[]}`). **Migration:** rode
  [supabase-migration-whatsapp-tags.sql](supabase-migration-whatsapp-tags.sql). A rota tolera a
  tabela ausente (devolve vazio) até a migration ser aplicada.

### Follow-up automático (cutucar quem sumiu)

Se o cliente fica um tempo sem responder, a IA manda uma mensagem puxando para fechar o pedido. O
tempo é por loja. **Migration:** rode
[supabase-migration-whatsapp-followup.sql](supabase-migration-whatsapp-followup.sql) (adiciona
`ai_followup_minutes` (0 = desativado) e `ai_followup_message` em `store_whatsapp`; cria a tabela
`whatsapp_followups` que guarda `last_followup_at` por cliente para não repetir).

- **Configuração:** no painel (aba Atendente de IA), o lojista escolhe o tempo de silêncio
  (30min/1h/2h/3h/6h/1 dia) e, opcionalmente, uma **mensagem fixa**; vazio = a IA gera com base na
  conversa (`generateFollowupReply` em [src/lib/ai/attendant.ts](src/lib/ai/attendant.ts)).
- **Cron:** um workflow do **n8n** (self-hosted no mesmo VPS da Evolution/debounce) faz um
  `GET /api/whatsapp/followups?key=<CRON_SECRET>` a cada **~5 min** (nó *Schedule Trigger* →
  *HTTP Request*). O endpoint
  ([followups/route.ts](src/app/api/whatsapp/followups/route.ts)) aceita `GET` e `POST`, varre as
  lojas com follow-up ligado (`listFollowupConfigs`), e para cada cliente cutuca se: tem mensagem
  do cliente, `idle ∈ [minutos, minutos×3]` (não ressuscita conversas muito antigas), **não** está
  pausado (global/handoff/manual) e ainda não foi cutucado desde a última fala dele
  (`whatsapp_followups.last_followup_at >= lastUserAt`). Tetos de envio por loja/execução evitam
  timeout. Depois de enviar, grava a mensagem como `assistant` e atualiza `last_followup_at`.
  - **Por que n8n e não GitHub Actions:** o `schedule` do GitHub é impreciso (dispara de 1 em 1h+,
    não de 15 em 15 min) e a janela de follow-up é estreita (`[minutos, minutos×3]`), então o cron
    do GitHub perdia a janela quase sempre e o `sent` vinha 0. O n8n roda de verdade a cada 5 min,
    igual ao cron de debounce. O GitHub Action
    [.github/workflows/whatsapp-followups.yml](.github/workflows/whatsapp-followups.yml) ficou só
    com **disparo manual** (`workflow_dispatch`), como backup/depuração.
- **Variável de ambiente extra:** `CRON_SECRET` (segredo que protege o endpoint; sem ele o endpoint
  recusa). O n8n usa o mesmo `APP_BASE_URL` + `CRON_SECRET` do workflow de debounce.

### Pós-venda automático (perguntar se chegou certinho)

Alguns **dias** depois do pedido, a IA manda uma mensagem perguntando se chegou tudo certo. O prazo
é por loja. **Migration:** rode
[supabase-migration-whatsapp-postsale.sql](supabase-migration-whatsapp-postsale.sql) (adiciona
`ai_postsale_days` (0 = desativado) e `ai_postsale_message` em `store_whatsapp`; adiciona
`orders.postsale_sent_at` + índice parcial dos pedidos pendentes).

- **Configuração:** no painel (aba Atendente de IA), o lojista escolhe o prazo em dias e,
  opcionalmente, uma **mensagem fixa**; vazio = a IA gera (`generatePostsaleReply`, com fallback
  `defaultPostsaleMessage` quando a OpenAI não está configurada) — ambos em
  [src/lib/ai/attendant.ts](src/lib/ai/attendant.ts).
- **Mesmo cron do follow-up:** o endpoint [followups/route.ts](src/app/api/whatsapp/followups/route.ts)
  roda `runPostsale` junto. Varre as lojas com pós-venda ligado (`listPostsaleConfigs`) e os pedidos
  elegíveis (`listDuePostsaleOrders`: `postsale_sent_at IS NULL`, com `customer_phone`, criados entre
  o prazo e um teto de idade). Pula clientes pausados, envia para o telefone do pedido
  (`toWhatsAppNumber` em [src/lib/customerPhone.ts](src/lib/customerPhone.ts) prefixa o DDI 55) e
  grava `postsale_sent_at` (`markPostsaleSent`) para **não repetir**. Usa `orders.customer_phone`,
  `customer_name` e `order_number`.
- Usa o mesmo `CRON_SECRET` e o mesmo cron do n8n (~5 min) do follow-up — o endpoint
  [followups/route.ts](src/app/api/whatsapp/followups/route.ts) roda os dois na mesma chamada.

### Recuperação de carrinho abandonado (cutucar quem não finalizou)

Quando o cliente monta o carrinho na **loja pública**, informa **nome + WhatsApp**, mas **não
finaliza** o pedido, a IA cutuca depois de X minutos lembrando os itens. **Restrição inerente:** só
dá para recuperar quem deixou um telefone (sem contato, não há canal). O tempo é por loja.
**Migration:** rode
[supabase-migration-whatsapp-abandoned-cart.sql](supabase-migration-whatsapp-abandoned-cart.sql)
(adiciona `ai_cart_minutes` (0 = desativado) e `ai_cart_message` em `store_whatsapp`; cria a tabela
`whatsapp_abandoned_carts`, sem policies — só service role).

- **Captura (auto-save):** a loja pública ([LojaClient.tsx](src/app/loja/[slug]/LojaClient.tsx))
  salva um rascunho **com debounce (~2,5s)** assim que há **itens + nome (≥2) + telefone válido** no
  carrinho, via `POST /api/loja/abandoned-cart`
  ([route](src/app/api/loja/abandoned-cart/route.ts), service role). O endpoint só grava se a loja
  **ativou** o recurso (`ai_cart_minutes > 0`) e normaliza o telefone para o formato WhatsApp
  (`toWhatsAppNumber`, DDI 55) — mesma chave usada nas pausas. UPSERT por `(store_id,
  customer_phone)`; **nova atividade re-arma** (`recovered_at`/`converted` voltam a zero).
- **Conversão:** quando o pedido é criado ([/api/orders](src/app/api/orders/route.ts)), o rascunho
  daquele telefone vira `converted = true` (`markCartConverted`) — não cutuca quem já comprou.
- **Cron (mesmo do follow-up):** o endpoint [followups/route.ts](src/app/api/whatsapp/followups/route.ts)
  roda `runAbandonedCarts` junto (n8n, ~5 min). Varre as lojas com o recurso ligado
  (`listAbandonedCartConfigs`) e os rascunhos elegíveis (`listDueAbandonedCarts`: parados em
  `updated_at ∈ [minutos, minutos×3]`, `recovered_at IS NULL`, `converted = false`). Pula clientes
  pausados (global/handoff/manual), gera a mensagem com `generateAbandonedCartReply`
  ([attendant.ts](src/lib/ai/attendant.ts) — cita os itens do carrinho; usa `ai_cart_message` fixa se
  houver), envia via `sendText`, grava como `assistant` no histórico e marca `recovered_at`
  (`markCartRecovered`) para **não repetir**.
- **Painel** (aba Atendente de IA, [whatsapp/page.tsx](src/app/dashboard/whatsapp/page.tsx)): seletor
  de tempo (`CART_OPTIONS`: 30min/1h/2h/3h/6h/1 dia). A mensagem é gerada pela IA citando os itens
  (o `ai_cart_message` fixo existe no banco/cron, mas ainda não é exposto na UI).

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
