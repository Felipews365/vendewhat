/**
 * Modelos prontos de banner ("presets") para o lojista leigo montar um banner
 * bonito com 1 clique — SEM inventar cores/estilo na mão.
 *
 * Cada preset é só uma "receita" que preenche os campos que a loja já
 * renderiza (`HeroSlide`): um `HeroTemplate` existente + paleta curada +
 * altura/lado + textos de exemplo. NÃO cria layout novo (reaproveita o
 * componente compartilhado `HeroTemplateSlide`), então é de baixo risco e a
 * miniatura do painel bate 1:1 com a loja pública.
 *
 * O preset **só preenche campos de texto vazios** (ver `applyPreset` no editor)
 * para que trocar de modelo não apague o que o lojista já digitou/enviou.
 */
import type { HeroSlide, HeroSplitPhotoSide, HeroTemplate } from "@/lib/storefront";

/** Textos de exemplo que um preset pode sugerir (só entram nos campos vazios). */
export type HeroPresetSample = {
  badge?: string;
  title?: string;
  highlight?: string;
  subtitle?: string;
  ctaLabel?: string;
};

export type HeroPreset = {
  id: string;
  /** Nome amigável do modelo (aparece no card). */
  label: string;
  /** Emoji ilustrativo do card. */
  emoji: string;
  /** Estilo de render reaproveitado. */
  template: HeroTemplate;
  /** Quantas fotos o modelo aproveita (1-3). Guia a legenda do card. */
  photoCount: 1 | 2 | 3;
  /** Cores do gradiente do painel (estilos gráficos). */
  bgFrom?: string;
  bgVia?: string;
  bgTo?: string;
  /** Cor do botão/destaque; vazio = cor primária da loja. */
  ctaBgColor?: string;
  /** Altura sugerida (px) para os estilos gráficos. */
  height?: number;
  /** Lado da foto (estilos com foto de um lado). */
  photoSide?: HeroSplitPhotoSide;
  /** Textos sugeridos (entram só nos campos vazios). */
  sample: HeroPresetSample;
};

/**
 * Máximo de fotos que cada estilo aproveita bem (principal + extras).
 * Os estilos que dividem o espaço em faixas/mosaico aceitam até 3; os que têm
 * um recorte único de foto ficam com 1. Guia os slots do editor E o render.
 */
export function heroTemplateMaxPhotos(tpl: HeroTemplate | undefined): 1 | 2 | 3 {
  switch (tpl) {
    case "strips":
      return 3;
    case "gradient":
    case "diagonal":
    case "duo":
      return 2;
    default:
      // overlay, split, fashion, magazine, spring, sale → foto única
      // (overlay/split são renderizados fora do HeroTemplateSlide).
      return 1;
  }
}

/** Deixa a `url` + `images` do slide no tamanho que o modelo aproveita. */
export function clampSlidePhotos(slide: HeroSlide): HeroSlide {
  const max = heroTemplateMaxPhotos(slide.template);
  const extras = Math.max(0, max - 1);
  const images = (slide.images ?? []).slice(0, extras);
  return images.length ? { ...slide, images } : { ...slide, images: undefined };
}

/* ------------------------------------------------------------------ */
/*  Os ~15 modelos prontos                                            */
/* ------------------------------------------------------------------ */

