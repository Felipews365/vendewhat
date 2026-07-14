import type { StorefrontSettings } from "@/lib/storefront";

/**
 * Temas prontos da loja ("Aparência da loja").
 *
 * Este projeto NÃO usa shadcn/ui — a vitrine é pintada por CSS vars próprias
 * (`--store-primary`/`--store-secondary`) + `pageBackground`/`headerBackground`/
 * `announcementBarBg`, todos guardados no JSONB `storefront`. Cada tema aqui é só
 * um **preset** que preenche esses mesmos tokens de uma vez, então a loja pública
 * já renderiza o tema sem nenhuma mudança nos componentes.
 *
 * As paletas foram escolhidas a dedo para serem premium e "à prova de feio":
 * accent com contraste sobre fundo claro, tom escuro rico para o hero/promoções,
 * fundo de página neutro suave e barra do topo escura (o cabeçalho é dark-aware).
 *
 * Para adicionar um tema novo: acrescente um objeto em `STORE_THEMES`. Nada mais
 * precisa mudar (a tela de aparência e a loja leem daqui).
 */

/** Tokens de cor de um tema — o subconjunto do `storefront` que define o visual. */
export type StoreThemeTokens = {
  /** Accent (botões do catálogo, preços, detalhes) → `themePrimary`. */
  themePrimary: string;
  /** Tom escuro rico (hero, botões de promoção, painéis) → `themeSecondary`. */
  themeSecondary: string;
  /** Fundo do topo/cabeçalho da loja → `headerBackground`. */
  headerBackground: string;
  /** Fundo da página inteira (atrás dos cards) → `pageBackground`. */
  pageBackground: string;
  /** Barra de avisos no topo → `announcementBarBg`. */
  announcementBarBg: string;
};

export type StoreTheme = {
  /** ID estável salvo em `storefront.themeId`. Não renomear depois de publicado. */
  id: string;
  /** Nome amigável mostrado ao lojista. */
  name: string;
  /** Uma linha de "vibe" para o card. */
  description: string;
  tokens: StoreThemeTokens;
};

