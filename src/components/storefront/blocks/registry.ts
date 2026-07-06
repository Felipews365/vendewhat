/**
 * Registro dos blocos: a "vitrine" que o botão "+" do builder lista.
 *
 * Cada entrada descreve o bloco para o PAINEL (não para a loja): rótulo amigável,
 * config padrão (para criar já bonito) e a lista de campos editáveis com limites.
 * O formulário do lojista e a validação leem tudo daqui — sem hardcode espalhado.
 */
import {
  BLOCK_LIMITS,
  type StoreBlockType,
  type StoreBlock,
} from "./types";

/** Como cada campo aparece no formulário do painel. */
export type BlockFieldType =
  | "text"
  | "textarea"
  | "image"
  | "url"
  | "phone"
  | "number"
  | "select";

export type BlockField = {
  /** Caminho dentro de `config`. */
  key: string;
  label: string;
  type: BlockFieldType;
  /** Limite recomendado de caracteres (texto). */
  max?: number;
  hint?: string;
  required?: boolean;
  options?: { value: string; label: string }[];
};

export type BlockMeta = {
  type: StoreBlockType;
  /** Nome mostrado no menu "+". */
  label: string;
  /** Uma linha explicando para que serve. */
  description: string;
  emoji: string;
  /** Config inicial ao adicionar (já renderiza bonito). */
  defaultConfig: Record<string, unknown>;
  fields: BlockField[];
};

const side = [
  { value: "left", label: "Esquerda" },
  { value: "right", label: "Direita" },
];

