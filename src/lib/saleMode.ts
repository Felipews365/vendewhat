/**
 * Modo de venda do produto: avulso (unit), fardo fechado (pack) ou quantidade
 * mínima (min). Client-safe — sem dependências de servidor.
 *
 * O preço gravado em `products.price` é SEMPRE por unidade. O preço do fardo é
 * derivado (preço × packSize). A quantidade no carrinho é sempre em UNIDADES.
 */
export type SaleMode = "unit" | "pack" | "min";
export type PriceDisplay = "unit" | "pack";

export const SALE_MODES: SaleMode[] = ["unit", "pack", "min"];

export const SALE_MODE_LABELS: Record<SaleMode, string> = {
  unit: "Por unidade",
  pack: "Só em fardo fechado",
  min: "Quantidade mínima",
};

export type ProductSale = {
  saleMode: SaleMode;
  /** Unidades por fardo (modo "pack"). */
  packSize: number;
  /** Quantidade mínima (modo "min"). */
  minQuantity: number;
  /** Como exibir o preço na vitrine. */
  priceDisplay: PriceDisplay;
};

export const DEFAULT_PRODUCT_SALE: ProductSale = {
  saleMode: "unit",
  packSize: 1,
  minQuantity: 1,
  priceDisplay: "unit",
};

function toInt(v: unknown, fallback: number): number {
  const n =
    typeof v === "number" ? v : parseInt(String(v ?? "").replace(/\D/g, ""), 10);
  return Number.isFinite(n) ? n : fallback;
}

/** Lê os campos de venda a partir de uma linha do banco (snake_case). */
export function productSaleFromDb(row: Record<string, unknown>): ProductSale {
  const rawMode = String(row.sale_mode ?? "unit");
  const saleMode: SaleMode = SALE_MODES.includes(rawMode as SaleMode)
    ? (rawMode as SaleMode)
    : "unit";
  const packSize = Math.max(1, toInt(row.pack_size, 1));
  const minQuantity = Math.max(1, toInt(row.min_quantity, 1));
  const priceDisplay: PriceDisplay =
    String(row.price_display ?? "unit") === "pack" ? "pack" : "unit";
  return {
    saleMode,
    packSize: saleMode === "pack" ? Math.max(2, packSize) : packSize,
    minQuantity: saleMode === "min" ? Math.max(2, minQuantity) : minQuantity,
    // "pack" no display só faz sentido em modo fardo.
    priceDisplay: saleMode === "pack" ? priceDisplay : "unit",
  };
}

/** Incremento de quantidade no carrinho (em unidades). */
export function quantityStep(s: ProductSale): number {
  return s.saleMode === "pack" ? Math.max(1, s.packSize) : 1;
}

/** Quantidade mínima para comprar (em unidades). */
export function quantityMin(s: ProductSale): number {
  if (s.saleMode === "pack") return Math.max(1, s.packSize);
  if (s.saleMode === "min") return Math.max(1, s.minQuantity);
  return 1;
}

/**
 * Ajusta uma quantidade pedida para um valor válido: múltiplo do passo, dentro
 * de [mínimo, máximo]. Retorna 0 quando não cabe nem o mínimo ou quando o pedido
 * cai abaixo do mínimo (= remover a linha do carrinho).
 */
export function snapQuantity(
  s: ProductSale,
  qty: number,
  max: number
): number {
  const step = quantityStep(s);
  const min = quantityMin(s);
  const maxStepped = Math.floor(Math.max(0, max) / step) * step;
  if (maxStepped < min) return 0;
  if (qty < min) return 0;
  let snapped = Math.round(qty / step) * step;
  if (snapped < min) snapped = min;
  if (snapped > maxStepped) snapped = maxStepped;
  return snapped;
}

/** Número de fardos que uma quantidade (em unidades) representa. */
export function packCount(s: ProductSale, qty: number): number {
  const step = quantityStep(s);
  return step > 1 ? Math.round(qty / step) : qty;
}

/** Rótulo curto de quantidade (ex.: "20 un. (2 fardos)"). */
export function quantityLabel(s: ProductSale, qty: number): string {
  if (s.saleMode === "pack" && s.packSize > 1) {
    const fardos = packCount(s, qty);
    return `${qty} un. (${fardos} fardo${fardos === 1 ? "" : "s"})`;
  }
  return `${qty} un.`;
}
