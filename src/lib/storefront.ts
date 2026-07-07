/**
 * Configurações visuais da loja pública (coluna `stores.storefront` JSONB).
 */
import {
  type StoreBlock,
  type StoreBlockType,
  STORE_BLOCK_TYPES,
} from "@/components/storefront/blocks/types";

/**
 * O banner é um único carrossel: as fotos passam uma atrás da outra (1→2→…).
 * Cada foto é um "banner". A quantidade máxima depende do plano.
 */
export const MAX_BANNER_PHOTOS_CHEAP = 5; // plano mais barato
export const MAX_BANNER_PHOTOS_OTHER = 10; // demais planos
/** Teto absoluto guardado/renderizado (defensivo, p. ex. após downgrade). */
export const MAX_BANNER_PHOTOS_ABS = MAX_BANNER_PHOTOS_OTHER;

/**
 * Limite de fotos no banner pelo plano. Plano mais barato → 5; qualquer
 * outro → 10. `planId` é o plano atual da loja; `cheapestPlanId` o de menor
 * preço. Sem plano/desconhecido → trata como o mais barato (5).
 */
export function bannerPhotoLimitForPlan(
  planId: string | null | undefined,
  cheapestPlanId: string | null | undefined
): number {
  if (planId && cheapestPlanId && planId !== cheapestPlanId) {
    return MAX_BANNER_PHOTOS_OTHER;
  }
  return MAX_BANNER_PHOTOS_CHEAP;
}

/** Proporção ideal do banner na loja pública (1920×600 ≈ 3.2:1). */
export const HERO_RECOMMENDED_WIDTH = 1920;
export const HERO_RECOMMENDED_HEIGHT = 600;
export const HERO_TARGET_RATIO = HERO_RECOMMENDED_WIDTH / HERO_RECOMMENDED_HEIGHT;

/**
 * Formato do banner:
 * - `overlay` (padrão): foto ocupa tudo e o texto fica por cima.
 * - `split`: foto de um lado e o texto do outro (painel colorido).
 */
export type HeroLayout = "overlay" | "split";
/** No formato `split`, de que lado fica a foto. */
export type HeroSplitPhotoSide = "left" | "right";

/**
 * Proporção de recorte da foto no formato "ao lado" (split). O espaço da foto
 * ali é mais em pé/quadrado (não deitado como o banner de fundo), então
 * recortamos ~quadrado (1:1) — encaixa bem no celular e no desktop.
 */
export const HERO_SPLIT_RATIO = 1;

export function heroLayoutFromDb(v: unknown): HeroLayout {
  return v === "split" ? "split" : "overlay";
}

export function heroSplitPhotoSideFromDb(v: unknown): HeroSplitPhotoSide {
  return v === "left" ? "left" : "right";
}

/** Proporção de recorte recomendada conforme o formato da foto. */
export function heroCropRatioForLayout(layout: HeroLayout): number {
  return layout === "split" ? HERO_SPLIT_RATIO : HERO_TARGET_RATIO;
}

/**
 * Avalia se uma foto serve para o formato escolhido sem cortar demais.
 * - overlay: banner largo → fotos em pé perdem as bordas.
 * - split: espaço ~quadrado → fotos muito deitadas ou muito em pé cortam.
 */
export function heroImageProportionWarning(
  width: number,
  height: number,
  layout: HeroLayout = "overlay"
): string | null {
  if (!width || !height) return null;
  const ratio = width / height;
  if (layout === "split") {
    if (ratio > 1.7) {
      return "Foto muito deitada para o formato ao lado: o topo e a base podem ser cortados.";
    }
    if (ratio < 0.55) {
      return "Foto muito em pé para o formato ao lado: as laterais podem ser cortadas.";
    }
    return null;
  }
  if (ratio < 1.2) {
    return "Foto quadrada ou em pé: vai cortar bastante as bordas. O ideal é uma foto larga (paisagem).";
  }
  if (ratio < HERO_TARGET_RATIO * 0.72) {
    return "Foto pouco larga para o banner: as laterais podem ser cortadas.";
  }
  if (ratio > HERO_TARGET_RATIO * 1.55) {
    return "Foto muito larga/fininha: o topo e a base podem ser cortados.";
  }
  return null;
}

