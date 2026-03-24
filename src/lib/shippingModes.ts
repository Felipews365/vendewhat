/** Formas de envio / retirada no checkout da loja pública. */
export const SHIPPING_MODES = [
  { id: "excursao", label: "Excursão" },
  { id: "correios", label: "Correios" },
  { id: "retirada", label: "Retirada" },
] as const;

export type ShippingModeId = (typeof SHIPPING_MODES)[number]["id"];

const ALLOWED = new Set<string>(SHIPPING_MODES.map((m) => m.id));

/** IDs antigos (pedidos já gravados) → rótulo legível */
const LEGACY_LABELS: Record<string, string> = {
  marcar: "Marcar entrega",
  envio: "Envio",
};

export function isShippingModeId(v: string): v is ShippingModeId {
  return ALLOWED.has(v);
}

export function shippingModeLabel(id: string | null | undefined): string | null {
  if (!id) return null;
  const row = SHIPPING_MODES.find((m) => m.id === id);
  if (row) return row.label;
  return LEGACY_LABELS[id] ?? null;
}