export const STORE_THEMES: StoreTheme[] = [
  {
    id: "boutique-rose",
    name: "Boutique Rosé",
    description: "Rosé suave com vinho — moda feminina, delicado e elegante.",
    tokens: {
      themePrimary: "#C9A8AC",
      themeSecondary: "#5C2E36",
      headerBackground: "#2A1A1E",
      pageBackground: "#FAF8F8",
      announcementBarBg: "#1C1013",
    },
  },
  {
    id: "noir-dourado",
    name: "Noir Dourado",
    description: "Preto e dourado — luxo, joias e presentes premium.",
    tokens: {
      themePrimary: "#C9A227",
      themeSecondary: "#1A1A1A",
      headerBackground: "#0D0D0D",
      pageBackground: "#F6F5F2",
      announcementBarBg: "#000000",
    },
  },
  {
    id: "esmeralda",
    name: "Esmeralda",
    description: "Verde esmeralda — natural, saudável e sofisticado.",
    tokens: {
      themePrimary: "#10906A",
      themeSecondary: "#0B3D2E",
      headerBackground: "#0C2E24",
      pageBackground: "#F3F8F5",
      announcementBarBg: "#07211A",
    },
  },
  {
    id: "marinho-premium",
    name: "Marinho Premium",
    description: "Azul marinho com toque royal — confiança e sofisticação.",
    tokens: {
      themePrimary: "#2563EB",
      themeSecondary: "#13294B",
      headerBackground: "#0F1E3A",
      pageBackground: "#F4F6FB",
      announcementBarBg: "#0A162B",
    },
  },
  {
    id: "petroleo-coral",
    name: "Petróleo & Coral",
    description: "Petróleo profundo com coral vibrante — moderno e cheio de vida.",
    tokens: {
      themePrimary: "#E8663D",
      themeSecondary: "#0F3B3A",
      headerBackground: "#0E2A29",
      pageBackground: "#F5F7F6",
      announcementBarBg: "#08201F",
    },
  },
  {
    id: "terracota",
    name: "Terracota",
    description: "Terracota e creme — aconchegante, artesanal e caloroso.",
    tokens: {
      themePrimary: "#C05A38",
      themeSecondary: "#5A2E22",
      headerBackground: "#33201A",
      pageBackground: "#FBF6F1",
      announcementBarBg: "#241512",
    },
  },
  {
    id: "ametista",
    name: "Ametista",
    description: "Roxo ametista — criativo, beleza e cosméticos.",
    tokens: {
      themePrimary: "#8B5CF6",
      themeSecondary: "#3B2064",
      headerBackground: "#241340",
      pageBackground: "#F7F5FB",
      announcementBarBg: "#180C2C",
    },
  },
  {
    id: "bordo",
    name: "Bordô",
    description: "Vinho bordô profundo — refinado, marcante e atemporal.",
    tokens: {
      themePrimary: "#9F1D3A",
      themeSecondary: "#4A0E1E",
      headerBackground: "#2E0B14",
      pageBackground: "#FBF5F6",
      announcementBarBg: "#200810",
    },
  },
  {
    id: "turquesa-oceano",
    name: "Turquesa Oceano",
    description: "Turquesa e marinho — leve, fresco e convidativo.",
    tokens: {
      themePrimary: "#0E9AA7",
      themeSecondary: "#12303A",
      headerBackground: "#0C242C",
      pageBackground: "#F2F8F9",
      announcementBarBg: "#071A20",
    },
  },
  {
    id: "grafite-minimal",
    name: "Grafite Minimalista",
    description: "Tons de grafite — clean, neutro e direto ao ponto.",
    tokens: {
      themePrimary: "#111827",
      themeSecondary: "#374151",
      headerBackground: "#18181B",
      pageBackground: "#F4F4F5",
      announcementBarBg: "#0A0A0A",
    },
  },
  {
    id: "areia-oliva",
    name: "Areia & Oliva",
    description: "Verde oliva e areia — natural, orgânico e terroso.",
    tokens: {
      themePrimary: "#7A7A2E",
      themeSecondary: "#3E4A22",
      headerBackground: "#2A3018",
      pageBackground: "#F7F6EF",
      announcementBarBg: "#1C210F",
    },
  },
  {
    id: "rosa-millennial",
    name: "Rosa Millennial",
    description: "Rosa moderno e vibrante — jovem, descolado e cheio de charme.",
    tokens: {
      themePrimary: "#DB5C8E",
      themeSecondary: "#6D1F45",
      headerBackground: "#3A1226",
      pageBackground: "#FDF5F8",
      announcementBarBg: "#2A0C1B",
    },
  },
  {
    id: "cobre-carvao",
    name: "Cobre & Carvão",
    description: "Cobre quente sobre carvão — industrial, forte e masculino.",
    tokens: {
      themePrimary: "#B96A34",
      themeSecondary: "#2B2B2B",
      headerBackground: "#1E1E1E",
      pageBackground: "#F5F3F0",
      announcementBarBg: "#0F0F0F",
    },
  },
  {
    id: "menta-fresca",
    name: "Menta Fresca",
    description: "Verde menta e petróleo — leve, limpo e refrescante.",
    tokens: {
      themePrimary: "#1FA88F",
      themeSecondary: "#114B44",
      headerBackground: "#0E3A35",
      pageBackground: "#F1F9F7",
      announcementBarBg: "#08221F",
    },
  },
  {
    id: "lavanda-suave",
    name: "Lavanda Suave",
    description: "Lavanda e ameixa — delicado, calmo e aconchegante.",
    tokens: {
      themePrimary: "#8A66C9",
      themeSecondary: "#40275E",
      headerBackground: "#2C1A44",
      pageBackground: "#F8F6FC",
      announcementBarBg: "#1E0F32",
    },
  },
  {
    id: "sol-citrico",
    name: "Sol Cítrico",
    description: "Âmbar dourado com marinho — vibrante, quente e energético.",
    tokens: {
      themePrimary: "#BC8A10",
      themeSecondary: "#1F2A44",
      headerBackground: "#14203A",
      pageBackground: "#FBF9F2",
      announcementBarBg: "#0C1526",
    },
  },
  {
    id: "indigo-noturno",
    name: "Índigo Noturno",
    description: "Índigo profundo — tecnológico, moderno e marcante.",
    tokens: {
      themePrimary: "#5457E0",
      themeSecondary: "#1E1B4B",
      headerBackground: "#141235",
      pageBackground: "#F5F5FB",
      announcementBarBg: "#0B0A24",
    },
  },
  {
    id: "floresta-ouro",
    name: "Floresta & Ouro",
    description: "Verde floresta com dourado — sofisticado, nobre e natural.",
    tokens: {
      themePrimary: "#B98A2A",
      themeSecondary: "#143A24",
      headerBackground: "#0E2A1A",
      pageBackground: "#F4F8F3",
      announcementBarBg: "#08210F",
    },
  },
  {
    id: "grafite-coral",
    name: "Grafite & Coral",
    description: "Cinza chumbo com coral vivo — minimalista com um toque de cor.",
    tokens: {
      themePrimary: "#F0604F",
      themeSecondary: "#2F3542",
      headerBackground: "#1F242E",
      pageBackground: "#F5F6F8",
      announcementBarBg: "#12151B",
    },
  },
  {
    id: "aco-azulado",
    name: "Aço Azulado",
    description: "Azul aço sereno — profissional, discreto e confiável.",
    tokens: {
      themePrimary: "#47708F",
      themeSecondary: "#2A3A49",
      headerBackground: "#1E2A36",
      pageBackground: "#F3F5F7",
      announcementBarBg: "#131C24",
    },
  },
];

