/** Uma linha de estoque por combinação cor + tamanho (strings vazias se só uma dimensão). */
export type VariantStockRow = {
  color: string;
  size: string;
  stock: number;
};

export function variantStockKey(color: string, size: string): string {
  return JSON.stringify([color.trim(), size.trim()]);
}

/** Todas as combinações: só cor → uma linha por cor (size ""); só tamanho → size por linha; ambos → grade. */
export function buildVariantCombinations(
  colors: string[],
  sizes: string[]
): { color: string; size: string }[] {
  if (colors.length === 0 && sizes.length === 0) return [];
  const col = colors.length > 0 ? colors : [""];
  const siz = sizes.length > 0 ? sizes : [""];
  const out: { color: string; size: string }[] = [];
  for (const color of col) {
    for (const size of siz) {
      out.push({ color, size });
    }
  }
  return out;
}

export function variantStockFromDb(raw: unknown): VariantStockRow[] {
  if (!Array.isArray(raw)) return [];
  const out: VariantStockRow[] = [];
  for (const x of raw) {
    if (!x || typeof x !== "object") continue;
    const o = x as Record<string, unknown>;
    const color = typeof o.color === "string" ? o.color : "";
    const size = typeof o.size === "string" ? o.size : "";
    let stock = 0;
    if (typeof o.stock === "number" && !Number.isNaN(o.stock)) {
      stock = Math.max(0, Math.floor(o.stock));
    } else if (o.stock != null) {
      const n = parseInt(String(o.stock), 10);
      if (!Number.isNaN(n)) stock = Math.max(0, n);
    }
    out.push({ color, size, stock });
  }
  return out;
}

export function sumVariantStockRows(rows: VariantStockRow[]): number {
  return rows.reduce((a, r) => a + r.stock, 0);
}

/** Estoque da combinação exata; se não achar, 0. */
export function getStockForVariant(
  rows: VariantStockRow[],
  color: string,
  size: string
): number {
  const c = color.trim();
  const s = size.trim();
  const row = rows.find(
    (r) => r.color.trim() === c && r.size.trim() === s
  );
  return row?.stock ?? 0;
}

export function mapFromVariantRows(
  combos: { color: string; size: string }[],
  rows: VariantStockRow[]
): Record<string, number> {
  const m: Record<string, number> = {};
  for (const { color, size } of combos) {
    const k = variantStockKey(color, size);
    const row = rows.find(
      (r) =>
        r.color.trim() === color.trim() && r.size.trim() === size.trim()
    );
    m[k] = row?.stock ?? 0;
  }
  return m;
}

export function rowsFromMap(
  combos: { color: string; size: string }[],
  map: Record<string, number>
): VariantStockRow[] {
  return combos.map(({ color, size }) => ({
    color,
    size,
    stock: Math.max(0, Math.floor(map[variantStockKey(color, size)] ?? 0)),
  }));
}

/** Ao mudar cores/tamanhos, preserva quantidades das combinações que ainda existem. */
export function mergeVariantStockMap(
  prev: Record<string, number>,
  colors: string[],
  sizes: string[]
): Record<string, number> {
  if (colors.length === 0 && sizes.length === 0) return {};
  const combos = buildVariantCombinations(colors, sizes);
  const next: Record<string, number> = {};
  for (const { color, size } of combos) {
    const k = variantStockKey(color, size);
    next[k] = prev[k] ?? 0;
  }
  return next;
}

/** Total para exibir na listagem do painel. */
export function displayTotalStock(product: {
  stock: number;
  variant_stock?: unknown;
}): number {
  const rows = variantStockFromDb(product.variant_stock);
  if (rows.length > 0) return sumVariantStockRows(rows);
  return product.stock;
}