/**
 * Uma foto do banner com seu próprio formato E seu próprio conteúdo.
 * `layout`/`photoSide` são por foto — mudar uma não afeta as outras.
 * Os campos de texto são opcionais: **vazio = usa o texto geral do banner**
 * (`heroSubtitle`/`heroTitle`/… em `StorefrontSettings`), então lojas simples
 * podem ter um texto só para todas as fotos.
 */
export type HeroSlide = {
  url: string;
  layout: HeroLayout;
  /** Só usado quando `layout === "split"`. */
  photoSide: HeroSplitPhotoSide;
  /** Etiqueta pequena (linha de cima, em maiúsculas). */
  badge?: string;
  /** Título grande. */
  title?: string;
  /** Destaque em degradê animado + fonte cursiva (2ª linha, ex.: "para o verão"). */
  highlight?: string;
  /** Frase de apoio. */
  subtitle?: string;
  /** Cupom "Use o código …". */
  couponCode?: string;
  /** Texto do botão. */
  ctaLabel?: string;
  /** Link do botão (âncora #catalogo ou URL). */
  ctaHref?: string;
};

/** Campos de texto por slide (para ler/gravar mantendo só os preenchidos). */
const HERO_SLIDE_TEXT_KEYS = [
  "badge",
  "title",
  "highlight",
  "subtitle",
  "couponCode",
  "ctaLabel",
  "ctaHref",
] as const;

/** Extrai os textos preenchidos de um slide (ignora vazios → usa o geral). */
function heroSlideTextFromRaw(
  s: Record<string, unknown>
): Partial<HeroSlide> {
  const out: Partial<HeroSlide> = {};
  for (const k of HERO_SLIDE_TEXT_KEYS) {
    const v = typeof s[k] === "string" ? (s[k] as string).trim() : "";
    if (v) out[k] = v;
  }
  return out;
}

/**
 * Card promocional colorido exibido **abaixo do banner** (faixa de 3).
 * `from`/`to` = cores do gradiente (hex). `href` = âncora #catalogo ou URL.
 */
export type PromoCard = {
  eyebrow: string;
  title: string;
  subtitle: string;
  ctaLabel: string;
  href: string;
  from: string;
  to: string;
};

/** Máximo de cards promocionais abaixo do banner. */
export const MAX_PROMO_CARDS = 6;

/** Cards prontos ("pré-moldados") para o lojista adicionar com 1 clique. */
export const PROMO_CARD_PRESETS: { id: string; label: string; card: PromoCard }[] = [
  {
    id: "imperdivel",
    label: "Imperdível (laranja)",
    card: {
      eyebrow: "🔥 Imperdível",
      title: "Camisetas & Polos",
      subtitle: "A partir de R$ 39",
      ctaLabel: "Explorar",
      href: "#catalogo",
      from: "#fb923c",
      to: "#ea580c",
    },
  },
  {
    id: "destaque",
    label: "Destaque (roxo)",
    card: {
      eyebrow: "✨ Destaque",
      title: "Vestidos",
      subtitle: "Coleção nova",
      ctaLabel: "Ver modelos",
      href: "#catalogo",
      from: "#a855f7",
      to: "#7e22ce",
    },
  },
  {
    id: "oferta",
    label: "Oferta (azul)",
    card: {
      eyebrow: "⚡ Oferta",
      title: "Até 50% OFF",
      subtitle: "Peças selecionadas",
      ctaLabel: "Aproveitar",
      href: "#catalogo",
      from: "#2563eb",
      to: "#0c2b6b",
    },
  },
  {
    id: "frete",
    label: "Frete grátis (verde)",
    card: {
      eyebrow: "🚚 Frete grátis",
      title: "Acima de R$ 99",
      subtitle: "Para todo o Brasil",
      ctaLabel: "Comprar",
      href: "#catalogo",
      from: "#10b981",
      to: "#047857",
    },
  },
  {
    id: "novidade",
    label: "Novidade (rosa)",
    card: {
      eyebrow: "🆕 Novidade",
      title: "Recém-chegados",
      subtitle: "Confira as novidades",
      ctaLabel: "Ver agora",
      href: "#catalogo",
      from: "#ec4899",
      to: "#be185d",
    },
  },
  {
    id: "premium",
    label: "Premium (escuro)",
    card: {
      eyebrow: "👑 Premium",
      title: "Seleção especial",
      subtitle: "As melhores peças",
      ctaLabel: "Descobrir",
      href: "#catalogo",
      from: "#334155",
      to: "#0f172a",
    },
  },
];

