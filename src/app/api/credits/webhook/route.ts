import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { getPayment, platformAccessToken, isMercadoPagoConfigured } from "@/lib/mercadopago";
import { addCredits } from "@/lib/aiCredits";
import { getConfig } from "@/lib/whatsappConfig";
import { isEvolutionConfigured, sendText } from "@/lib/evolution";

export const runtime = "nodejs";

/** Avisa a loja (WhatsApp conectado) que a recarga entrou. Não lança. */
async function notifyRecharge(
  admin: ReturnType<typeof createAdminSupabase>,
  storeId: string,
  conversations: number
): Promise<void> {
  if (!admin || !isEvolutionConfigured()) return;
  const cfg = await getConfig(admin, storeId);
  if (!cfg || cfg.connectionStatus !== "connected" || !cfg.connectedNumber) return;
  const msg = [
    "✅ *Recarga de créditos confirmada*",
    "",
    `Foram adicionadas ${conversations} conversas ao seu saldo de IA. 🎉`,
    "",
    "A IA já voltou a atender normalmente.",
  ].join("\n");
  try {
    await sendText(cfg.evolutionInstance, cfg.connectedNumber, msg);
  } catch (e) {
    console.error("[credits/webhook] notify", e);
  }
}

/**
 * Webhook do Mercado Pago para as RECARGAS de crédito (sua conta MP). Reconsulta o
 * pagamento, credita os tokens uma única vez (claim atômico na compra) e avisa a
 * loja. Sempre responde 200.
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
    const purchaseId = pay.external_reference;
    if (!purchaseId) return NextResponse.json({ ok: true });

    if (pay.status !== "approved") {
      // Marca falha/pendência sem creditar (não sobrescreve uma já aprovada).
      if (pay.status === "rejected" || pay.status === "cancelled") {
        await admin
          .from("ai_credit_purchases")
          .update({ status: "rejected", payment_id: String(pay.id), updated_at: new Date().toISOString() })
          .eq("id", purchaseId)
          .neq("status", "approved");
      }
      return NextResponse.json({ ok: true });
    }

    // Claim atômico: só credita se ESTA chamada transicionar a compra para "approved"
    // (o .neq garante que webhooks repetidos do MP não creditem 2x).
    const { data: claimed } = await admin
      .from("ai_credit_purchases")
      .update({
        status: "approved",
        payment_id: String(pay.id),
        updated_at: new Date().toISOString(),
      })
      .eq("id", purchaseId)
      .neq("status", "approved")
      .select("store_id, tokens, conversations")
      .maybeSingle();

    if (claimed) {
      await addCredits(admin, claimed.store_id as string, Number(claimed.tokens));
      await notifyRecharge(admin, claimed.store_id as string, Number(claimed.conversations));
    }
  } catch (err) {
    console.error("[credits/webhook]", err);
  }

  return NextResponse.json({ ok: true });
}
