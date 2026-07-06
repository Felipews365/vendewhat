/**
 * Blocos reutilizáveis do construtor de loja (VendeWhat).
 *
 * Cada bloco é uma "peça" que o lojista adiciona/edita pelos botões "+".
 * O objetivo deste arquivo é ser a **fonte da verdade** do que é editável:
 * o formulário do painel e a validação leem daqui (ver `BLOCK_LIMITS` e o
 * registro em `registry.tsx`), então adicionar um campo é feito num lugar só.
 *
 * Regras de projeto:
 * - Usuário NÃO técnico: poucos campos, nomes claros, tudo opcional tem fallback.
 * - Mobile-first: os componentes empilham no celular.
 * - Cores vêm dos tokens da loja (`--store-primary` / `--store-secondary`),
 *   então os blocos combinam entre si sem o lojista mexer em cor.
 */

/** Tipos de bloco disponíveis no builder. */
export type StoreBlockType =
  | "promoBanner"
  | "welcomeStrip"
  | "categoryShowcase"
  | "productGrid"
  | "whatsappCta"
  | "couponOffer"
  | "imageTextFeature";

/** Lista dos tipos válidos (para sanitizar o que vem do banco). */
export const STORE_BLOCK_TYPES: StoreBlockType[] = [
  "promoBanner",
  "welcomeStrip",
  "categoryShowcase",
  "productGrid",
  "whatsappCta",
  "couponOffer",
  "imageTextFeature",
];

/** Produto no formato mínimo que a grade precisa (injetado pela página, não pelo JSON). */
export type BlockProduct = {
  id: string;
  name: string;
  price: number;
  image: string | null;
  /** Preço "de" riscado (opcional). */
  compareAtPrice?: number | null;
  /** Selo curto no canto (ex.: "Promoção", "Novo"). */
  badge?: string | null;
};

/* ------------------------------------------------------------------ *
 * Config de cada bloco (o JSON que fica salvo por loja).
 * Todos os campos de texto são opcionais no runtime — os componentes
 * têm fallback. Os limites recomendados estão em BLOCK_LIMITS abaixo.
 * ------------------------------------------------------------------ */

export type PromoBannerConfig = {
  /** Linha pequena acima do título (ex.: "BÁSICOS ESSENCIAIS"). */
  eyebrow?: string;
  /** Título grande da promoção. */
  title?: string;
  /** Frase de apoio abaixo do título. */
  subtitle?: string;
  /** Texto do botão. */
  ctaLabel?: string;
  /** Destino do botão (âncora #catalogo ou URL). */
  ctaHref?: string;
  /** Cupom mostrado como "Use o código …" (opcional). */
  couponCode?: string;
  /** Foto do banner (opcional; sem foto usa fundo com a cor da loja). */
  imageUrl?: string;
  /** Layout: foto de fundo (texto por cima) ou foto ao lado (dividido). */
  layout?: "overlay" | "split";
  /** No layout dividido, de que lado fica a foto. */
  photoSide?: "left" | "right";
};

export type WelcomeStripConfig = {
  /** Saudação principal. */
  title?: string;
  /** Mensagem curta de acolhimento. */
  message?: string;
  /** Emoji opcional à esquerda (só 1). */
  emoji?: string;
};

export type CategoryShowcaseItem = {
  label: string;
  imageUrl?: string;
  /** Âncora/URL ao clicar (opcional). */
  href?: string;
};

export type CategoryShowcaseConfig = {
  title?: string;
  items?: CategoryShowcaseItem[];
};

export type ProductGridConfig = {
  title?: string;
  /** Quantos produtos no máximo mostrar. */
  maxItems?: number;
  /** Colunas no desktop (o mobile é sempre 2). */
  columns?: 2 | 3 | 4;
};

export type WhatsAppCtaConfig = {
  title?: string;
  message?: string;
  buttonLabel?: string;
  /** Telefone só com números, com DDI (ex.: 5511999999999). */
  phone?: string;
  /** Texto que já vai preenchido na conversa (opcional). */
  prefill?: string;
};

export type CouponOfferConfig = {
  title?: string;
  description?: string;
  /** Código que o cliente copia (ex.: BEMVINDO10). */
  code?: string;
};

export type ImageTextFeatureConfig = {
  eyebrow?: string;
  title?: string;
  body?: string;
  imageUrl?: string;
  ctaLabel?: string;
  ctaHref?: string;
  /** De que lado fica a imagem no desktop. */
  imageSide?: "left" | "right";
};

/** União discriminada de todos os blocos configuráveis. */
export type StoreBlock =
  | { id: string; type: "promoBanner"; config: PromoBannerConfig }
  | { id: string; type: "welcomeStrip"; config: WelcomeStripConfig }
  | { id: string; type: "categoryShowcase"; config: CategoryShowcaseConfig }
  | { id: string; type: "productGrid"; config: ProductGridConfig }
  | { id: string; type: "whatsappCta"; config: WhatsAppCtaConfig }
  | { id: string; type: "couponOffer"; config: CouponOfferConfig }
  | { id: string; type: "imageTextFeature"; config: ImageTextFeatureConfig };

/* ------------------------------------------------------------------ *
 * Limites recomendados por campo (usados no form e na validação).
 * "Recomendado" = o layout continua bonito; passar disso o componente
 * corta com reticências (line-clamp), mas avisamos o lojista antes.
 * ------------------------------------------------------------------ */

export type FieldLimit = { max: number; hint: string };

export const BLOCK_LIMITS = {
  promoBanner: {
    eyebrow: { max: 30, hint: "Linha curta, tipo etiqueta" },
    title: { max: 40, hint: "Chamada principal" },
    subtitle: { max: 90, hint: "Uma frase de apoio" },
    ctaLabel: { max: 22, hint: "Texto do botão" },
    couponCode: { max: 16, hint: "Só o código, sem espaços" },
  },
  welcomeStrip: {
    title: { max: 40, hint: "Saudação" },
    message: { max: 120, hint: "Uma ou duas frases" },
  },
  categoryShowcase: {
    title: { max: 30, hint: "Ex.: Categorias" },
    itemLabel: { max: 20, hint: "Nome curto da categoria" },
    maxItems: { max: 8, hint: "Até 8 categorias" },
  },
  productGrid: {
    title: { max: 30, hint: "Ex.: Mais vendidos" },
    maxItems: { max: 12, hint: "Até 12 produtos" },
  },
  whatsappCta: {
    title: { max: 40, hint: "Chamada" },
    message: { max: 120, hint: "Convite curto" },
    buttonLabel: { max: 24, hint: "Texto do botão" },
  },
  couponOffer: {
    title: { max: 40, hint: "Ex.: Ganhe 10%" },
    description: { max: 100, hint: "Como usar o cupom" },
    code: { max: 16, hint: "Só o código" },
  },
  imageTextFeature: {
    eyebrow: { max: 24, hint: "Etiqueta curta" },
    title: { max: 48, hint: "Destaque" },
    body: { max: 220, hint: "Parágrafo curto" },
    ctaLabel: { max: 22, hint: "Texto do botão" },
  },
} as const;

/** Corta texto no limite recomendado (defensivo — o CSS também faz clamp). */
export function limitText(value: string | undefined, max: number): string {
  const s = (value ?? "").trim();
  if (s.length <= max) return s;
  return s.slice(0, max).trimEnd();
}
