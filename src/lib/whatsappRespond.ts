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
import {
  consumeTokens,
  hasAiBalance,
  markEmptyWarned,
} from "@/lib/aiCredits";

type AnyObj = Record<string, unknown>;

/**
 * Avisa o DONO da loja (no próprio WhatsApp conectado) quando os créditos de IA
 * estão acabando ou acabaram. Não lança: se o WhatsApp não estiver conectado, só
 * ignora. Nunca vai para o cliente — é uma mensagem interna para o lojista.
 */
async function notifyOwnerCredits(
  cfg: WhatsAppConfig,
  kind: "empty" | "low",
  conversationsLeft: number
): Promise<void> {
  if (cfg.connectionStatus !== "connected" || !cfg.connectedNumber) return;
  const msg =
    kind === "empty"
      ? [
          "⚠️ *Créditos de IA esgotados*",
          "",
          "Sua IA parou de atender os clientes automaticamente porque o saldo de conversas acabou.",
          "",
          "Recarregue no painel (Créditos da IA) para a IA voltar a responder. 🙂",
        ].join("\n")
      : [
          "⏳ *Seus créditos de IA estão acabando*",
          "",
          `Restam cerca de ${conversationsLeft} conversa${conversationsLeft === 1 ? "" : "s"}.`,
          "",
          "Recarregue no painel (Créditos da IA) para a IA não parar de atender. 🙂",
        ].join("\n");
  try {
    await sendText(cfg.evolutionInstance, cfg.connectedNumber, msg);
  } catch (e) {
    console.error("[whatsappRespond] notifyOwnerCredits", e);
  }
}

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
    .select("name, slug, logo, storefront")
    .eq("id", cfg.storeId)
    .maybeSingle();
  if (!store?.slug) return false;

  const storeName = typeof store.name === "string" ? store.name : "Loja";
  const sf = storefrontFromDb(store.storefront);
  const pickupAddress = sf.pickupAddress;
  const pickupInstructions = sf.pickupInstructions;
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

  // Tem produto = a IA pode anexar o catálogo em PDF.
  const hasCatalogPdf = (productRows?.length ?? 0) > 0;

  // Pix: a IA só oferece/envia a chave se a loja preencheu a chave E ativou o
  // envio pela IA no painel. Sem chave, nunca envia (e o prompt proíbe inventar).
  const pixKey = sf.pixKey.trim();
  const pixEnabled = sf.aiSendPixOnCheckout && Boolean(pixKey);

  // Loja sem controle de estoque: a IA não deve dizer "sem estoque" (trata tudo
  // como disponível, igual à loja pública). Só afeta o texto do catálogo no prompt.
  let products = mapProducts((productRows ?? []) as AnyObj[]);
  if (!sf.stockControlEnabled) {
    products = products.map((p) => ({ ...p, stock: p.stock > 0 ? p.stock : 999999 }));
  }

  // Base pública do app (o cron não tem request, então depende do APP_BASE_URL;
  // cai no VERCEL_URL como último recurso para nunca montar um link relativo/quebrado).
  const baseUrl =
    process.env.APP_BASE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");
  const storeUrl = `${baseUrl.replace(/\/+$/, "")}/loja/${store.slug}`;

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
  // Cliente pediu o catálogo de forma explícita? Serve de gatilho determinístico
  // para o PDF (a IA nem sempre emite o marcador [[ENVIAR_CATALOGO]]).
  const customerWantsCatalog =
    /\bcat[aá]logos?\b|lista de produtos|\bpdf\b/i.test(combinedUserText);

  // Motor de créditos: sem saldo, a IA NÃO responde ao cliente e o dono é avisado
  // uma vez (Opção A). O aviso vai para o WhatsApp da própria loja, nunca ao cliente.
  const balance = await hasAiBalance(admin, cfg.storeId);
  if (!balance.ok) {
    if (!balance.state.emptyWarnedAt) {
      await notifyOwnerCredits(cfg, "empty", 0);
      await markEmptyWarned(admin, cfg.storeId);
    }
    return false;
  }

  const systemPrompt = buildSystemPrompt({
    storeName,
    slug: String(store.slug),
    faq: cfg.faq,
    aiName: cfg.aiName,
    aiTone: cfg.aiTone,
    products,
    baseUrl,
    isFirstContact,
    storeAddress,
    onlineOnly,
    hasLocationPin,
    hasStorePhoto,
    hasStoreVideo,
    pickupAddress,
    pickupInstructions,
    hasCatalogPdf,
    hasPix: pixEnabled,
  });

  const reply = await generateReply(systemPrompt, contextHistory, combinedUserText);
  if (!reply) return false;

  const {
    text: replyText,
    sendLocation: wantLocation,
    sendPhoto,
    sendVideo,
    sendCatalog,
    sendPix,
  } = parseReplyDirectives(reply.text);
  // Rede de segurança do link: o gpt-4o-mini às vezes ANUNCIA o link ("segue o
  // link", "confira o catálogo") mas esquece de colar a URL (o cliente recebe só a
  // promessa). Se o texto fala de link/catálogo e não tem nenhuma URL, anexa a URL
  // da loja como bloco próprio (vira um balão com prévia rica). Não depende da IA.
  let finalText = replyText;
  const mentionsLink = /\b(link|cat[aá]logo)\b/i.test(finalText);
  const hasUrl = /https?:\/\//i.test(finalText);
  if (finalText && baseUrl && (mentionsLink || sendCatalog || customerWantsCatalog) && !hasUrl) {
    finalText = `${finalText}\n\n${storeUrl}`;
  }

  let sent = false;
  if (finalText) {
    // Manda em partes (vários balões), com "digitando…" antes de cada uma, para
    // parecer um atendente humano digitando aos poucos. Cada parte também vira uma
    // linha no histórico (importante p/ a detecção de eco do handoff no webhook).
    // Cada balão é isolado num try/catch: se um falhar, os demais (e os anexos de
    // localização/foto/vídeo/catálogo abaixo) ainda saem, sem abortar a resposta.
    const parts = splitReplyIntoParts(finalText);
    for (const part of parts) {
      // "Digitando…" proporcional ao tamanho da parte (entre 1,2s e 5s).
      const typingMs = Math.min(Math.max(part.length * 45, 1200), 5000);
      try {
        await sendText(cfg.evolutionInstance, customerPhone, part, typingMs);
        await appendMessage(admin, cfg.storeId, customerPhone, "assistant", part);
        sent = true;
      } catch (e) {
        console.error("[whatsappRespond] sendText parte", e);
      }
    }
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
  if ((sendCatalog || customerWantsCatalog) && hasCatalogPdf) {
    try {
      // Gera/reaproveita o PDF do catálogo no bucket e anexa como documento. Import
      // dinâmico p/ não puxar o @react-pdf (pesado) nas demais respostas da IA.
      const { ensureCatalogPdfUrl } = await import("@/lib/catalogPdf");
      const url = await ensureCatalogPdfUrl(admin, {
        storeId: cfg.storeId,
        slug: String(store.slug),
        storeName,
        logoUrl: typeof store.logo === "string" ? store.logo : null,
        baseUrl,
      });
      if (url) {
        await sendMedia(cfg.evolutionInstance, customerPhone, {
          url,
          mediatype: "document",
          fileName: `Catálogo - ${storeName}.pdf`,
          mimetype: "application/pdf",
        });
        sent = true;
      }
    } catch (e) {
      console.error("[whatsappRespond] sendCatalog", e);
    }
  }
  // Chave Pix (fechamento do pedido): enviada de forma DETERMINÍSTICA a partir da
  // chave cadastrada — a IA nunca escreve a chave (só emite o marcador), então não
  // há como inventar. A chave vai numa linha própria para o cliente copiar fácil.
  if (sendPix && pixEnabled) {
    try {
      const pixName = sf.pixName.trim();
      const pixMsg = [
        "Pode pagar via Pix com esta chave 🔑",
        "",
        pixKey,
        pixName ? `Titular: ${pixName}` : "",
        "",
        "Assim que fizer o Pix, é só me enviar o comprovante 😊",
      ]
        .filter((l) => l !== null && l !== undefined)
        .join("\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
      await sendText(cfg.evolutionInstance, customerPhone, pixMsg, 1200);
      await appendMessage(admin, cfg.storeId, customerPhone, "assistant", pixMsg);
      sent = true;
    } catch (e) {
      console.error("[whatsappRespond] sendPix", e);
    }
  }

  // Desconta os tokens realmente gastos nesta resposta (mesmo se algum balão falhou
  // no envio — o custo com a OpenAI já ocorreu) e avisa o dono se o saldo cruzou os
  // limites de "acabando" ou "esgotado".
  if (reply.tokens > 0) {
    try {
      const consumed = await consumeTokens(admin, cfg.storeId, reply.tokens);
      if (consumed.justEmptied) {
        await notifyOwnerCredits(cfg, "empty", 0);
      } else if (consumed.justLow) {
        await notifyOwnerCredits(cfg, "low", consumed.state.conversationsLeft);
      }
    } catch (e) {
      console.error("[whatsappRespond] consumeTokens", e);
    }
  }

  return sent;
}
