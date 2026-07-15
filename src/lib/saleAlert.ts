/**
 * Aviso de venda nova para o lojista, por WhatsApp. Dispara em toda venda criada
 * pela loja (checkout do site ou pedido que a IA fechou pela conversa/PDF) —
 * chamado dentro de `createStoreOrder`, fonte única dos dois fluxos. A mensagem
 * sai do próprio WhatsApp conectado da loja para o número escolhido no painel
 * (`storefront.saleAlertPhone`). Só no servidor. Nunca lança.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { getConfig } from "@/lib/whatsappConfig";
import { sendText } from "@/lib/evolution";
import { toWhatsAppNumber } from "@/lib/customerPhone";

export type NewSaleInfo = {
  orderNumber: number;
  customerName: string;
  subtotal: number;
  itemCount: number;
  /** Origem da venda: "ia" (fechada na conversa) ou "site" (checkout do catálogo). */
  origin: "ia" | "site";
};

function formatBRL(n: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(n);
}

/**
 * Envia o aviso de venda ao número configurado, se o lojista ativou o recurso e
 * o WhatsApp da loja está conectado. Retorna silenciosamente se qualquer
 * pré-condição faltar. Não interrompe a criação do pedido.
 */
export async function notifyNewSale(
  admin: SupabaseClient,
  storeId: string,
  info: NewSaleInfo
): Promise<void> {
  try {
    const { data: store } = await admin
      .from("stores")
      .select("storefront")
      .eq("id", storeId)
      .maybeSingle();
    const sf =
      store?.storefront && typeof store.storefront === "object"
        ? (store.storefront as Record<string, unknown>)
        : {};

    const enabled = sf.saleAlertEnabled === true;
    const phoneDigits = String(sf.saleAlertPhone ?? "").replace(/\D/g, "");
    if (!enabled || phoneDigits.length < 10) return;

    const cfg = await getConfig(admin, storeId);
    if (!cfg || cfg.connectionStatus !== "connected") return;

    const target = toWhatsAppNumber(phoneDigits);
    if (!target) return;

    const originLine =
      info.origin === "ia"
        ? "Fechada pela IA na conversa 🤖"
        : "Feita pelo catálogo da loja 🛒";
    const itens = `${info.itemCount} item${info.itemCount === 1 ? "" : "s"}`;
    const msg = [
      "🔔 *Nova venda!*",
      "",
      `Pedido *#${info.orderNumber}*`,
      `Cliente: ${info.customerName}`,
      `Total: *${formatBRL(info.subtotal)}* (${itens})`,
      originLine,
      "",
      "Confira no painel, em Pedidos. 🙂",
    ].join("\n");

    await sendText(cfg.evolutionInstance, target, msg);
  } catch (e) {
    console.error("[saleAlert] notifyNewSale", e);
  }
}