/** Só as cores dos presets, para recolorir um card existente. */
export const PROMO_CARD_COLORS = PROMO_CARD_PRESETS.map((p) => ({
  id: p.id,
  from: p.card.from,
  to: p.card.to,
}));

function promoCardsFromDb(v: unknown): PromoCard[] {
  if (!Array.isArray(v)) return [];
  const out: PromoCard[] = [];
  for (const raw of v) {
    if (!raw || typeof raw !== "object") continue;
    const o = raw as Record<string, unknown>;
    const pick = (k: string) =>
      typeof o[k] === "string" ? (o[k] as string).trim() : "";
    const card: PromoCard = {
      eyebrow: pick("eyebrow"),
      title: pick("title"),
      subtitle: pick("subtitle"),
      ctaLabel: pick("ctaLabel"),
      href: pick("href"),
      from: pick("from") || "#334155",
      to: pick("to") || "#0f172a",
    };
    // Ignora cards totalmente vazios.
    if (!card.eyebrow && !card.title && !card.subtitle) continue;
    out.push(card);
    if (out.length >= MAX_PROMO_CARDS) break;
  }
  return out;
}

/** Bolinha “Categorias” abaixo do banner (estilo stories). */
export type StorefrontCategoryItem = {
  label: string;
  /** URL da foto; vazio = placeholder cinza */
  imageUrl: string;
  /** Nome de outra categoria desta lista (opcional; para hierarquia / organização). */
  parentLabel?: string;
};

/** Formato da foto nos cards de produto da loja: quadrado (1:1) ou retrato (3:4). */
export type ProductCardRatio = "1:1" | "3:4";

export function productCardRatioFromDb(v: unknown): ProductCardRatio {
  return v === "3:4" ? "3:4" : "1:1";
}

