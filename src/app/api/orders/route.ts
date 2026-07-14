import { NextResponse } from "next/server";
import { normalizeStoreSlug } from "@/lib/storeSlug";
import { type OrderLineInput } from "@/lib/orderLines";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { isCustomerPhoneValid } from "@/lib/customerPhone";
import { isShippingModeId } from "@/lib/shippingModes";
import { createStoreOrder } from "@/lib/orders.server";

export const runtime = "nodejs";

type Body = {
  storeSlug?: string;
  notes?: string;
  customerName?: string;
  customerPhone?: string;
  /** excursao | correios | retirada */
  shippingMode?: string;
  /** Nome da excursão (só quando shippingMode === "excursao"). */
  excursionName?: string;
  /** Nome da transportadora (só quando shippingMode === "transportadora"). */
  carrierName?: string;
  /** Forma de pagamento escolhida pelo cliente (pix | dinheiro | cartao | mercadopago). */
  paymentMethod?: string;
  /** Endereço de entrega informado pelo cliente (excursão / correios / transportadora). */
  customerAddress?: string;
  lines?: OrderLineInput[];
};

export async function POST(req: Request) {
  const admin = createAdminSupabase();
  if (!admin) {
    return NextResponse.json(
      { ok: false, saved: false, error: "Pedidos não configurados no servidor." },
      { status: 503 }
    );
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido." }, { status: 400 });
  }

  const slug = normalizeStoreSlug(String(body.storeSlug ?? ""));
  if (!slug) {
    return NextResponse.json({ ok: false, error: "Loja inválida." }, { status: 400 });
  }

  const customerName = String(body.customerName ?? "").trim().slice(0, 200);
  if (customerName.length < 2) {
    return NextResponse.json(
      { ok: false, error: "Informe o nome do cliente (mínimo 2 caracteres)." },
      { status: 400 }
    );
  }

  const customerPhone = String(body.customerPhone ?? "")
    .trim()
    .slice(0, 40);

  if (!isCustomerPhoneValid(customerPhone)) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Informe um telefone / WhatsApp válido com DDD (10 a 15 dígitos).",
      },
      { status: 400 }
    );
  }

  const rawLines = Array.isArray(body.lines) ? body.lines : [];
  const lines: OrderLineInput[] = rawLines
    .filter(
      (x) =>
        x &&
        typeof x === "object" &&
        typeof (x as OrderLineInput).productId === "string"
    )
    .map((x) => ({
      productId: String((x as OrderLineInput).productId).trim(),
      color: String((x as OrderLineInput).color ?? "").trim(),
      size: String((x as OrderLineInput).size ?? "").trim(),
      quantity: Number((x as OrderLineInput).quantity),
    }));

  const { data: store, error: storeErr } = await admin
    .from("stores")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();

  if (storeErr || !store?.id) {
    return NextResponse.json({ ok: false, error: "Loja não encontrada." }, { status: 404 });
  }

  const storeId = store.id as string;
  if (lines.filter((l) => l.productId).length === 0) {
    return NextResponse.json({ ok: false, error: "Carrinho vazio." }, { status: 400 });
  }

  // A forma de entrega é obrigatória no checkout (mensagem específica).
  const rawMode = String(body.shippingMode ?? "").trim();
  if (!isShippingModeId(rawMode)) {
    return NextResponse.json(
      {
        ok: false,
        error: "Escolha a forma de entrega: excursão, Correios ou retirada.",
      },
      { status: 400 }
    );
  }

  // Criação do pedido (fonte única, compartilhada com a IA do WhatsApp).
  const result = await createStoreOrder(admin, {
    storeId,
    customerName,
    customerPhone,
    lines,
    shippingMode: rawMode,
    paymentMethod: String(body.paymentMethod ?? ""),
    customerAddress: String(body.customerAddress ?? ""),
    excursionName: String(body.excursionName ?? ""),
    carrierName: String(body.carrierName ?? ""),
    notes: typeof body.notes === "string" ? body.notes : "",
  });

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error },
      { status: result.status }
    );
  }

  return NextResponse.json({
    ok: true,
    saved: true,
    id: result.id,
    orderNumber: result.orderNumber,
  });
}