/** Busca um tema pelo id (ou `undefined` se não existir). */
export function getStoreTheme(id: string): StoreTheme | undefined {
  return STORE_THEMES.find((t) => t.id === id);
}

/**
 * Devolve um novo `storefront` com as cores do tema aplicadas e o `themeId`
 * marcado. Só mexe nos tokens de cor — todo o resto (banner, textos, categorias,
 * pagamentos…) é preservado.
 */
export function applyStoreTheme(
  sf: StorefrontSettings,
  themeId: string
): StorefrontSettings {
  const theme = getStoreTheme(themeId);
  if (!theme) return sf;
  return { ...sf, ...theme.tokens, themeId: theme.id };
}

/** Normaliza uma cor para comparar (minúsculas, sem espaços). */
function norm(c: string): string {
  return c.trim().toLowerCase();
}

/**
 * Descobre qual tema está ativo. Prioriza o `themeId` salvo; se estiver vazio
 * (lojas antigas / cores mexidas na mão), tenta casar as cores atuais com algum
 * preset. Retorna o id ou `""` (personalizado).
 */
export function detectActiveTheme(sf: StorefrontSettings): string {
  if (sf.themeId && getStoreTheme(sf.themeId)) return sf.themeId;
  const match = STORE_THEMES.find(
    (t) =>
      norm(t.tokens.themePrimary) === norm(sf.themePrimary) &&
      norm(t.tokens.themeSecondary) === norm(sf.themeSecondary) &&
      norm(t.tokens.headerBackground) === norm(sf.headerBackground) &&
      norm(t.tokens.pageBackground) === norm(sf.pageBackground)
  );
  return match?.id ?? "";
}

/**
 * Luminância relativa aproximada (0–1) de um hex `#rgb`/`#rrggbb`. Usada só nas
 * prévias para escolher texto claro/escuro legível sobre cada cor.
 */
export function isDarkColor(hex: string): boolean {
  const h = hex.trim().replace("#", "");
  const full =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h;
  if (full.length < 6) return true;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum < 0.6;
}

/** Cor de texto legível (branco/preto) para um fundo. */
export function readableText(bg: string): string {
  return isDarkColor(bg) ? "#ffffff" : "#111827";
}
