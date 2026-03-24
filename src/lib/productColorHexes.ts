import { hexForColorLabel } from "./colorSwatch";

/** Normaliza para #rrggbb (válido em <input type="color"> e CSS). */
export function normalizeHex(raw: string): string {
  const t = raw.trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(t)) return `#${t.slice(1).toLowerCase()}`;
  if (/^[0-9A-Fa-f]{6}$/.test(t)) return `#${t.toLowerCase()}`;
  if (/^#[0-9A-Fa-f]{3}$/.test(t)) {
    const r = t[1]!;
    const g = t[2]!;
    const b = t[3]!;
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return "#6b7280";
}

export function colorHexesFromDb(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof k !== "string" || typeof v !== "string") continue;
    const name = k.trim();
    if (!name) continue;
    out[name] = normalizeHex(v);
  }
  return out;
}

/** Objeto para gravar no Supabase (só entradas com nome). */
export function colorHexesForPayload(
  names: string[],
  hexByName: Record<string, string>
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of names) {
    const h = hexByName[name];
    if (h) out[name] = normalizeHex(h);
  }
  return out;
}

/** Bolinha na loja: hex salvo pelo vendedor ou fallback pelo nome. */
export function resolveSwatchFill(
  colorName: string,
  hexByName: Record<string, string>
): string {
  const custom = hexByName[colorName];
  if (custom) return normalizeHex(custom);
  return hexForColorLabel(colorName);
}
