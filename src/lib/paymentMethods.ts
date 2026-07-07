/** Formas de pagamento que o cliente escolhe no checkout da loja pública. */
export const PAYMENT_METHODS = [
  { id: "pix", label: "Pix" },
  { id: "dinheiro", label: "Dinheiro na entrega" },
  { id: "cartao", label: "Cartão na entrega" },
  { id: "mercadopago", label: "Mercado Pago (online)" },
] as const;

export type PaymentMethodId = (typeof PAYMENT_METHODS)[number]["id"];

const ALLOWED = new Set<string>(PAYMENT_METHODS.map((m) => m.id));

export function isPaymentMethodId(v: string): v is PaymentMethodId {
  return ALLOWED.has(v);
}

export function paymentMethodLabel(id: string | null | undefined): string | null {
  if (!id) return null;
  const row = PAYMENT_METHODS.find((m) => m.id === id);
  return row ? row.label : null;
}
