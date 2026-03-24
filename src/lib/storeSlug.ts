/** Slug da URL /loja/[slug] alinhado ao que é salvo no cadastro (minúsculas, sem espaços). */
export function normalizeStoreSlug(raw: string): string {
  try {
    return decodeURIComponent(raw).trim().toLowerCase();
  } catch {
    return raw.trim().toLowerCase();
  }
}
