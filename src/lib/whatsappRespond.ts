/**
 * Gera e envia a resposta do atendente de IA para um cliente, juntando todas as
 * mensagens do "lote" (as que chegaram desde a última fala da IA). Usado pelo
 * cron de debounce ([/api/whatsapp/debounce]) — o webhook só grava e agenda.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  appendMessage,
  findCustomerName,
  getRecentHistory,
  setContactName,
  type ChatTurn,
  type WhatsAppConfig,
} from "@/lib/whatsappConfig";
import { sendLocation, sendMedia, sendText } from "@/lib/evolution";
import {
  storefrontFromDb,
  describeMinOrder,
  describeAttendance,
  enabledShippingModeIds,
} from "@/lib/storefront";
import { isShippingModeId, shippingModeLabel } from "@/lib/shippingModes";
import { optionArrayFromDb } from "@/lib/productOptions";
import { createStoreOrder } from "@/lib/orders.server";
import type { OrderLineInput } from "@/lib/orderLines";
import {
  type AiOrderDraft,
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
  kind: "empty" | "low" | "no_ai_plan",
  conversationsLeft: number
): Promise<void> {
  if (cfg.connectionStatus !== "connected" || !cfg.connectedNumber) return;
  const msg =
    kind === "no_ai_plan"
      ? [
          "ℹ️ *Seu plano não inclui a IA*",
          "",
          "Um cliente falou com você no WhatsApp e a IA não respondeu, porque o seu plano atual é o *Sem IA*.",
          "",
          "Você continua atendendo normalmente pelo painel (Atendimento). Para a IA responder sozinha, faça o upgrade em Planos. 🙂",
        ].join("\n")
      : kind === "empty"
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

/** Normaliza para comparação: minúsculas, sem acento, espaços colapsados. */
function normalizeName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

type OrderProductRow = {
  id: string;
  name: string;
  colors: unknown;
  sizes: unknown;
};

/** Acha a melhor opção (cor/tamanho) do catálogo que casa com o que a IA passou. */
function matchOption(given: string, options: string[]): string {
  const g = normalizeName(given);
  if (!g) return "";
  const exact = options.find((o) => normalizeName(o) === g);
  if (exact) return exact;
  const partial = options.find(
    (o) => normalizeName(o).includes(g) || g.includes(normalizeName(o))
  );
  return partial ?? given.trim();
}

/**
 * Registra no painel o pedido que a IA fechou pela conversa/PDF. Resolve os nomes
 * dos produtos contra o catálogo da loja (nome exato, depois parcial) e cria o
 * pedido pela mesma via do checkout (`createStoreOrder`). Devolve o número do
 * pedido gravado, ou null se não deu para registrar (nome de produto não
 * encontrado, sem forma de envio, sem nome do cliente, duplicado etc.) — nesse
 * caso a conversa segue normal, só não gera pedido. Nunca lança.
 */
