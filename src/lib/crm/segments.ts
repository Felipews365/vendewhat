/**
 * Segmentos do CRM — catálogo FECHADO, de propósito.
 *
 * Um construtor de filtros (AND/OR aninhado, operadores) seria poderoso e
 * inútil para o público: quem vende pelo WhatsApp quer "meus melhores clientes"
 * e "quem sumiu", não montar uma consulta. Cada segmento aqui vira um filtro
 * sobre colunas INDEXADAS de `crm_customers`, então listar é barato.
 *
 * Só rótulos e ids: este módulo é importado pela tela (cliente) e pela API. A
 * tradução para query mora em `applySegment` (src/lib/crm/customers.ts).
 */

export type SegmentId =
  | "todos"
  | "novos_30d"
  | "nunca_compraram"
  | "compraram"
  | "recorrentes"
  | "melhores"
  | "inativos_30d"
  | "inativos_60d"
  | "inativos_90d"
  | "carrinho_abandonado";

export type CrmSegment = {
  id: SegmentId;
  label: string;
  /** Frase curta mostrada quando o segmento está ativo. */
  hint: string;
};

export const CRM_SEGMENTS: CrmSegment[] = [
  { id: "todos", label: "Todos", hint: "Todo mundo que já comprou ou conversou com você." },
  { id: "novos_30d", label: "Novos", hint: "Apareceram nos últimos 30 dias." },
  { id: "compraram", label: "Compraram", hint: "Já fecharam pelo menos um pedido." },
  { id: "recorrentes", label: "Recorrentes", hint: "Compraram duas vezes ou mais." },
  { id: "melhores", label: "Melhores", hint: "Os que mais gastaram na sua loja." },
  { id: "nunca_compraram", label: "Nunca compraram", hint: "Conversaram, mas ainda não fecharam pedido." },
  { id: "inativos_30d", label: "Sumiram (30 dias)", hint: "Sem comprar nem falar há mais de 30 dias." },
  { id: "inativos_60d", label: "Sumiram (60 dias)", hint: "Sem comprar nem falar há mais de 60 dias." },
  { id: "inativos_90d", label: "Sumiram (90 dias)", hint: "Sem comprar nem falar há mais de 90 dias." },
  { id: "carrinho_abandonado", label: "Carrinho abandonado", hint: "Montaram o carrinho e não finalizaram." },
];

const SEGMENT_IDS = new Set<string>(CRM_SEGMENTS.map((s) => s.id));

export function isSegmentId(v: unknown): v is SegmentId {
  return typeof v === "string" && SEGMENT_IDS.has(v);
}

export function segmentById(id: string): CrmSegment {
  return CRM_SEGMENTS.find((s) => s.id === id) ?? CRM_SEGMENTS[0];
}

/** Quantos dias de silêncio cada segmento "sumiram" exige (0 = não se aplica). */
export function inactiveDaysFor(id: SegmentId): number {
  if (id === "inativos_30d") return 30;
  if (id === "inativos_60d") return 60;
  if (id === "inativos_90d") return 90;
  return 0;
}

// --- Ordenação ---------------------------------------------------------------

export type SortId = "recentes" | "valor" | "pedidos" | "antigos";

export const CRM_SORTS: { id: SortId; label: string }[] = [
  { id: "recentes", label: "Mais recentes" },
  { id: "valor", label: "Maior valor" },
  { id: "pedidos", label: "Mais pedidos" },
  { id: "antigos", label: "Mais antigos" },
];

const SORT_IDS = new Set<string>(CRM_SORTS.map((s) => s.id));

export function isSortId(v: unknown): v is SortId {
  return typeof v === "string" && SORT_IDS.has(v);
}
