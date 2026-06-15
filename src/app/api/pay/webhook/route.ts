import { NextResponse } from "next/server";
import { normalizeStoreSlug } from "@/lib/storeSlug";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { getPayment } from "@/lib/mercadopago";

export const runtime = "nodejs";

/**
 * Webhook do Mercado Pago para os PEDIDOS da loja (gateway do lojista).
 * Identifica a loja por ?store=<slug>, usa o token DESSA loja para reconsultar o
 * pagamento e marca o pedido como pago. Sempre responde 200.
 */
export async function POST(req: Request) {
  const admin = createAdminSupabase();
  if (!admin) return NextResponse.json({ ok: true });

  const url = new URL(req.url);
  const slug = normalizeStoreSlug(String(url.searchParams.get("store") ?? ""));
  if (!slug) return NextResponse.json({ ok: true });

  let payload: Record<string, unknown> = {};
  try {
    payload = (await req.json()) as Record<string, unknown>;
  } catch {
    payload = {};
  }

  const type = String(payload.type ?? payload.topic ?? url.searchParams.get("type") ?? "");
  const dataId =
    (payload.data && typeof payload.data === "object"
      ? String((payload.data as { id?: unknown }).id ?? "")
      : "") || String(url.searchParams.get("data.id") ?? url.searchParams.get("id") ?? "");

  if (!type.includes("payment") || !dataId) {
    return NextResponse.json({ ok: true });
  }

  try {
    const { data: store } = await admin
      .from("stores")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    if (!store?.id) return NextResponse.json({ ok: true });

    const { data: gw } = await admin
      .from("store_payment_gateway")
      .select("access_token")
      .eq("store_id", store.id)
      .maybeSingle();
    if (!gw?.access_token) return NextResponse.json({ ok: true });

    const pay = await getPayment(gw.access_token, dataId);
    const orderId = pay.external_reference;
    if (orderId) {
      const status =
        pay.status === "approved"
          ? "pago"
          : pay.status === "rejected" || pay.status === "cancelled"
          ? "falhou"
          : "pendente";
      await admin
        .from("orders")
        .update({
          payment_status: status,
          payment_provider: "mercadopago",
          payment_id: String(pay.id),
          paid_at: pay.status === "approved" ? new Date().toISOString() : null,
        })
        .eq("id", orderId)
        .eq("store_id", store.id);
    }
  } catch (err) {
    console.error("[pay/webhook]", err);
  }

  return NextResponse.json({ ok: true });
}