async function registerConversationOrder(
  admin: SupabaseClient,
  args: {
    storeId: string;
    customerPhone: string;
    customerName: string;
    draft: AiOrderDraft;
    enabledShipping: string[];
  }
): Promise<number | null> {
  const { storeId, customerPhone, customerName, draft, enabledShipping } = args;
  try {
    const name = customerName.trim();
    if (name.length < 2) return null; // sem nome não registra (a IA deve coletar)

    // Forma de envio: usa a informada; se vazia e só houver uma habilitada, assume-a.
    let shippingMode = isShippingModeId(draft.envio ?? "") ? String(draft.envio) : "";
    if (!shippingMode && enabledShipping.length === 1) shippingMode = enabledShipping[0];
    if (!isShippingModeId(shippingMode)) return null;

    // Carrega o catálogo (id/nome/cores/tamanhos) para resolver os nomes.
    const { data: rows } = await admin
      .from("products")
      .select("id, name, colors, sizes")
      .eq("store_id", storeId)
      .eq("active", true)
      .limit(300);
    const products = (rows ?? []) as OrderProductRow[];
    if (products.length === 0) return null;

    const byNorm = new Map<string, OrderProductRow>();
    for (const p of products) {
      const key = normalizeName(String(p.name ?? ""));
      if (key && !byNorm.has(key)) byNorm.set(key, p);
    }
    const findProduct = (nome: string): OrderProductRow | null => {
      const g = normalizeName(nome);
      if (!g) return null;
      const exact = byNorm.get(g);
      if (exact) return exact;
      // Parcial: o nome do produto contém o texto (ou vice-versa).
      const partial = products.find((p) => {
        const pn = normalizeName(String(p.name ?? ""));
        return pn.includes(g) || g.includes(pn);
      });
      return partial ?? null;
    };

    const lines: OrderLineInput[] = [];
    for (const it of draft.itens) {
      const p = findProduct(it.nome);
      if (!p) return null; // item não reconhecido → não registra pedido incompleto
      const colors = optionArrayFromDb(p.colors);
      const sizes = optionArrayFromDb(p.sizes);
      lines.push({
        productId: p.id,
        color: it.cor ? matchOption(it.cor, colors) : "",
        size: it.tamanho ? matchOption(it.tamanho, sizes) : "",
        quantity: Math.max(1, Math.floor(Number(it.qtd) || 1)),
      });
    }
    if (lines.length === 0) return null;

    // Dedup: se já houve um pedido deste cliente há pouco (a IA pode reemitir o
    // bloco), não cria de novo.
    const { data: recent } = await admin
      .from("orders")
      .select("created_at")
      .eq("store_id", storeId)
      .eq("customer_phone", customerPhone)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (recent?.created_at) {
      const ageMs = Date.now() - new Date(String(recent.created_at)).getTime();
      if (ageMs >= 0 && ageMs < 3 * 60 * 1000) return null; // < 3 min = provável duplicado
    }

    const result = await createStoreOrder(admin, {
      storeId,
      customerName: name,
      customerPhone,
      lines,
      shippingMode,
      paymentMethod: draft.pagamento ?? "",
      customerAddress: draft.endereco ?? "",
      excursionName: draft.excursao ?? "",
      carrierName: draft.transportadora ?? "",
      origin: "ia",
    });
    if (!result.ok) {
      console.warn("[whatsappRespond] registerConversationOrder", result.error);
      return null;
    }
    return result.orderNumber;
  } catch (e) {
    console.error("[whatsappRespond] registerConversationOrder", e);
    return null;
  }
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
  // Retirada só é oferecida pela IA se a loja habilitou essa forma de envio.
  const pickupAddress = sf.shipRetiradaEnabled ? sf.pickupAddress : "";
  const pickupInstructions = sf.shipRetiradaEnabled ? sf.pickupInstructions : "";

  // Formas de envio/retirada e de pagamento que a loja aceita (para a IA só
  // oferecer o que o lojista habilitou em Atendimento → Configurações da IA).
  const shippingModes = enabledShippingModeIds(sf)
    .map((id) => shippingModeLabel(id))
    .filter((l): l is string => Boolean(l));
  const paymentModes: string[] = [];
  if (sf.checkoutPixEnabled) paymentModes.push("Pix");
  if (sf.checkoutCashEnabled) paymentModes.push("Dinheiro na entrega");
  if (sf.checkoutCardEnabled) paymentModes.push("Cartão na entrega");
  if (sf.checkoutMercadoPagoEnabled)
    paymentModes.push("Mercado Pago (pagamento online)");
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

  // Pedido mínimo da loja (valor e/ou quantidade): a IA informa quando o cliente
  // pergunta. Vazio = sem mínimo.
  const minOrder = describeMinOrder(sf);

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
  // Nome salvo (cliente que já comprou antes) — a IA saúda pelo primeiro nome.
  const customerName = await findCustomerName(admin, cfg.storeId, customerPhone);
  // Cliente pediu o catálogo de forma explícita? Serve de gatilho determinístico
  // para o PDF (a IA nem sempre emite o marcador [[ENVIAR_CATALOGO]]).
  const customerWantsCatalog =
    /\bcat[aá]logos?\b|lista de produtos|\bpdf\b/i.test(combinedUserText);

  // Plano + créditos: no "Sem IA", ou sem saldo, a IA NÃO responde ao cliente e o
  // dono é avisado uma vez (Opção A) — no WhatsApp da própria loja, nunca ao cliente.
  // O `empty_warned_at` serve de trava dos dois casos (um aviso por vez, sem spam).
  const balance = await hasAiBalance(admin, cfg.storeId);
  if (!balance.ok) {
    if (!balance.state.emptyWarnedAt) {
      await notifyOwnerCredits(cfg, balance.reason === "no_ai_plan" ? "no_ai_plan" : "empty", 0);
      await markEmptyWarned(admin, cfg.storeId);
    }
    return false;
  }

  const systemPrompt = buildSystemPrompt({
    storeName,
    slug: String(store.slug),
    faq: cfg.faq,
    aiName: cfg.aiName,
    products,
    baseUrl,
    isFirstContact,
    storeAddress,
    onlineOnly,
    onlineCity: onlineOnly ? sf.onlineCity : "",
    hasLocationPin,
    hasStorePhoto,
    hasStoreVideo,
    pickupAddress,
    pickupInstructions,
    hasCatalogPdf,
    hasPix: pixEnabled,
    minOrder,
    minOrderMessage: sf.minOrderMessage,
    saleMode: sf.saleMode,
    attendance: describeAttendance(sf),
    shippingModes,
    paymentMethods: paymentModes,
    customerName,
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
    customerName: identifiedName,
    orderDraft,
  } = parseReplyDirectives(reply.text);

  // Nome do cliente conhecido nesta conversa (salvo antes OU identificado agora
  // pela IA). Usado para salvar o contato e para registrar o pedido.
  const knownName = (customerName || identifiedName).trim();

  // Salva o nome do cliente quando a IA o identificou (apresentação ou pedido
  // vindo do site) e ainda não havia um nome salvo — para saudar pelo nome nas
  // próximas conversas. Não sobrescreve um nome já existente (ex.: renomeado pelo
  // lojista ou de um pedido anterior). Nunca lança: só loga em caso de erro.
  if (identifiedName && !customerName) {
    try {
      await setContactName(admin, cfg.storeId, customerPhone, identifiedName);
    } catch (e) {
      console.error("[whatsappRespond] setContactName", e);
    }
  }

  // Registra no painel o pedido que a IA fechou pela conversa/PDF (bloco
  // [[PEDIDO]]). Resolve os nomes contra o catálogo e cria o pedido pela mesma via
  // do checkout. Em caso de sucesso, confirma ao cliente com o número do pedido.
  let orderConfirmationMsg = "";
  if (orderDraft) {
    const orderNumber = await registerConversationOrder(admin, {
      storeId: cfg.storeId,
      customerPhone,
      customerName: knownName,
      draft: orderDraft,
      enabledShipping: enabledShippingModeIds(sf),
    });
    if (orderNumber != null) {
      orderConfirmationMsg = `Prontinho! Seu pedido foi registrado ✅\nNúmero do pedido: #${orderNumber}`;
    }
  }

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
  // Confirmação do pedido registrado (balão próprio, ao final).
  if (orderConfirmationMsg) {
    finalText = finalText
      ? `${finalText}\n\n${orderConfirmationMsg}`
      : orderConfirmationMsg;
  }

  // O catálogo em PDF acompanha o LINK da loja como opção a mais: sempre que esta
  // resposta manda o link, anexa o PDF também. Trava para não reenviar o PDF a cada
  // link — se o cliente já recebeu o link antes nesta conversa, não reanexa (a não
  // ser que ele peça o catálogo explicitamente, tratado por customerWantsCatalog).
  const linkSentNow = Boolean(baseUrl) && finalText.includes(storeUrl);
  const linkSentBefore = full.some(
    (t) => t.role === "assistant" && t.content.includes(storeUrl)
  );
  const attachCatalog =
    sendCatalog || customerWantsCatalog || (linkSentNow && !linkSentBefore);

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
  if (attachCatalog && hasCatalogPdf) {
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
      const consumed = await consumeTokens(admin, cfg.storeId, reply.tokens, {
        customerPhone,
        kind: "reply",
      });
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
