import { optionArrayFromDb } from "@/lib/productOptions";
import {
  getStockForVariant,
  variantStockFromDb,
  type VariantStockRow,
} from "@/lib/productVariants";

export type OrderLineInput = {
  productId: string;
  color: string;
  size: string;
  quantity: number;
};

export type ProductRowForOrder = {
  id: string;
  store_id: string;
  name: string;
  price: number;
  colors: unknown;
  sizes: unknown;
  variant_stock: unknown;
  stock: number;
  product_reference?: string | null;
  /** Presente nas queries da API de pedidos; usado para filtrar inativos. */
  active?: boolean | null;
};

function makeCartKey(productId: string, color: string, size: string): string {
  return JSON.stringify([productId, color.trim(), size.trim()]);
}

function parseCartKey(key: string): {
  productId: string;
  color: string;
  size: string;
} {
  try {
    const [productId, color, size] = JSON.parse(key) as [
      string,
      string,
      string,
    ];
    return { productId, color: color ?? "", size: size ?? "" };
  } catch {
    return { productId: key, color: "", size: "" };
  }
}

function totalQtyForProduct(
  cart: Record<string, number>,
  productId: string,
  excludeKey?: string
): number {
  let sum = 0;
  for (const [k, q] of Object.entries(cart)) {
    if (q <= 0 || k === excludeKey) continue;
    const { productId: pid } = parseCartKey(k);
    if (pid === productId) sum += q;
  }
  return sum;
}

function maxQtyForCartLine(
  colors: string[],
  sizes: string[],
  variantStock: VariantStockRow[],
  productStock: number,
  productId: string,
  color: string,
  size: string,
  cart: Record<string, number>,
  lineKey: string
): number {
  const hasOpts = colors.length > 0 || sizes.length > 0;
  if (hasOpts && variantStock.length > 0) {
    const c = colors.length ? color.trim() : "";
    const s = sizes.length ? size.trim() : "";
    return getStockForVariant(variantStock, c, s);
  }
  return Math.max(0, productStock - totalQtyForProduct(cart, productId, lineKey));
}

/** Agrupa linhas iguais (mesmo produto/cor/tam) somando quantidades. */
export function mergeOrderLines(lines: OrderLineInput[]): OrderLineInput[] {
  const map = new Map<string, OrderLineInput>();
  for (const line of lines) {
    const k = `${line.productId}\0${line.color.trim()}\0${line.size.trim()}`;
    const prev = map.get(k);
    const q = Math.max(0, Math.floor(Number(line.quantity)) || 0);
    if (q <= 0) continue;
    if (prev) {
      map.set(k, { ...prev, quantity: prev.quantity + q });
    } else {
      map.set(k, {
        productId: line.productId.trim(),
        color: line.color.trim(),
        size: line.size.trim(),
        quantity: q,
      });
    }
  }
  return Array.from(map.values());
}

/** Valida estoque e devolve linhas com preço do banco ou null + erro. */
export function validateOrderAgainstProducts(
  lines: OrderLineInput[],
  products: ProductRowForOrder[],
  storeId: string
): { ok: true; cart: Record<string, number>; pricedLines: Array<OrderLineInput & { unitPrice: number; name: string; productReference: string | null }> } | { ok: false; error: string } {
  const merged = mergeOrderLines(lines);
  if (merged.length === 0) {
    return { ok: false, error: "Nenhum item no pedido." };
  }

  const byId = new Map(products.map((p) => [p.id, p]));
  for (const l of merged) {
    const p = byId.get(l.productId);
    if (!p || p.store_id !== storeId) {
      return { ok: false, error: "Produto inválido no pedido." };
    }
  }

  const cart: Record<string, number> = {};
  for (const l of merged) {
    const key = makeCartKey(l.productId, l.color, l.size);
    cart[key] = (cart[key] ?? 0) + l.quantity;
  }

  const pricedLines: Array<
    OrderLineInput & {
      unitPrice: number;
      name: string;
      productReference: string | null;
    }
  > = [];

  for (const l of merged) {
    const p = byId.get(l.productId)!;
    const colors = optionArrayFromDb(p.colors);
    const sizes = optionArrayFromDb(p.sizes);
    const variantStock = variantStockFromDb(p.variant_stock);
    const lineKey = makeCartKey(l.productId, l.color, l.size);
    const max = maxQtyForCartLine(
      colors,
      sizes,
      variantStock,
      Number(p.stock),
      l.productId,
      l.color,
      l.size,
      cart,
      lineKey
    );
    if (l.quantity > max) {
      return {
        ok: false,
        error: `Quantidade acima do estoque para "${p.name}".`,
      };
    }
    const ref =
      typeof p.product_reference === "string" && p.product_reference.trim()
        ? p.product_reference.trim()
        : null;
    pricedLines.push({
      ...l,
      unitPrice: Number(p.price),
      name: String(p.name ?? "Produto"),
      productReference: ref,
    });
  }

  return { ok: true, cart, pricedLines };
}
