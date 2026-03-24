import { NextResponse } from "next/server";
import { normalizeStoreSlug } from "@/lib/storeSlug";
import {
  type OrderLineInput,
  type ProductRowForOrder,
  validateOrderAgainstProducts,
} from "@/lib/orderLines";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { isCustomerPhoneValid } from "@/lib/customerPhone";
import { isShippingModeId, shippingModeLabel } from "@/lib/shippingModes";

export const runtime = "nodejs";

type Body = {
  storeSlug?: string;
  notes?: string;
  customerName?: string;
  customerPhone?: string;
  /** excursao | correios | retirada */
  shippingMode?: string;
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
  const mergedForIds = new Set(lines.map((l) => l.productId).filter(Boolean));
  if (mergedForIds.size === 0) {
    return NextResponse.json({ ok: false, error: "Carrinho vazio." }, { status: 400 });
  }

  const { data: products, error: prodErr } = await admin
    .from("products")
    .select(
      "id, store_id, name, price, colors, sizes, variant_stock, stock, product_reference, active"
    )
    .eq("store_id", storeId)
    .in("id", Array.from(mergedForIds));

  if (prodErr || !products?.length) {
    return NextResponse.json(
      { ok: false, error: "Não foi possível validar os produtos." },
      { status: 400 }
    );
  }

  const activeProducts = products.filter(
    (p) => p.active === true || p.active == null
  ) as ProductRowForOrder[];

  const validated = validateOrderAgainstProducts(lines, activeProducts, storeId);
  if (!validated.ok) {
    return NextResponse.json({ ok: false, error: validated.error }, { status: 400 });
  }

  const notes =
    typeof body.notes === "string" ? body.notes.trim().slice(0, 2000) : "";

  const rawMode = String(body.shippingMode ?? "").trim();
  const shippingMode = isShippingModeId(rawMode) ? rawMode : "";
  if (!shippingMode) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Escolha a forma de entrega: excursão, Correios ou retirada.",
      },
      { status: 400 }
    );
  }
  const shippingModeLabelPt = shippingModeLabel(shippingMode) ?? shippingMode;

  const payloadLines = validated.pricedLines.map((l) => ({
    productId: l.productId,
    name: l.name,
    quantity: l.quantity,
    color: l.color,
    size: l.size,
    unitPrice: l.unitPrice,
    lineTotal: l.unitPrice * l.quantity,
    productReference: l.productReference,
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
    typeof lastNumRow?.order_number === "number" && !Number.isNaN(lastNumRow.order_number)
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
      },
    })
    .select("id, order_number")
    .single();

  if (insErr) {
    console.error("[api/orders] insert", insErr);
    return NextResponse.json(
      { ok: false, error: "Não foi possível salvar o pedido." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    saved: true,
    id: inserted?.id,
    orderNumber: inserted?.order_number ?? orderNumber,
  });
}
