/**
 * Etiquetas de cliente — fonte única, compartilhada pelo painel de conversas
 * (ConversationsPanel) e pelo CRM.
 *
 * Saiu de dentro do ConversationsPanel.tsx sem NENHUMA alteração de valor: as
 * strings de classe, o separador e o hash são os mesmos, então etiquetas já
 * gravadas continuam renderizando exatamente igual.
 *
 * A cor é guardada dentro da própria string ("Nome¦corId") — sem migration,
 * pois a coluna `whatsapp_conversation_tags.tags` já é uma lista de strings.
 * Etiquetas antigas (sem separador) caem numa cor determinística pelo nome.
 */

export type TagColor = { id: string; dot: string; chip: string; swatch: string };

export const TAG_PALETTE: TagColor[] = [
  { id: "red", dot: "bg-rose-500", chip: "bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300", swatch: "bg-rose-500" },
  { id: "orange", dot: "bg-amber-500", chip: "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300", swatch: "bg-amber-500" },
  { id: "green", dot: "bg-emerald-500", chip: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300", swatch: "bg-emerald-500" },
  { id: "teal", dot: "bg-teal-500", chip: "bg-teal-100 text-teal-700 dark:bg-teal-950/50 dark:text-teal-300", swatch: "bg-teal-500" },
  { id: "blue", dot: "bg-sky-500", chip: "bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300", swatch: "bg-sky-500" },
  { id: "violet", dot: "bg-violet-500", chip: "bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300", swatch: "bg-violet-500" },
  { id: "pink", dot: "bg-fuchsia-500", chip: "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-950/50 dark:text-fuchsia-300", swatch: "bg-fuchsia-500" },
  { id: "gray", dot: "bg-slate-400", chip: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300", swatch: "bg-slate-400" },
];

export const PALETTE_BY_ID: Record<string, TagColor> = Object.fromEntries(
  TAG_PALETTE.map((c) => [c.id, c])
);

/** Etiquetas prontas (nome + cor), no estilo da referência. */
export const TAG_PRESETS: { name: string; color: string }[] = [
  { name: "Urgente", color: "red" },
  { name: "Cliente novo", color: "green" },
  { name: "Interessado", color: "blue" },
  { name: "Aguardando pagamento", color: "orange" },
  { name: "Pago", color: "teal" },
  { name: "Sem resposta", color: "gray" },
];

/** Separador nome¦cor (não digitável no teclado comum). */
export const TAG_SEP = "¦";

export function hashColorId(t: string): string {
  let h = 0;
  for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) >>> 0;
  return TAG_PALETTE[h % TAG_PALETTE.length].id;
}

/** Separa a string guardada em { nome, cor }. */
export function splitTag(raw: string): { name: string; color: TagColor } {
  const i = raw.lastIndexOf(TAG_SEP);
  if (i === -1) return { name: raw, color: PALETTE_BY_ID[hashColorId(raw)] };
  const name = raw.slice(0, i);
  const colorId = raw.slice(i + 1);
  return { name, color: PALETTE_BY_ID[colorId] ?? PALETTE_BY_ID[hashColorId(name)] };
}

/** Monta a string guardada a partir do nome + cor. */
export function joinTag(name: string, colorId: string): string {
  return `${name}${TAG_SEP}${colorId}`;
}

/** Minúsculas e sem acento, para a busca casar "João" com "joao". */
export function normalizeSearch(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/** Iniciais para o avatar: do nome, ou os 2 últimos dígitos do telefone. */
export function avatarText(name: string, phone: string): string {
  const n = name.trim();
  if (n) {
    const parts = n.split(/\s+/).filter(Boolean);
    const s = (parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "");
    if (s) return s.toUpperCase();
  }
  return phone.replace(/\D/g, "").slice(-2) || "?";
}
