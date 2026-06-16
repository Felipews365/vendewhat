import { NextResponse } from "next/server";
import { normalizeStoreSlug } from "@/lib/storeSlug";
import { createAdminSupabase } from "@/lib/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getPayment } from "@/lib/mercadopago";
import { getConfig } from "@/lib/whatsappConfig";
import { isEvolutionConfigured, sendText } from "@/lib/evolution";

export const runtime = "nodejs";

type PaidOrderRow = {
  order_number: number | null;
  customer_name: string | null;
  customer_phone: string | null;
  subtotal: number | null;
  payload: {
    lines?: { name?: string; quantity?: number; lineTotal?: number; color?: string; size?: string }[];
    shippingModeLabel?: string;
    excursionName?: string;
    customerAddress?: string;
  } | null;
};

function formatBRL(n: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number.isFinite(n) ? n : 0);
}

/** Mensagem enviada ao WhatsApp da própria loja quando um pedido é pago no MP. */
function buildPaidMessage(o: PaidOrderRow): string {
  const lines: string[] = ["✅ *Pagamento confirmado — Mercado Pago*", ""];
  if (o.order_number != null) lines.push(`*Pedido:* #${o.order_number}`);
  if (o.customer_name?.trim()) lines.push(`*Cliente:* ${o.customer_name.trim()}`);
  if (o.customer_phone?.trim()) lines.push(`*Telefone:* ${o.customer_phone.trim()}`);
  const p = o.payload ?? {};
  if (p.shippingModeLabel?.trim()) lines.push(`*Forma de envio:* ${p.shippingModeLabel.trim()}`);
  if (p.excursionName?.trim()) lines.push(`*Excursão:* ${p.excursionName.trim()}`);
  if (p.customerAddress?.trim()) lines.push(`*Endereço:* ${p.customerAddress.trim()}`);
  const items = Array.isArray(p.lines) ? p.lines : [];
  if (items.length) {
    lines.push("");
    for (const it of items) {
      const bits: string[] = [];
      if (it.color) bits.push(`Cor: ${it.color}`);
      if (it.size) bits.push(`Tam: ${it.size}`);
      const opt = bits.length ? ` (${bits.join(", ")})` : "";
      lines.push(`${it.quantity ?? 1}x ${it.name ?? "Item"}${opt} — ${formatBRL(Number(it.lineTotal) || 0)}`);
    }
  }
  lines.push("", `*Total pago: ${formatBRL(Number(o.subtotal) || 0)}*`);
  return lines.join("\n");
}

/** Avisa a loja (mensagem para o próprio número conectado) que o pedido foi pago. */
async function notifyStorePaid(
  admin: SupabaseClient,
  storeId: string,
  order: PaidOrderRow
): Promise<void> {
  if (!isEvolutionConfigured()) return;
  const cfg = await getConfig(admin, storeId);
  if (!cfg || cfg.connectionStatus !== "connected" || !cfg.connectedNumber) return;
  await sendText(cfg.evolutionInstance, cfg.connectedNumber, buildPaidMessage(order));
}

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

      // Lê o estado atual para detectar a transição para "pago" (e montar o aviso).
      const { data: order } = await admin
        .from("orders")
        .select(
          "payment_status, order_number, customer_name, customer_phone, subtotal, payload"
        )
        .eq("id", orderId)
        .eq("store_id", store.id)
        .maybeSingle();

      const wasPaid =
        (order as { payment_status?: string } | null)?.payment_status === "pago";

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

      // Avisa a loja no WhatsApp só quando o pedido VIRA pago (evita repetir).
      if (status === "pago" && !wasPaid && order) {
        await notifyStorePaid(admin, store.id, order as PaidOrderRow).catch((e) =>
          console.error("[pay/webhook] notify", e)
        );
      }
    }
  } catch (err) {
    console.error("[pay/webhook]", err);
  }

  return NextResponse.json({ ok: true });
}
