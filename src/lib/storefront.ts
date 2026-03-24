/**
 * Configurações visuais da loja pública (coluna `stores.storefront` JSONB).
 */

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
};

function str(v: unknown, fallback: string): string {
  return typeof v === "string" ? v : fallback;
}

function strOrEmpty(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function bulletsFromDb(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is string => typeof x === "string")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 8);
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
  };
}
