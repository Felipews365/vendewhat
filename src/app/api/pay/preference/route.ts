import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { createPreference } from "@/lib/mercadopago";

export const runtime = "nodejs";

type Body = { orderId?: string };

type PayloadLine = {
  name?: string;
  quantity?: number;
  unitPrice?: number;
};

/**
 * Cria a preference (checkout) de um pedido usando o token do LOJISTA dono da
 * loja, e devolve o init_point. Público: chamado pela loja pública depois que o
 * pedido foi salvo.
 */
export async function POST(req: Request) {
  const admin = createAdminSupabase();
  if (!admin) {
    return NextResponse.json(
      { ok: false, error: "Pagamentos não configurados no servidor." },
      { status: 503 }
    );
  }

  const baseUrl = process.env.APP_BASE_URL;
  if (!baseUrl) {
    return NextResponse.json(
      { ok: false, error: "APP_BASE_URL não configurada no servidor." },
      { status: 503 }
    );
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido." }, { status: 400 });
  }

  const orderId = String(body.orderId ?? "").trim();
  if (!orderId) {
    return NextResponse.json({ ok: false, error: "Pedido inválido." }, { status: 400 });
  }

  const { data: order } = await admin
    .from("orders")
    .select("id, store_id, order_number, customer_name, subtotal, payload")
    .eq("id", orderId)
    .maybeSingle();
  if (!order) {
    return NextResponse.json({ ok: false, error: "Pedido não encontrado." }, { status: 404 });
  }

  const { data: store } = await admin
    .from("stores")
    .select("slug")
    .eq("id", order.store_id)
    .maybeSingle();

  const { data: gw } = await admin
    .from("store_payment_gateway")
    .select("access_token, enabled")
    .eq("store_id", order.store_id)
    .maybeSingle();

  if (!gw?.access_token || gw.enabled === false) {
    return NextResponse.json(
      { ok: false, error: "Esta loja não tem pagamento online ativo." },
      { status: 400 }
    );
  }

  const payload = (order.payload ?? {}) as { lines?: PayloadLine[] };
  const lines = Array.isArray(payload.lines) ? payload.lines : [];
  const items = lines
    .filter((l) => Number(l.unitPrice) > 0 && Number(l.quantity) > 0)
    .map((l) => ({
      title: String(l.name ?? "Item"),
      quantity: Number(l.quantity),
      unitPrice: Number(l.unitPrice),
    }));

  // Fallback: se não houver linhas com preço, cobra o subtotal num único item.
  if (items.length === 0) {
    const subtotal = Number(order.subtotal) || 0;
    if (subtotal <= 0) {
      return NextResponse.json(
        { ok: false, error: "Pedido sem valor a cobrar." },
        { status: 400 }
      );
    }
    items.push({
      title: `Pedido #${order.order_number}`,
      quantity: 1,
      unitPrice: subtotal,
    });
  }

  const base = baseUrl.replace(/\/+$/, "");
  const slug = store?.slug ?? "";
  try {
    const pref = await createPreference(gw.access_token, {
      items,
      externalReference: orderId,
      notificationUrl: `${base}/api/pay/webhook?store=${encodeURIComponent(slug)}`,
      backUrls: {
        success: `${base}/loja/${slug}?pago=1`,
        pending: `${base}/loja/${slug}?pago=pendente`,
        failure: `${base}/loja/${slug}?pago=falhou`,
      },
      payerName: String(order.customer_name ?? ""),
    });

    const initPoint = pref.init_point ?? pref.sandbox_init_point;
    if (!initPoint) {
      return NextResponse.json(
        { ok: false, error: "Mercado Pago não retornou o link de pagamento." },
        { status: 502 }
      );
    }
    return NextResponse.json({ ok: true, initPoint });
  } catch (err) {
    console.error("[pay/preference]", err);
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Falha ao criar o pagamento.",
      },
      { status: 502 }
    );
  }
}