export type StorefrontSettings = {
  heroSubtitle: string;
  /** Título grande do banner; vazio = usa o nome da loja */
  heroTitle: string;
  heroCtaLabel: string;
  /** Ex.: #catalogo ou URL externa */
  heroCtaHref: string;
  /**
   * Fotos do banner — um único carrossel: passam uma atrás da outra na loja
   * (1 = estática; 2+ = passa sozinha). Vazio = sem banner. Cada foto tem seu
   * próprio formato (`layout`/`photoSide`). A quantidade é limitada pelo plano
   * (ver `bannerPhotoLimitForPlan`).
   */
  heroSlides: HeroSlide[];
  /** Formato aplicado às PRÓXIMAS fotos adicionadas (padrão do editor). */
  heroLayout: HeroLayout;
  /** Lado padrão da foto (dividido) para as próximas fotos adicionadas. */
  heroSplitPhotoSide: HeroSplitPhotoSide;
  /** Código de cupom mostrado no banner (opcional; ex.: "BEMVINDO10"). */
  heroCouponCode: string;
  /** Cards promocionais coloridos exibidos abaixo do banner (faixa de 3). */
  promoCards: PromoCard[];
  /** Mostra a barra de menu de categorias no topo (abaixo do cabeçalho). */
  showCategoryNav: boolean;
  /** Formato da foto dos cards de produto na loja: "1:1" (quadrado) ou "3:4" (retrato). */
  productCardRatio: ProductCardRatio;
  /**
   * A loja controla estoque. `true` (padrão): produto/variação sem estoque
   * aparece como "Esgotado" e limita a quantidade. `false`: a loja não controla
   * estoque — nunca mostra "Esgotado" e não limita a quantidade.
   */
  stockControlEnabled: boolean;
  /** Frases curtas abaixo do logo (ex.: pedido mínimo) */
  infoBullets: string[];
  /** Cor de destaque (botões catálogo, detalhes) — ex. rosa pó */
  themePrimary: string;
  /** Cor escura (hero, botões promoção) — ex. vinho/marrom */
  themeSecondary: string;
  /** Fundo do topo da loja (logo, busca, ícones) — hex ou rgba */
  headerBackground: string;
  searchPlaceholder: string;
  /** URL completa do perfil (ex. https://instagram.com/sualoja) */
  instagramUrl: string;
  facebookUrl: string;
  tiktokUrl: string;
  youtubeUrl: string;
  /** Até 8 categorias na faixa abaixo do banner; vazio na loja usa fallback visual */
  categories: StorefrontCategoryItem[];
  /** Endereço de retirada mostrado ao cliente quando escolhe "Retirada" no carrinho. */
  pickupAddress: string;
  /** Instruções de como retirar (horário, levar código etc.) — entram na mensagem e no prompt da IA. */
  pickupInstructions: string;
  /** Mostra Pix como opção de pagamento no checkout (exige `pixKey`). */
  checkoutPixEnabled: boolean;
  /** Mostra "Dinheiro na entrega" como opção de pagamento no checkout. */
  checkoutCashEnabled: boolean;
  /** Mostra "Cartão na entrega" como opção de pagamento no checkout. */
  checkoutCardEnabled: boolean;
  /** Mostra "Mercado Pago" no checkout (exige também o gateway conectado). */
  checkoutMercadoPagoEnabled: boolean;
  /** Bloco comercial abaixo do catálogo (frete, contato, pagamentos, redes). */
  footerShippingLine: string;
  footerReturnsLine: string;
  /** URL das políticas de devolução (https… ou domínio). */
  footerPolicyUrl: string;
  footerPhone: string;
  footerEmail: string;
  footerWebsite: string;
  footerHours: string;
  footerShowPix: boolean;
  footerShowCash: boolean;
  /** Chave Pix da loja (CPF/CNPJ, telefone, e-mail ou aleatória) — entra na mensagem de pedido por WhatsApp. */
  pixKey: string;
  /** Nome do titular da conta Pix (mostrado junto da chave). */
  pixName: string;
  /** ID do Pixel do Facebook/Meta (só números) — carrega o rastreamento na loja pública. */
  facebookPixelId: string;
  /** ID da tag do Google: GA4 "G-…", Google Ads "AW-…" ou Tag Manager "GTM-…". */
  googleAnalyticsId: string;
  /**
   * Blocos de conteúdo extra (builder), renderizados abaixo dos produtos na
   * ordem do array. Ver `src/components/storefront/blocks`. Mora no mesmo JSONB.
   */
  contentBlocks: StoreBlock[];
};