export const BLOCK_REGISTRY: Record<StoreBlockType, BlockMeta> = {
  promoBanner: {
    type: "promoBanner",
    label: "Banner promocional",
    description: "Destaque a promoção do momento no topo da loja.",
    emoji: "🛍️",
    defaultConfig: {
      title: "Coleção nova",
      subtitle: "Aproveite as novidades da semana",
      ctaLabel: "Ver produtos",
      ctaHref: "#catalogo",
      layout: "overlay",
      photoSide: "right",
    },
    fields: [
      { key: "imageUrl", label: "Foto do banner", type: "image", hint: "Foto larga (1920×600)" },
      {
        key: "layout",
        label: "Formato",
        type: "select",
        options: [
          { value: "overlay", label: "Foto de fundo (texto por cima)" },
          { value: "split", label: "Foto ao lado (dividido)" },
        ],
      },
      { key: "photoSide", label: "Lado da foto (dividido)", type: "select", options: side },
      { key: "eyebrow", label: "Etiqueta", type: "text", ...BLOCK_LIMITS.promoBanner.eyebrow },
      { key: "title", label: "Título", type: "text", required: true, ...BLOCK_LIMITS.promoBanner.title },
      { key: "subtitle", label: "Frase", type: "text", ...BLOCK_LIMITS.promoBanner.subtitle },
      { key: "couponCode", label: "Cupom (opcional)", type: "text", ...BLOCK_LIMITS.promoBanner.couponCode },
      { key: "ctaLabel", label: "Texto do botão", type: "text", ...BLOCK_LIMITS.promoBanner.ctaLabel },
      { key: "ctaHref", label: "Link do botão", type: "url" },
    ],
  },
  welcomeStrip: {
    type: "welcomeStrip",
    label: "Faixa de boas-vindas",
    description: "Uma saudação curta para acolher quem chega.",
    emoji: "👋",
    defaultConfig: { title: "Bem-vindo à nossa loja!", message: "Escolha seus produtos e finalize pelo WhatsApp." },
    fields: [
      { key: "emoji", label: "Emoji", type: "text", max: 2 },
      { key: "title", label: "Saudação", type: "text", required: true, ...BLOCK_LIMITS.welcomeStrip.title },
      { key: "message", label: "Mensagem", type: "textarea", ...BLOCK_LIMITS.welcomeStrip.message },
    ],
  },
  categoryShowcase: {
    type: "categoryShowcase",
    label: "Vitrine de categorias",
    description: "Atalhos redondos para as categorias da loja.",
    emoji: "🏷️",
    defaultConfig: { title: "Categorias", items: [] },
    fields: [
      { key: "title", label: "Título", type: "text", ...BLOCK_LIMITS.categoryShowcase.title },
      // A lista de itens tem editor próprio (adicionar/remover/ordenar).
    ],
  },
  productGrid: {
    type: "productGrid",
    label: "Grade de produtos",
    description: "Mostre uma seleção de produtos em cartões.",
    emoji: "📦",
    defaultConfig: { title: "Nossos produtos", columns: 2, maxItems: 8 },
    fields: [
      { key: "title", label: "Título", type: "text", ...BLOCK_LIMITS.productGrid.title },
      {
        key: "columns",
        label: "Colunas (desktop)",
        type: "select",
        options: [
          { value: "2", label: "2 colunas" },
          { value: "3", label: "3 colunas" },
          { value: "4", label: "4 colunas" },
        ],
      },
      { key: "maxItems", label: "Máximo de produtos", type: "number", ...BLOCK_LIMITS.productGrid.maxItems },
    ],
  },
  whatsappCta: {
    type: "whatsappCta",
    label: "Chamada no WhatsApp",
    description: "Botão grande que abre a conversa da loja.",
    emoji: "💬",
    defaultConfig: {
      title: "Fale com a gente",
      message: "Tire dúvidas e faça seu pedido pelo WhatsApp.",
      buttonLabel: "Chamar no WhatsApp",
    },
    fields: [
      { key: "phone", label: "WhatsApp (com DDI)", type: "phone", required: true, hint: "Ex.: 5511999999999" },
      { key: "title", label: "Título", type: "text", ...BLOCK_LIMITS.whatsappCta.title },
      { key: "message", label: "Mensagem", type: "textarea", ...BLOCK_LIMITS.whatsappCta.message },
      { key: "buttonLabel", label: "Texto do botão", type: "text", ...BLOCK_LIMITS.whatsappCta.buttonLabel },
      { key: "prefill", label: "Mensagem já preenchida", type: "textarea" },
    ],
  },
  couponOffer: {
    type: "couponOffer",
    label: "Cupom / Oferta",
    description: "Destaque um código de desconto.",
    emoji: "🎟️",
    defaultConfig: { title: "Ganhe 10% na primeira compra", description: "Use o cupom no seu pedido.", code: "BEMVINDO10" },
    fields: [
      { key: "code", label: "Código do cupom", type: "text", required: true, ...BLOCK_LIMITS.couponOffer.code },
      { key: "title", label: "Título", type: "text", ...BLOCK_LIMITS.couponOffer.title },
      { key: "description", label: "Descrição", type: "textarea", ...BLOCK_LIMITS.couponOffer.description },
    ],
  },
  imageTextFeature: {
    type: "imageTextFeature",
    label: "Destaque com imagem",
    description: "Imagem grande de um lado e texto do outro.",
    emoji: "✨",
    defaultConfig: { title: "Conheça a nova coleção", body: "Peças selecionadas para você.", imageSide: "right" },
    fields: [
      { key: "imageUrl", label: "Imagem", type: "image" },
      { key: "imageSide", label: "Lado da imagem", type: "select", options: side },
      { key: "eyebrow", label: "Etiqueta", type: "text", ...BLOCK_LIMITS.imageTextFeature.eyebrow },
      { key: "title", label: "Título", type: "text", required: true, ...BLOCK_LIMITS.imageTextFeature.title },
      { key: "body", label: "Texto", type: "textarea", ...BLOCK_LIMITS.imageTextFeature.body },
      { key: "ctaLabel", label: "Texto do botão", type: "text", ...BLOCK_LIMITS.imageTextFeature.ctaLabel },
      { key: "ctaHref", label: "Link do botão", type: "url" },
    ],
  },
};

/** Ordem em que os blocos aparecem no menu "+". */
export const BLOCK_MENU_ORDER: StoreBlockType[] = [
  "promoBanner",
  "welcomeStrip",
  "categoryShowcase",
  "productGrid",
  "imageTextFeature",
  "couponOffer",
  "whatsappCta",
];

/** Cria um bloco novo já com config padrão e um id. */
export function createBlock(type: StoreBlockType): StoreBlock {
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `blk_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  return {
    id,
    type,
    config: { ...BLOCK_REGISTRY[type].defaultConfig },
  } as StoreBlock;
}
