/**
 * Campos extras do produto: tags de busca, tipo de unidade, código de barras
 * (EAN) e dimensões/peso da embalagem. Colunas em `products` (migration
 * [supabase-migration-product-details.sql]); tudo opcional, com fallback de
 * coluna ausente no save do formulário.
 */

export type UnitType = {
  /** Guardado em `products.unit_type`. */
  id: string;
  /** Texto no seletor do formulário. */
  label: string;
  /** Abreviação exibida na loja (ex.: "vendido por Kg"). */
  short: string;
};

/** Como o produto é vendido. `unidade` é o padrão (não precisa exibir na loja). */
export const UNIT_TYPES: UnitType[] = [
  { id: "unidade", label: "Unidade", short: "un" },
  { id: "kg", label: "Quilograma (Kg)", short: "Kg" },
  { id: "g", label: "Grama (g)", short: "g" },
  { id: "l", label: "Litro (L)", short: "L" },
  { id: "ml", label: "Mililitro (mL)", short: "mL" },
  { id: "m", label: "Metro (m)", short: "m" },
  { id: "par", label: "Par", short: "par" },
  { id: "caixa", label: "Caixa", short: "cx" },
  { id: "pacote", label: "Pacote", short: "pct" },
];

export const DEFAULT_UNIT_TYPE = "unidade";

/** Normaliza o id do tipo de unidade vindo do banco (default `unidade`). */
export function unitTypeFromDb(v: unknown): string {
  if (typeof v !== "string") return DEFAULT_UNIT_TYPE;
  const id = v.trim().toLowerCase();
  return UNIT_TYPES.some((u) => u.id === id) ? id : DEFAULT_UNIT_TYPE;
}

/** Abreviação do tipo de unidade (ex.: "Kg"); vazio para `unidade` (padrão). */
export function unitTypeShort(id: string | null | undefined): string {
  const found = UNIT_TYPES.find((u) => u.id === (id ?? "").trim().toLowerCase());
  if (!found || found.id === DEFAULT_UNIT_TYPE) return "";
  return found.short;
}

/** Máximo de tags por produto (defensivo). */
export const MAX_PRODUCT_TAGS = 20;

/** Lista de tags: aparadas, sem vazias, sem duplicadas (case-insensitive), com cap. */
export function sanitizeTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const t = item.trim().slice(0, 40);
    if (!t) continue;
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
    if (out.length >= MAX_PRODUCT_TAGS) break;
  }
  return out;
}

/** Código de barras: só dígitos e espaços/traços comuns; cap defensivo. */
export function sanitizeBarcode(v: unknown): string {
  if (typeof v !== "string") return "";
  return v.replace(/[^0-9A-Za-z\- ]/g, "").trim().slice(0, 40);
}

export type PackageDimensions = {
  /** cm */
  height: number | null;
  width: number | null;
  length: number | null;
  /** kg */
  weight: number | null;
};

/** Número >= 0 vindo de string/num; vazio/inválido → null. */
export function dimensionFromInput(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

/** Para o input controlado: número → string ("" quando null). */
export function dimensionToInput(v: number | null | undefined): string {
  return v == null ? "" : String(v);
}