export const DEFAULT_STOREFRONT: StorefrontSettings = {
  heroSubtitle: "Bem-vindo à nossa loja",
  heroTitle: "",
  heroCtaLabel: "Ver produtos",
  heroCtaHref: "#catalogo",
  heroSlides: [],
  heroLayout: "overlay",
  heroSplitPhotoSide: "right",
  heroCouponCode: "",
  promoCards: [],
  showCategoryNav: true,
  productCardRatio: "1:1",
  stockControlEnabled: true,
  infoBullets: [],
  themePrimary: "#c9a8ac",
  themeSecondary: "#5c2e36",
  headerBackground: "#ffffff",
  searchPlaceholder: "Faça sua busca",
  instagramUrl: "",
  facebookUrl: "",
  tiktokUrl: "",
  youtubeUrl: "",
  categories: [],
  pickupAddress: "",
  pickupInstructions: "",
  checkoutPixEnabled: true,
  checkoutCashEnabled: false,
  checkoutCardEnabled: false,
  checkoutMercadoPagoEnabled: true,
  footerShippingLine: "",
  footerReturnsLine: "",
  footerPolicyUrl: "",
  footerPhone: "",
  footerEmail: "",
  footerWebsite: "",
  footerHours: "",
  footerShowPix: false,
  footerShowCash: false,
  pixKey: "",
  pixName: "",
  facebookPixelId: "",
  googleAnalyticsId: "",
  contentBlocks: [],
};

/** Só dígitos (ID do Pixel do Facebook). Evita injeção no `<script>`. */
export function sanitizeFacebookPixelId(v: unknown): string {
  if (typeof v !== "string") return "";
  return v.replace(/\D/g, "").slice(0, 20);
}

/**
 * ID de tag do Google (GA4 `G-…`, Ads `AW-…`, GTM `GTM-…`). Só letras,
 * números e hífen — evita injeção no `<script>`; força maiúsculas.
 */
export function sanitizeGoogleTagId(v: unknown): string {
  if (typeof v !== "string") return "";
  return v
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "")
    .slice(0, 30);
}

/** Máximo de blocos de conteúdo guardados (defensivo). */
const MAX_CONTENT_BLOCKS = 20;

const KNOWN_BLOCK_TYPES = new Set<StoreBlockType>(STORE_BLOCK_TYPES);

/**
 * Sanitiza a lista de blocos vinda do banco: mantém só entradas com `id`,
 * `type` conhecido e `config` objeto. A config em si é validada/limitada em
 * runtime pelos próprios componentes (fallbacks + `limitText`).
 */
function contentBlocksFromDb(v: unknown): StoreBlock[] {
  if (!Array.isArray(v)) return [];
  const out: StoreBlock[] = [];
  for (const raw of v) {
    if (!raw || typeof raw !== "object") continue;
    const o = raw as Record<string, unknown>;
    const type = o.type;
    if (typeof type !== "string" || !KNOWN_BLOCK_TYPES.has(type as StoreBlockType)) {
      continue;
    }
    const id =
      typeof o.id === "string" && o.id.trim()
        ? o.id
        : `blk_${out.length}_${Math.random().toString(36).slice(2, 8)}`;
    const config =
      o.config && typeof o.config === "object"
        ? (o.config as Record<string, unknown>)
        : {};
    out.push({ id, type, config } as StoreBlock);
    if (out.length >= MAX_CONTENT_BLOCKS) break;
  }
  return out;
}

function str(v: unknown, fallback: string): string {
  return typeof v === "string" ? v : fallback;
}

function strOrEmpty(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function boolFromDb(v: unknown, fallback: boolean): boolean {
  if (typeof v === "boolean") return v;
  return fallback;
}

/** Exibe o rodapé comercial na loja pública quando houver algo configurado. */
export function storefrontRichFooterVisible(sf: StorefrontSettings): boolean {
  const text =
    sf.footerShippingLine.trim() ||
    sf.footerReturnsLine.trim() ||
    sf.footerPolicyUrl.trim() ||
    sf.footerPhone.trim() ||
    sf.footerEmail.trim() ||
    sf.footerWebsite.trim() ||
    sf.footerHours.trim();
  const pay = sf.footerShowPix || sf.footerShowCash;
  const social =
    sf.instagramUrl.trim() ||
    sf.facebookUrl.trim() ||
    sf.tiktokUrl.trim() ||
    sf.youtubeUrl.trim();
  return Boolean(text || pay || social);
}

function bulletsFromDb(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is string => typeof x === "string")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 8);
}

