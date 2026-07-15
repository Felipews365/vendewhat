import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import {
  getPayment,
  getPreapproval,
  isSubscriptionConfigured,
  subscriptionAccessToken,
} from "@/lib/mercadopago";

export const runtime = "nodejs";

/**
 * Webhook do Mercado Pago para a MENSALIDADE do SaaS (preapproval).
 * Público: o MP chama esta URL. Sempre reconsultamos o status na API do MP
 * (nunca confiamos só no corpo) e respondemos 200 rápido.
 */
export async function POST(req: Request) {
  // Responde 200 mesmo sem config para o MP não ficar reenviando indefinidamente.
  if (!isSubscriptionConfigured()) {
    return NextResponse.json({ ok: true });
  }

  const admin = createAdminSupabase();
  if (!admin) return NextResponse.json({ ok: true });

  let payload: Record<string, unknown> = {};
  try {
    payload = (await req.json()) as Record<string, unknown>;
  } catch {
    payload = {};
  }

  const url = new URL(req.url);
  const type =
    String(payload.type ?? payload.topic ?? url.searchParams.get("type") ?? "");
  const dataId =
    (payload.data && typeof payload.data === "object"
      ? String((payload.data as { id?: unknown }).id ?? "")
      : "") ||
    String(url.searchParams.get("data.id") ?? url.searchParams.get("id") ?? "");

  if (!dataId) return NextResponse.json({ ok: true });

  try {
    const token = subscriptionAccessToken();

    if (type.includes("preapproval")) {
      const pre = await getPreapproval(token, dataId);
      const storeId = pre.external_reference;
      if (storeId) {
        const status =
          pre.status === "authorized"
            ? "active"
            : pre.status === "paused"
            ? "past_due"
            : pre.status === "cancelled"
            ? "canceled"
            : "past_due";
        await admin
          .from("subscriptions")
          .update({
            status,
            gateway_status: pre.status,
            updated_at: new Date().toISOString(),
          })
          .eq("store_id", storeId);
      }
      return NextResponse.json({ ok: true });
    }

    // Pagamento autorizado da assinatura (cada cobrança mensal).
    if (type.includes("payment")) {
      const pay = await getPayment(token, dataId);
      const storeId = pay.external_reference;
      if (storeId && pay.status === "approved") {
        // Idempotência: não registra o mesmo pagamento duas vezes.
        const { data: existing } = await admin
          .from("payments")
          .select("id")
          .eq("payment_id_external", String(pay.id))
          .maybeSingle();

        const paidAt = pay.date_approved
          ? new Date(pay.date_approved).toISOString()
          : new Date().toISOString();
        const periodEnd = new Date(paidAt);
        periodEnd.setMonth(periodEnd.getMonth() + 1);

        if (!existing) {
          await admin.from("payments").insert({
            store_id: storeId,
            amount: pay.transaction_amount ?? 0,
            method: "mercadopago",
            paid_at: paidAt,
            period_end: periodEnd.toISOString(),
            payment_id_external: String(pay.id),
            notes: `Mercado Pago — pagamento ${pay.id}`,
          });
        }

        await admin
          .from("subscriptions")
          .update({
            status: "active",
            expires_at: periodEnd.toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("store_id", storeId);
      }
      return NextResponse.json({ ok: true });
    }
  } catch (err) {
    console.error("[billing/webhook]", err);
    // 200 mesmo em erro: o MP reenvia, e não queremos loops de 5xx.
  }

  return NextResponse.json({ ok: true });
}