export const HERO_PRESETS: HeroPreset[] = [
  {
    id: "lancamento-azul",
    label: "Lançamento",
    emoji: "🚀",
    template: "gradient",
    photoCount: 1,
    bgFrom: "#001C45",
    bgVia: "#0064D2",
    bgTo: "#0086FF",
    height: 380,
    photoSide: "right",
    sample: {
      badge: "Nova Coleção 2026",
      title: "Chegou o",
      highlight: "Lançamento",
      subtitle: "As novidades que você esperava, agora na loja.",
      ctaLabel: "Ver novidades",
    },
  },
  {
    id: "black-friday",
    label: "Black Friday",
    emoji: "🖤",
    template: "sale",
    photoCount: 1,
    bgFrom: "#111111",
    bgVia: "#3a0d0d",
    bgTo: "#e11d48",
    ctaBgColor: "#e11d48",
    height: 400,
    photoSide: "left",
    sample: {
      badge: "50% OFF",
      title: "Ofertas de",
      highlight: "Black Friday",
      subtitle: "Descontos imperdíveis por tempo limitado.",
      ctaLabel: "Aproveitar agora",
    },
  },
  {
    id: "colecao-verao",
    label: "Coleção Verão",
    emoji: "☀️",
    template: "spring",
    photoCount: 1,
    bgFrom: "#f97316",
    bgVia: "#fb7185",
    bgTo: "#fbbf24",
    ctaBgColor: "#f97316",
    height: 380,
    photoSide: "left",
    sample: {
      badge: "Verão 2026",
      title: "Coleção",
      highlight: "Verão",
      subtitle: "Peças leves e cores vivas para os dias de sol.",
      ctaLabel: "Explorar coleção",
    },
  },
  {
    id: "elegante-magazine",
    label: "Elegante",
    emoji: "🖋️",
    template: "magazine",
    photoCount: 1,
    bgFrom: "#1f2937",
    bgVia: "#4b5563",
    bgTo: "#9ca3af",
    ctaBgColor: "#111827",
    height: 380,
    photoSide: "right",
    sample: {
      badge: "Editorial",
      title: "Estilo & Elegância",
      highlight: "para você",
      subtitle: "Uma seleção sofisticada, pensada nos detalhes.",
      ctaLabel: "Ver seleção",
    },
  },
  {
    id: "fashion-rosa",
    label: "Fashion",
    emoji: "💃",
    template: "fashion",
    photoCount: 1,
    bgFrom: "#be185d",
    bgVia: "#e6357a",
    bgTo: "#f472b6",
    ctaBgColor: "#be185d",
    height: 400,
    photoSide: "left",
    sample: {
      badge: "TENDÊNCIA",
      title: "Moda que",
      highlight: "inspira",
      subtitle: "As peças mais desejadas da estação.",
      ctaLabel: "Quero ver",
    },
  },
  {
    id: "vitrine-dupla",
    label: "Vitrine dupla",
    emoji: "🖼️",
    template: "duo",
    photoCount: 2,
    ctaBgColor: "#0f766e",
    height: 380,
    photoSide: "right",
    sample: {
      badge: "Destaques",
      title: "Dois jeitos de",
      highlight: "combinar",
      subtitle: "Monte seu look com as peças em alta.",
      ctaLabel: "Montar look",
    },
  },
  {
    id: "mosaico-faixas",
    label: "Mosaico",
    emoji: "🎞️",
    template: "strips",
    photoCount: 3,
    ctaBgColor: "#7c3aed",
    height: 400,
    photoSide: "right",
    sample: {
      badge: "Coleção completa",
      title: "Um mundo de",
      highlight: "estilos",
      subtitle: "Explore variedade em cada categoria.",
      ctaLabel: "Ver tudo",
    },
  },
  {
    id: "foto-fundo",
    label: "Foto de fundo",
    emoji: "🌄",
    template: "overlay",
    photoCount: 1,
    sample: {
      badge: "Bem-vindo",
      title: "Sua loja, do seu jeito",
      highlight: "",
      subtitle: "Produtos selecionados com carinho para você.",
      ctaLabel: "Ver produtos",
    },
  },
  {
    id: "vitrine-gradiente",
    label: "Vitrine (2 fotos)",
    emoji: "🏞️",
    template: "gradient",
    photoCount: 2,
    bgFrom: "#0f172a",
    bgVia: "#334155",
    bgTo: "#64748b",
    ctaBgColor: "#0ea5e9",
    height: 380,
    photoSide: "right",
    sample: {
      badge: "Novidades",
      title: "Feito para você",
      highlight: "",
      subtitle: "Conheça o que preparamos para esta temporada.",
      ctaLabel: "Conferir",
    },
  },
  {
    id: "foto-ao-lado",
    label: "Foto ao lado",
    emoji: "🧱",
    template: "split",
    photoCount: 1,
    height: 360,
    photoSide: "right",
    sample: {
      badge: "Destaque da semana",
      title: "O produto que",
      highlight: "todo mundo quer",
      subtitle: "Qualidade e preço justo, direto pra você.",
      ctaLabel: "Ver detalhes",
    },
  },
  {
    id: "diagonal-clean",
    label: "Diagonal",
    emoji: "🔷",
    template: "diagonal",
    photoCount: 1,
    bgFrom: "#0f172a",
    bgVia: "#1e3a8a",
    bgTo: "#2563eb",
    ctaBgColor: "#2563eb",
    height: 380,
    photoSide: "left",
    sample: {
      badge: "Em alta",
      title: "Os queridinhos",
      highlight: "da loja",
      subtitle: "Os produtos mais vendidos, reunidos aqui.",
      ctaLabel: "Ver mais vendidos",
    },
  },
  {
    id: "gradiente-neon",
    label: "Neon",
    emoji: "⚡",
    template: "gradient",
    photoCount: 1,
    bgFrom: "#4c1d95",
    bgVia: "#7c3aed",
    bgTo: "#06b6d4",
    ctaBgColor: "#06b6d4",
    height: 380,
    photoSide: "right",
    sample: {
      badge: "Oferta relâmpago",
      title: "Corre que",
      highlight: "é agora",
      subtitle: "Preços especiais só até acabar o estoque.",
      ctaLabel: "Aproveitar",
    },
  },
  {
    id: "natural-verde",
    label: "Natural",
    emoji: "🌿",
    template: "diagonal",
    photoCount: 1,
    bgFrom: "#064e3b",
    bgVia: "#0f766e",
    bgTo: "#10b981",
    ctaBgColor: "#0f766e",
    height: 380,
    photoSide: "right",
    sample: {
      badge: "Feito com cuidado",
      title: "O melhor da",
      highlight: "natureza",
      subtitle: "Produtos selecionados, naturais e de confiança.",
      ctaLabel: "Descobrir",
    },
  },
  {
    id: "promo-vermelha",
    label: "Promoção",
    emoji: "🔥",
    template: "sale",
    photoCount: 1,
    bgFrom: "#7f1d1d",
    bgVia: "#dc2626",
    bgTo: "#f97316",
    ctaBgColor: "#dc2626",
    height: 380,
    photoSide: "left",
    sample: {
      badge: "30% OFF",
      title: "Semana de",
      highlight: "Promoções",
      subtitle: "Descontos em peças selecionadas.",
      ctaLabel: "Ver ofertas",
    },
  },
  {
    id: "premium-dourado",
    label: "Premium",
    emoji: "👑",
    template: "magazine",
    photoCount: 1,
    bgFrom: "#78350f",
    bgVia: "#b45309",
    bgTo: "#f59e0b",
    ctaBgColor: "#b45309",
    height: 380,
    photoSide: "right",
    sample: {
      badge: "Exclusivo",
      title: "Linha Premium",
      highlight: "edição limitada",
      subtitle: "Peças exclusivas para clientes especiais.",
      ctaLabel: "Ver linha premium",
    },
  },
  {
    id: "duo-minimal",
    label: "Duo minimalista",
    emoji: "◾",
    template: "duo",
    photoCount: 2,
    ctaBgColor: "#111827",
    height: 360,
    photoSide: "left",
    sample: {
      badge: "Seleção",
      title: "Menos é",
      highlight: "mais",
      subtitle: "O essencial, com muito estilo.",
      ctaLabel: "Ver seleção",
    },
  },
];
