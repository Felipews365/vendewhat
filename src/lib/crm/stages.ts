/**
 * Etapas do funil de vendas — catálogo FIXO na v1.
 *
 * Deixar o lojista montar as próprias etapas soa generoso e, na prática, trava
 * quem nunca usou um CRM (a tela abre vazia e ele não sabe o que escrever).
 * Estas seis cobrem a venda por WhatsApp de ponta a ponta. Mesmo formato do
 * TAG_PALETTE (id + classes claro/escuro), para o kanban herdar o idioma visual.
 */

export type StageId =
  | "novo"
  | "atendimento"
  | "orcamento"
  | "pagamento"
  | "ganho"
  | "perdido";

export type CrmStage = {
  id: StageId;
  label: string;
  /** Frase curta no topo da coluna, quando ela está vazia. */
  empty: string;
  /** Bolinha do cabeçalho da coluna. */
  dot: string;
  /** Faixa de cor no topo da coluna. */
  bar: string;
  /** Chip da etapa (usado na ficha e na lista). */
  chip: string;
  /** Borda lateral do card no kanban — é o que dá a cara colorida ao quadro. */
  edge: string;
  /** Fundo suave da coluna, para separar as etapas de relance. */
  tint: string;
};

export const CRM_STAGES: CrmStage[] = [
  {
    id: "novo",
    label: "Novo contato",
    empty: "Quem acabou de chegar aparece aqui.",
    dot: "bg-sky-500",
    bar: "bg-sky-500",
    chip: "bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300",
    edge: "border-l-sky-500",
    tint: "bg-sky-50/60 dark:bg-sky-950/20",
  },
  {
    id: "atendimento",
    label: "Em atendimento",
    empty: "Arraste para cá quem você já está atendendo.",
    dot: "bg-violet-500",
    bar: "bg-violet-500",
    chip: "bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300",
    edge: "border-l-violet-500",
    tint: "bg-violet-50/60 dark:bg-violet-950/20",
  },
  {
    id: "orcamento",
    label: "Orçamento enviado",
    empty: "Quem já recebeu preço e está decidindo.",
    dot: "bg-amber-500",
    bar: "bg-amber-500",
    chip: "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300",
    edge: "border-l-amber-500",
    tint: "bg-amber-50/60 dark:bg-amber-950/20",
  },
  {
    id: "pagamento",
    label: "Aguardando pagamento",
    empty: "Fechou o pedido e falta pagar.",
    dot: "bg-orange-500",
    bar: "bg-orange-500",
    chip: "bg-orange-100 text-orange-700 dark:bg-orange-950/50 dark:text-orange-300",
    edge: "border-l-orange-500",
    tint: "bg-orange-50/60 dark:bg-orange-950/20",
  },
  {
    id: "ganho",
    label: "Comprou",
    empty: "Cliente entra aqui sozinho quando o pedido é registrado.",
    dot: "bg-emerald-500",
    bar: "bg-emerald-500",
    chip: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
    edge: "border-l-emerald-500",
    tint: "bg-emerald-50/60 dark:bg-emerald-950/20",
  },
  {
    id: "perdido",
    label: "Perdeu o interesse",
    empty: "Quem desistiu — vale tentar de novo mais pra frente.",
    dot: "bg-slate-400",
    bar: "bg-slate-400",
    chip: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
    edge: "border-l-slate-400",
    tint: "bg-slate-100/60 dark:bg-slate-900/40",
  },
];

export const STAGE_BY_ID: Record<string, CrmStage> = Object.fromEntries(
  CRM_STAGES.map((s) => [s.id, s])
);

export const DEFAULT_STAGE: StageId = "novo";

export function isStageId(v: unknown): v is StageId {
  return typeof v === "string" && v in STAGE_BY_ID;
}

export function stageById(id: string): CrmStage {
  return STAGE_BY_ID[id] ?? STAGE_BY_ID[DEFAULT_STAGE];
}
