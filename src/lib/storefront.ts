/**
 * Configurações visuais da loja pública (coluna `stores.storefront` JSONB).
 */

/** Bolinha “Categorias” abaixo do banner (estilo stories). */
export type StorefrontCategoryItem = {
  label: string;
  /** URL da foto; vazio = placeholder cinza */
  imageUrl: string;
  /** Nome de outra categoria desta lista (opcional; para hierarquia / organização). */
  parentLabel?: string;
};

export type StorefrontSettings = {
  heroSubtitle: string;
  /** Título grande do banner; vazio = usa o nome da loja */
  heroTitle: string;
  heroCtaLabel: string;
  /** Ex.: #catalogo ou URL externa */
  heroCtaHref: string;
  /** Fotos do lado direito do banner (1 = estático; 2+ = carrossel) */
  heroImages: string[];
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
};

export const DEFAULT_STOREFRONT: StorefrontSettings = {
  heroSubtitle: "Bem-vindo à nossa loja",
  heroTitle: "",
  heroCtaLabel: "Ver produtos",
  heroCtaHref: "#catalogo",
  heroImages: [],
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
  footerShippingLine: "",
  footerReturnsLine: "",
  footerPolicyUrl: "",
  footerPhone: "",
  footerEmail: "",
  footerWebsite: "",
  footerHours: "",
  footerShowPix: false,
  footerShowCash: false,
};

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

/** Lê heroImages[] ou migra heroImage legado (uma foto). */
function heroImagesFromDb(o: Record<string, unknown>): string[] {
  const arr = o.heroImages;
  if (Array.isArray(arr)) {
    return arr
      .filter((x): x is string => typeof x === "string")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 10);
  }
  const single = o.heroImage;
  if (typeof single === "string" && single.trim()) {
    return [single.trim()];
  }
  return [];
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
    heroImages: heroImagesFromDb(o),
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
  };
}

export function storefrontToDb(s: StorefrontSettings): Record<string, unknown> {
  return {
    heroSubtitle: s.heroSubtitle.trim(),
    heroTitle: s.heroTitle.trim(),
    heroCtaLabel: s.heroCtaLabel.trim(),
    heroCtaHref: s.heroCtaHref.trim() || "#catalogo",
    heroImages: s.heroImages
      .map((u) => u.trim())
      .filter(Boolean)
      .slice(0, 10),
    infoBullets: s.infoBullets.map((b) => b.trim()).filter(Boolean),
    themePrimary: s.themePrimary.trim(),
    themeSecondary: s.themeSecondary.trim(),
    headerBackground: s.headerBackground.trim(),
    searchPlaceholder: s.searchPlaceholder.trim(),
    instagramUrl: s.instagramUrl.trim(),
    facebookUrl: s.facebookUrl.trim(),
    tiktokUrl: s.tiktokUrl.trim(),
    youtubeUrl: s.youtubeUrl.trim(),
    footerShippingLine: s.footerShippingLine.trim(),
    footerReturnsLine: s.footerReturnsLine.trim(),
    footerPolicyUrl: s.footerPolicyUrl.trim(),
    footerPhone: s.footerPhone.trim(),
    footerEmail: s.footerEmail.trim(),
    footerWebsite: s.footerWebsite.trim(),
    footerHours: s.footerHours.trim(),
    footerShowPix: s.footerShowPix,
    footerShowCash: s.footerShowCash,
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