function categoriesFromDb(v: unknown): StorefrontCategoryItem[] {
  if (!Array.isArray(v)) return [];
  const out: StorefrontCategoryItem[] = [];
  for (const raw of v) {
    if (!raw || typeof raw !== "object") continue;
    const o = raw as Record<string, unknown>;
    const label =
      typeof o.label === "string" ? o.label.trim() : "";
    if (!label) continue;
    const imageUrl =
      typeof o.imageUrl === "string" ? o.imageUrl.trim() : "";
    const parentRaw =
      typeof o.parentLabel === "string" ? o.parentLabel.trim() : "";
    const parentLabel =
      parentRaw &&
      parentRaw.localeCompare(label, "pt", { sensitivity: "base" }) !== 0
        ? parentRaw
        : undefined;
    out.push({ label, imageUrl, parentLabel });
    if (out.length >= 8) break;
  }
  return out;
}

/** Lista de strings não-vazias e aparadas (ignora não-strings). */
function sanitizeStringList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((x): x is string => typeof x === "string")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** URLs antigas (string[]) achatadas de qualquer formato legado do banner. */
function legacyHeroUrls(o: Record<string, unknown>): string[] {
  const direct = sanitizeStringList(o.heroImages);
  if (direct.length > 0) return direct;
  // Legado: heroCarousels (faixas) → achata na ordem em uma lista só.
  if (Array.isArray(o.heroCarousels)) {
    const flat = o.heroCarousels.flatMap((c) => sanitizeStringList(c));
    if (flat.length > 0) return flat;
  }
  // Legado mais antigo: heroImage (uma foto só).
  const single = o.heroImage;
  if (typeof single === "string" && single.trim()) return [single.trim()];
  return [];
}

/**
 * Fotos do banner com formato por foto (`heroSlides`). Migra o formato antigo
 * (`heroImages`/`heroCarousels`/`heroImage`, que eram só URLs) aplicando o
 * formato global anterior (`heroLayout`/`heroSplitPhotoSide`) em cada foto.
 * Cap no teto absoluto.
 */
function heroSlidesFromDb(o: Record<string, unknown>): HeroSlide[] {
  // Novo formato: lista de objetos { url, layout, photoSide }.
  if (Array.isArray(o.heroSlides)) {
    const out: HeroSlide[] = [];
    for (const raw of o.heroSlides) {
      if (!raw || typeof raw !== "object") continue;
      const s = raw as Record<string, unknown>;
      const url = typeof s.url === "string" ? s.url.trim() : "";
      if (!url) continue;
      out.push({
        url,
        layout: heroLayoutFromDb(s.layout),
        photoSide: heroSplitPhotoSideFromDb(s.photoSide),
        ...heroSlideTextFromRaw(s),
      });
      if (out.length >= MAX_BANNER_PHOTOS_ABS) break;
    }
    if (out.length > 0) return out;
  }
  // Legado: só URLs → herdam o formato global que existia.
  const layout = heroLayoutFromDb(o.heroLayout);
  const photoSide = heroSplitPhotoSideFromDb(o.heroSplitPhotoSide);
  return legacyHeroUrls(o)
    .slice(0, MAX_BANNER_PHOTOS_ABS)
    .map((url) => ({ url, layout, photoSide }));
}

/** Sanitiza a lista de slides para gravar (aparadas, com formato válido, cap). */
function heroSlidesToDb(slides: HeroSlide[]): HeroSlide[] {
  if (!Array.isArray(slides)) return [];
  const out: HeroSlide[] = [];
  for (const s of slides) {
    const url = typeof s?.url === "string" ? s.url.trim() : "";
    if (!url) continue;
    out.push({
      url,
      layout: heroLayoutFromDb(s.layout),
      photoSide: heroSplitPhotoSideFromDb(s.photoSide),
      ...heroSlideTextFromRaw(s as unknown as Record<string, unknown>),
    });
    if (out.length >= MAX_BANNER_PHOTOS_ABS) break;
  }
  return out;
}

