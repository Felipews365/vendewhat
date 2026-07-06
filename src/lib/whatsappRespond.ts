/**
 * Gera e envia a resposta do atendente de IA para um cliente, juntando todas as
 * mensagens do "lote" (as que chegaram desde a última fala da IA). Usado pelo
 * cron de debounce ([/api/whatsapp/debounce]) — o webhook só grava e agenda.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  appendMessage,
  getRecentHistory,
  type ChatTurn,
  type WhatsAppConfig,
} from "@/lib/whatsappConfig";
import { sendLocation, sendMedia, sendText } from "@/lib/evolution";
import { storefrontFromDb } from "@/lib/storefront";
import {
  type AttendantProduct,
  buildSystemPrompt,
  generateReply,
  parseReplyDirectives,
} from "@/lib/ai/attendant";

type AnyObj = Record<string, unknown>;

function mapProducts(rows: AnyObj[]): AttendantProduct[] {
  return rows.map((row) => {
    const price =
      typeof row.price === "number"
        ? row.price
        : parseFloat(String(row.price ?? 0)) || 0;
    const compare =
      row.compare_at_price == null
        ? null
        : typeof row.compare_at_price === "number"
        ? row.compare_at_price
        : parseFloat(String(row.compare_at_price)) || null;
    return {
      name: typeof row.name === "string" ? row.name : "Produto",
      price,
      stock: typeof row.stock === "number" ? row.stock : 0,
      description: typeof row.description === "string" ? row.description : null,
      category: typeof row.category === "string" ? row.category : null,
      isPromotion: row.is_promotion === true,
      compareAtPrice: compare,
    };
  });
}

/**
 * Responde ao cliente com base no histórico atual da conversa. Junta as mensagens
 * do cliente posteriores à última resposta da IA (o lote) num único prompt.
 * Devolve true se enviou alguma resposta.
 */
export async function respondToCustomer(
  admin: SupabaseClient,
  cfg: WhatsAppConfig,
  customerPhone: string
): Promise<boolean> {
  const { data: store } = await admin
    .from("stores")
    .select("name, slug, storefront")
    .eq("id", cfg.storeId)
    .maybeSingle();
  if (!store?.slug) return false;

  const storeName = typeof store.name === "string" ? store.name : "Loja";
  const pickupAddress = storefrontFromDb(store.storefront).pickupAddress;
  const storeAddress = cfg.aiLocationAddress.trim() || pickupAddress;
  const hasLocationPin = cfg.aiLocationLat != null && cfg.aiLocationLng != null;
  const hasStorePhoto = Boolean(cfg.aiStorePhotoUrl);

  const { data: productRows } = await admin
    .from("products")
    .select("name, price, stock, description, category, is_promotion, compare_at_price")
    .eq("store_id", cfg.storeId)
    .eq("active", true)
    .order("created_at", { ascending: false })
    .limit(60);

  // Histórico + lote: as mensagens do cliente após a última resposta da IA são o
  // "lote" (chegaram juntas); o que veio antes é o contexto da conversa.
  const full = await getRecentHistory(admin, cfg.storeId, customerPhone, 20);
  let splitIdx = full.length;
  for (let i = full.length - 1; i >= 0; i--) {
    if (full[i].role === "assistant") break;
    splitIdx = i;
  }
  const contextHistory: ChatTurn[] = full.slice(0, splitIdx);
  const batch = full.slice(splitIdx).filter((t) => t.role === "user");
  const combinedUserText = batch.map((t) => t.content).join("\n").trim();
  if (!combinedUserText) return false; // nada do cliente para responder
  // Primeiro contato = a IA ainda não falou nada nesta conversa.
  const isFirstContact = !full.some((t) => t.role === "assistant");

  const systemPrompt = buildSystemPrompt({
    storeName,
    slug: String(store.slug),
    faq: cfg.faq,
    aiName: cfg.aiName,
    aiTone: cfg.aiTone,
    products: mapProducts((productRows ?? []) as AnyObj[]),
    baseUrl: process.env.APP_BASE_URL || "",
    isFirstContact,
    storeAddress,
    hasLocationPin,
    hasStorePhoto,
  });

  const reply = await generateReply(systemPrompt, contextHistory, combinedUserText);
  if (!reply) return false;

  const { text: replyText, sendLocation: wantLocation, sendPhoto } =
    parseReplyDirectives(reply);
  let sent = false;
  if (replyText) {
    // "Digitando…" proporcional ao tamanho da resposta (entre 1,5s e 8s).
    const typingMs = Math.min(Math.max(replyText.length * 45, 1500), 8000);
    await sendText(cfg.evolutionInstance, customerPhone, replyText, typingMs);
    await appendMessage(admin, cfg.storeId, customerPhone, "assistant", replyText);
    sent = true;
  }
  if (wantLocation && hasLocationPin) {
    try {
      await sendLocation(cfg.evolutionInstance, customerPhone, {
        latitude: cfg.aiLocationLat as number,
        longitude: cfg.aiLocationLng as number,
        name: storeName,
        address: storeAddress,
      });
      sent = true;
    } catch (e) {
      console.error("[whatsappRespond] sendLocation", e);
    }
  }
  if (sendPhoto && hasStorePhoto) {
    try {
      await sendMedia(cfg.evolutionInstance, customerPhone, {
        url: cfg.aiStorePhotoUrl,
      });
      sent = true;
    } catch (e) {
      console.error("[whatsappRespond] sendMedia", e);
    }
  }
  return sent;
}
