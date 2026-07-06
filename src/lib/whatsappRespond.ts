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

/**
 * Quebra a resposta da IA em partes para enviar como mensagens separadas (cara de
 * humano mandando vários balões, um "digitando…" antes de cada um). Quebra nos
 * parágrafos (linhas em branco) e, se um parágrafo ficar muito longo, divide por
 * frases. Linhas com link (URL) ficam intactas, junto do texto do parágrafo.
 */
export function splitReplyIntoParts(text: string): string[] {
  const MAX = 300; // acima disso, tenta quebrar o parágrafo por frases.
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  const parts: string[] = [];
  for (const p of paragraphs) {
    // Parágrafo curto, ou com link (não quebra o link do resto) → manda inteiro.
    if (p.length <= MAX || /https?:\/\//i.test(p)) {
      parts.push(p);
      continue;
    }
    // Parágrafo longo sem link: agrupa frases até ~MAX por balão.
    const sentences = p.match(/[^.!?…]+[.!?…]*\s*/g) ?? [p];
    let buf = "";
    for (const s of sentences) {
      if (buf && (buf + s).length > MAX) {
        parts.push(buf.trim());
        buf = s;
      } else {
        buf += s;
      }
    }
    if (buf.trim()) parts.push(buf.trim());
  }

  return parts.length ? parts : [text.trim()];
}

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
  // Loja só online: sem endereço/pino/foto/vídeo (a IA avisa que é só online).
  const onlineOnly = cfg.aiOnlineOnly;
  const storeAddress = onlineOnly ? "" : cfg.aiLocationAddress.trim() || pickupAddress;
  const hasLocationPin =
    !onlineOnly && cfg.aiLocationLat != null && cfg.aiLocationLng != null;
  const hasStorePhoto = !onlineOnly && Boolean(cfg.aiStorePhotoUrl);
  const hasStoreVideo = !onlineOnly && Boolean(cfg.aiStoreVideoUrl);

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
    onlineOnly,
    hasLocationPin,
    hasStorePhoto,
    hasStoreVideo,
  });

  const reply = await generateReply(systemPrompt, contextHistory, combinedUserText);
  if (!reply) return false;

  const { text: replyText, sendLocation: wantLocation, sendPhoto, sendVideo } =
    parseReplyDirectives(reply);
  let sent = false;
  if (replyText) {
    // Manda em partes (vários balões), com "digitando…" antes de cada uma, para
    // parecer um atendente humano digitando aos poucos. Cada parte também vira uma
    // linha no histórico (importante p/ a detecção de eco do handoff no webhook).
    const parts = splitReplyIntoParts(replyText);
    for (const part of parts) {
      // "Digitando…" proporcional ao tamanho da parte (entre 1,2s e 5s).
      const typingMs = Math.min(Math.max(part.length * 45, 1200), 5000);
      await sendText(cfg.evolutionInstance, customerPhone, part, typingMs);
      await appendMessage(admin, cfg.storeId, customerPhone, "assistant", part);
    }
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
  if (sendVideo && hasStoreVideo) {
    try {
      await sendMedia(cfg.evolutionInstance, customerPhone, {
        url: cfg.aiStoreVideoUrl,
        mediatype: "video",
      });
      sent = true;
    } catch (e) {
      console.error("[whatsappRespond] sendMedia video", e);
    }
  }
  return sent;
}