/** Normaliza entrada do vendedor para URL do Instagram. */
export function normalizeInstagramUrl(raw: string): string {
  const s = raw.trim();
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) return s;
  if (/instagram\.com/i.test(s)) {
    return `https://${s.replace(/^\/+/, "").replace(/^https?:\/\//i, "")}`;
  }
  const user = s.replace(/^@/, "").split("/")[0]?.trim();
  if (!user) return "";
  return `https://instagram.com/${user}`;
}

export function normalizeSocialUrl(raw: string): string {
  const s = raw.trim();
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) return s;
  return `https://${s.replace(/^\/+/, "")}`;
}

/** Aceita null, objeto vazio ou JSON parcial. */
export function storefrontFromDb(value: unknown): StorefrontSettings {
  if (!value || typeof value !== "object") {
    return { ...DEFAULT_STOREFRONT };
  }
  const o = value as Record<string, unknown>;
  return {
    heroSubtitle: str(o.heroSubtitle, DEFAULT_STOREFRONT.heroSubtitle),
    heroTitle: strOrEmpty(o.heroTitle),
    heroCtaLabel: str(o.heroCtaLabel, DEFAULT_STOREFRONT.heroCtaLabel),
    heroCtaHref: str(o.heroCtaHref, DEFAULT_STOREFRONT.heroCtaHref),
    heroSlides: heroSlidesFromDb(o),
    heroLayout: heroLayoutFromDb(o.heroLayout),
    heroSplitPhotoSide: heroSplitPhotoSideFromDb(o.heroSplitPhotoSide),
    heroCouponCode: strOrEmpty(o.heroCouponCode),
    promoCards: promoCardsFromDb(o.promoCards),
    showCategoryNav: boolFromDb(o.showCategoryNav, DEFAULT_STOREFRONT.showCategoryNav),
    productCardRatio: productCardRatioFromDb(o.productCardRatio),
    stockControlEnabled: boolFromDb(
      o.stockControlEnabled,
      DEFAULT_STOREFRONT.stockControlEnabled
    ),
    infoBullets: bulletsFromDb(o.infoBullets),
    themePrimary: str(o.themePrimary, DEFAULT_STOREFRONT.themePrimary),
    themeSecondary: str(o.themeSecondary, DEFAULT_STOREFRONT.themeSecondary),
    headerBackground: str(
      o.headerBackground,
      DEFAULT_STOREFRONT.headerBackground
    ),
    searchPlaceholder: str(
      o.searchPlaceholder,
      DEFAULT_STOREFRONT.searchPlaceholder
    ),
    instagramUrl: strOrEmpty(o.instagramUrl),
    facebookUrl: strOrEmpty(o.facebookUrl),
    tiktokUrl: strOrEmpty(o.tiktokUrl),
    youtubeUrl: strOrEmpty(o.youtubeUrl),
    categories: categoriesFromDb(o.categories),
    pickupAddress: strOrEmpty(o.pickupAddress),
    pickupInstructions: strOrEmpty(o.pickupInstructions),
    checkoutPixEnabled: boolFromDb(
      o.checkoutPixEnabled,
      DEFAULT_STOREFRONT.checkoutPixEnabled
    ),
    checkoutCashEnabled: boolFromDb(
      o.checkoutCashEnabled,
      DEFAULT_STOREFRONT.checkoutCashEnabled
    ),
    checkoutCardEnabled: boolFromDb(
      o.checkoutCardEnabled,
      DEFAULT_STOREFRONT.checkoutCardEnabled
    ),
    checkoutMercadoPagoEnabled: boolFromDb(
      o.checkoutMercadoPagoEnabled,
      DEFAULT_STOREFRONT.checkoutMercadoPagoEnabled
    ),
    footerShippingLine: strOrEmpty(o.footerShippingLine),
    footerReturnsLine: strOrEmpty(o.footerReturnsLine),
    footerPolicyUrl: strOrEmpty(o.footerPolicyUrl),
    footerPhone: strOrEmpty(o.footerPhone),
    footerEmail: strOrEmpty(o.footerEmail),
    footerWebsite: strOrEmpty(o.footerWebsite),
    footerHours: strOrEmpty(o.footerHours),
    footerShowPix: boolFromDb(o.footerShowPix, DEFAULT_STOREFRONT.footerShowPix),
    footerShowCash: boolFromDb(
      o.footerShowCash,
      DEFAULT_STOREFRONT.footerShowCash
    ),
    pixKey: strOrEmpty(o.pixKey),
    pixName: strOrEmpty(o.pixName),
    facebookPixelId: sanitizeFacebookPixelId(o.facebookPixelId),
    googleAnalyticsId: sanitizeGoogleTagId(o.googleAnalyticsId),
    contentBlocks: contentBlocksFromDb(o.contentBlocks),
  };
}

