import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import {
  getPayment,
  isMercadoPagoConfigured,
  platformAccessToken,
} from "@/lib/mercadopago";

export const runtime = "nodejs";

/** `storeId|planId|cycle` montado pelo /api/billing/checkout. */
function parseRef(ref: string | undefined) {
  const parts = String(ref ?? "").split("|");
  if (parts.length !== 3) return null;
  const [storeId, planId, cycle] = parts;
  if (!storeId || !planId) return null;
  return { storeId, planId, months: cycle === "annual" ? 12 : 1, cycle };
}

/**
 * Webhook do Mercado Pago para a mensalidade AVULSA (Checkout Pro, sua conta).
 * Reconsulta o pagamento na API do MP, estende o vencimento uma única vez
 * (idempotência pelo índice único payments.payment_id_external) e ativa o plano.
 * Sempre responde 200 para o MP não reenviar em loop.
 *
 * Separado do /api/billing/webhook porque aquele fala com a aplicação de
 * Assinaturas (preapproval) e este com a de Checkout Pro — tokens diferentes.
 */
export async function POST(req: Request) {
  const admin = createAdminSupabase();
  if (!admin || !isMercadoPagoConfigured()) return NextResponse.json({ ok: true });

  const url = new URL(req.url);
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
    const pay = await getPayment(platformAccessToken(), dataId);
    if (pay.status !== "approved") return NextResponse.json({ ok: true });

    const ref = parseRef(pay.external_reference);
    if (!ref) return NextResponse.json({ ok: true }); // não é pagamento de plano

    // Idempotência: o MP reenvia a mesma notificação várias vezes.
    const { data: existing } = await admin
      .from("payments")
      .select("id")
      .eq("payment_id_external", String(pay.id))
      .maybeSingle();
    if (existing) return NextResponse.json({ ok: true });

    // Renovação antecipada soma ao que ainda resta; senão conta a partir de hoje.
    const { data: sub } = await admin
      .from("subscriptions")
      .select("expires_at")
      .eq("store_id", ref.storeId)
      .maybeSingle();

    const paidAt = pay.date_approved ? new Date(pay.date_approved) : new Date();
    const currentEnd = sub?.expires_at ? new Date(sub.expires_at as string) : null;
    const start =
      currentEnd && currentEnd.getTime() > paidAt.getTime() ? currentEnd : paidAt;
    const periodEnd = new Date(start);
    periodEnd.setMonth(periodEnd.getMonth() + ref.months);

    const amount = pay.transaction_amount ?? 0;
    const { error: payErr } = await admin.from("payments").insert({
      store_id: ref.storeId,
      amount,
      method: "mercadopago",
      paid_at: paidAt.toISOString(),
      period_end: periodEnd.toISOString(),
      payment_id_external: String(pay.id),
      notes: `Mercado Pago — avulso ${ref.months} ${ref.months === 1 ? "mês" : "meses"} (pagamento ${pay.id})`,
    });
    // Corrida entre dois webhooks: o índice único barra o 2º — não estende de novo.
    if (payErr) {
      console.error("[billing/checkout/webhook] insert payment", payErr);
      return NextResponse.json({ ok: true });
    }

    await admin.from("subscriptions").upsert(
      {
        store_id: ref.storeId,
        plan_id: ref.planId,
        amount: ref.months === 12 ? Number((amount / 12).toFixed(2)) : amount,
        billing_cycle: ref.cycle === "annual" ? "annual" : "monthly",
        status: "active",
        expires_at: periodEnd.toISOString(),
        gateway: "mercadopago",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "store_id" }
    );
  } catch (err) {
    console.error("[billing/checkout/webhook]", err);
  }

  return NextResponse.json({ ok: true });
}
