/** Lista vinda do JSONB do Supabase */
export function optionArrayFromDb(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const x of raw) {
    if (typeof x !== "string") continue;
    const t = x.trim();
    if (!t) continue;
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out;
}

/** Textarea do painel: uma opção por linha ou separadas por vírgula / ; / | */
export function parseOptionList(raw: string): string[] {
  if (!raw || !raw.trim()) return [];
  const parts = raw.split(/[\n,;|]+/);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    const t = p.trim();
    if (!t) continue;
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out;
}

export function optionArrayToLines(arr: string[]): string {
  return arr.join("\n");
}