export function storefrontToDb(s: StorefrontSettings): Record<string, unknown> {
  return {
    heroSubtitle: s.heroSubtitle.trim(),
    heroTitle: s.heroTitle.trim(),
    heroCtaLabel: s.heroCtaLabel.trim(),
    heroCtaHref: s.heroCtaHref.trim() || "#catalogo",
    heroSlides: heroSlidesToDb(s.heroSlides),
    heroLayout: heroLayoutFromDb(s.heroLayout),
    heroSplitPhotoSide: heroSplitPhotoSideFromDb(s.heroSplitPhotoSide),
    heroCouponCode: s.heroCouponCode.trim(),
    promoCards: promoCardsFromDb(s.promoCards),
    showCategoryNav: s.showCategoryNav,
    productCardRatio: productCardRatioFromDb(s.productCardRatio),
    stockControlEnabled: s.stockControlEnabled,
    infoBullets: s.infoBullets.map((b) => b.trim()).filter(Boolean),
    themePrimary: s.themePrimary.trim(),
    themeSecondary: s.themeSecondary.trim(),
    headerBackground: s.headerBackground.trim(),
    searchPlaceholder: s.searchPlaceholder.trim(),
    instagramUrl: s.instagramUrl.trim(),
    facebookUrl: s.facebookUrl.trim(),
    tiktokUrl: s.tiktokUrl.trim(),
    youtubeUrl: s.youtubeUrl.trim(),
    pickupAddress: s.pickupAddress.trim(),
    pickupInstructions: s.pickupInstructions.trim(),
    checkoutPixEnabled: s.checkoutPixEnabled,
    checkoutCashEnabled: s.checkoutCashEnabled,
    checkoutCardEnabled: s.checkoutCardEnabled,
    checkoutMercadoPagoEnabled: s.checkoutMercadoPagoEnabled,
    footerShippingLine: s.footerShippingLine.trim(),
    footerReturnsLine: s.footerReturnsLine.trim(),
    footerPolicyUrl: s.footerPolicyUrl.trim(),
    footerPhone: s.footerPhone.trim(),
    footerEmail: s.footerEmail.trim(),
    footerWebsite: s.footerWebsite.trim(),
    footerHours: s.footerHours.trim(),
    footerShowPix: s.footerShowPix,
    footerShowCash: s.footerShowCash,
    pixKey: s.pixKey.trim(),
    pixName: s.pixName.trim(),
    facebookPixelId: sanitizeFacebookPixelId(s.facebookPixelId),
    googleAnalyticsId: sanitizeGoogleTagId(s.googleAnalyticsId),
    contentBlocks: contentBlocksFromDb(s.contentBlocks).slice(
      0,
      MAX_CONTENT_BLOCKS
    ),
    categories: s.categories
      .map((c) => {
        const label = c.label.trim();
        const imageUrl = c.imageUrl.trim();
        const p = c.parentLabel?.trim();
        const parentLabel =
          p && p.localeCompare(label, "pt", { sensitivity: "base" }) !== 0
            ? p
            : undefined;
        return { label, imageUrl, parentLabel };
      })
      .filter((c) => c.label)
      .slice(0, 8),
  };
}
