/**
 * Criação de pedidos no servidor (service role). Fonte única usada pelo checkout
 * da loja pública ([/api/orders]) e pela IA do WhatsApp, que registra o pedido no
 * painel quando o cliente fecha pela conversa/PDF. Só no servidor.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  type OrderLineInput,
  type ProductRowForOrder,
  validateOrderAgainstProducts,
} from "@/lib/orderLines";
import { isMissingColumnError } from "@/lib/dbColumnErrors";
import { isShippingModeId, shippingModeLabel } from "@/lib/shippingModes";
import { isPaymentMethodId } from "@/lib/paymentMethods";
import { markCartConverted } from "@/lib/whatsappConfig";
import { toWhatsAppNumber } from "@/lib/customerPhone";

export type CreateStoreOrderInput = {
  storeId: string;
  customerName: string;
  /** Telefone do cliente (pode ser ""). */
  customerPhone: string;
  lines: OrderLineInput[];
  /** Id da forma de envio (excursao | correios | transportadora | retirada). */
  shippingMode: string;
  /** Id da forma de pagamento (pix | dinheiro | cartao | mercadopago) ou "". */
  paymentMethod?: string;
  customerAddress?: string;
  excursionName?: string;
  carrierName?: string;
  notes?: string;
};

export type CreateStoreOrderResult =
  | {
      ok: true;
      id: string;
      orderNumber: number;
      subtotal: number;
    }
  | { ok: false; error: string; status: number };

/**
 * Valida os itens contra o catálogo e insere o pedido (status "novo"). Devolve o
 * número do pedido gravado. Não faz autenticação nem lê o corpo da requisição —
 * quem chama já preparou os dados.
 */
export async function createStoreOrder(
  admin: SupabaseClient,
  input: CreateStoreOrderInput
): Promise<CreateStoreOrderResult> {
  const storeId = input.storeId;
  const customerName = input.customerName.trim().slice(0, 200);
  if (customerName.length < 2) {
    return { ok: false, error: "Nome do cliente inválido.", status: 400 };
  }
  const customerPhone = input.customerPhone.trim().slice(0, 40);

  const rawMode = String(input.shippingMode ?? "").trim();
  const shippingMode = isShippingModeId(rawMode) ? rawMode : "";
  if (!shippingMode) {
    return { ok: false, error: "Forma de entrega inválida.", status: 400 };
  }
  const shippingModeLabelPt = shippingModeLabel(shippingMode) ?? shippingMode;

  const merged = input.lines.filter((l) => l && l.productId);
  const idSet = new Set(merged.map((l) => l.productId).filter(Boolean));
  if (idSet.size === 0) {
    return { ok: false, error: "Carrinho vazio.", status: 400 };
  }

  const orderProductSelectWithRef =
    "id, store_id, name, price, colors, sizes, variant_stock, stock, product_reference, barcode, active";
  const orderProductSelectNoRef =
    "id, store_id, name, price, colors, sizes, variant_stock, stock, active";

  const q1 = await admin
    .from("products")
    .select(orderProductSelectWithRef)
    .eq("store_id", storeId)
    .in("id", Array.from(idSet));

  let products = q1.data as ProductRowForOrder[] | null;
  let prodErr = q1.error;

  // Bases sem `product_reference` e/ou `barcode` (migrations não rodadas): cai no
  // select mínimo. São opcionais e só enfeitam o comprovante.
  if (
    prodErr &&
    (isMissingColumnError(prodErr.message, "product_reference", prodErr.code) ||
      isMissingColumnError(prodErr.message, "barcode", prodErr.code))
  ) {
    const q2 = await admin
      .from("products")
      .select(orderProductSelectNoRef)
      .eq("store_id", storeId)
      .in("id", Array.from(idSet));
    products = q2.data as ProductRowForOrder[] | null;
    prodErr = q2.error;
  }

  if (prodErr || !products?.length) {
    return { ok: false, error: "Não foi possível validar os produtos.", status: 400 };
  }

  const activeProducts = products.filter(
    (p) => p.active === true || p.active == null
  ) as ProductRowForOrder[];

  const validated = validateOrderAgainstProducts(merged, activeProducts, storeId);
  if (!validated.ok) {
    return { ok: false, error: validated.error, status: 400 };
  }

  const notes =
    typeof input.notes === "string" ? input.notes.trim().slice(0, 2000) : "";

  // Endereço só para entrega; na retirada fica vazio.
  const customerAddress =
    shippingMode === "retirada"
      ? ""
      : String(input.customerAddress ?? "").trim().slice(0, 500);
  const excursionName =
    shippingMode === "excursao"
      ? String(input.excursionName ?? "").trim().slice(0, 120)
      : "";
  const carrierName =
    shippingMode === "transportadora"
      ? String(input.carrierName ?? "").trim().slice(0, 120)
      : "";

  const rawPaymentMethod = String(input.paymentMethod ?? "").trim();
  const paymentMethod = isPaymentMethodId(rawPaymentMethod) ? rawPaymentMethod : "";

  const payloadLines = validated.pricedLines.map((l) => ({
    productId: l.productId,
    name: l.name,
    quantity: l.quantity,
    color: l.color,
    size: l.size,
    unitPrice: l.unitPrice,
    lineTotal: l.unitPrice * l.quantity,
    productReference: l.productReference,
    barcode: l.barcode,
  }));

  const subtotal = payloadLines.reduce((s, l) => s + l.lineTotal, 0);

  const { data: lastNumRow } = await admin
    .from("orders")
    .select("order_number")
    .eq("store_id", storeId)
    .order("order_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  const lastN =
    typeof lastNumRow?.order_number === "number" &&
    !Number.isNaN(lastNumRow.order_number)
      ? lastNumRow.order_number
      : 0;
  const orderNumber = lastN + 1;

  const { data: inserted, error: insErr } = await admin
    .from("orders")
    .insert({
      store_id: storeId,
      order_number: orderNumber,
      customer_name: customerName,
      customer_phone: customerPhone || null,
      subtotal,
      notes: notes || null,
      status: "novo",
      payload: {
        lines: payloadLines,
        subtotal,
        customerName,
        customerPhone: customerPhone || undefined,
        orderNumber,
        shippingMode,
        shippingModeLabel: shippingModeLabelPt,
        excursionName: excursionName || undefined,
        carrierName: carrierName || undefined,
        paymentMethod: paymentMethod || undefined,
        customerAddress: customerAddress || undefined,
      },
    })
    .select("id, order_number")
    .single();

  if (insErr || !inserted?.id) {
    console.error("[orders.server] insert", insErr);
    return { ok: false, error: "Não foi possível salvar o pedido.", status: 500 };
  }

  // O pedido saiu: o carrinho não está mais abandonado — não cutuca esse cliente.
  if (customerPhone) {
    try {
      await markCartConverted(admin, storeId, toWhatsAppNumber(customerPhone));
    } catch (err) {
      console.error("[orders.server] markCartConverted", err);
    }
  }

  return {
    ok: true,
    id: String(inserted.id),
    orderNumber:
      typeof inserted.order_number === "number" ? inserted.order_number : orderNumber,
    subtotal,
  };
}
