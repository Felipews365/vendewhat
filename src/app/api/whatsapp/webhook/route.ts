import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import {
  appendMessage,
  getConfigByInstance,
  getLastAssistantMessages,
  globalPauseActive,
  isCustomerPaused,
  messageExistsByWaId,
  schedulePendingReply,
  setCustomerPause,
  updateConnection,
} from "@/lib/whatsappConfig";
import { getMediaBase64, sendText } from "@/lib/evolution";
import { syncCrmCustomerFromMessage } from "@/lib/crm/customers";
import { isOptOutMessage, markOptOut } from "@/lib/crm/campaigns";
import {
  storeConversationMedia,
  mediaKindLabel,
  type WhatsAppMediaKind,
} from "@/lib/whatsappMedia";
import {
  describeImage,
  isAiConfigured,
  transcribeAudio,
} from "@/lib/ai/attendant";

export const runtime = "nodejs";
// Transcrição de áudio / descrição de imagem podem levar alguns segundos.
export const maxDuration = 30;

/**
 * Tempo de silêncio (segundos) antes de a IA responder. Serve para agrupar
 * mensagens que o cliente manda uma atrás da outra: cada nova mensagem reagenda
 * (empurra o respond_after), então só respondemos quando ele para de digitar.
 * Quem realmente responde é o cron [/api/whatsapp/debounce].
 */
const DEBOUNCE_SECONDS = 15;

/** Sempre responde 200 — a Evolution não deve reenviar por erro nosso de processamento. */
function ok() {
  return NextResponse.json({ ok: true });
}

type AnyObj = Record<string, unknown>;

function asObj(v: unknown): AnyObj | null {
  return v && typeof v === "object" ? (v as AnyObj) : null;
}

/** Desembrulha mensagens efêmeras / "ver uma vez" para chegar no conteúdo real. */
function unwrapMessage(message: AnyObj | null): AnyObj | null {
  if (!message) return null;
  const eph = asObj(message.ephemeralMessage);
  if (eph) return unwrapMessage(asObj(eph.message));
  const vo =
    asObj(message.viewOnceMessage) ??
    asObj(message.viewOnceMessageV2) ??
    asObj(message.viewOnceMessageV2Extension);
  if (vo) return unwrapMessage(asObj(vo.message));
  return message;
}

/** Extrai o texto de uma mensagem (conversation / extendedText / legenda de mídia). */
function extractText(message: AnyObj | null): string {
  if (!message) return "";
  if (typeof message.conversation === "string") return message.conversation;
  const ext = asObj(message.extendedTextMessage);
  if (ext && typeof ext.text === "string") return ext.text;
  for (const k of ["imageMessage", "videoMessage", "documentMessage"]) {
    const m = asObj(message[k]);
    if (m && typeof m.caption === "string" && m.caption) return m.caption;
  }
  return "";
}

/** Tipo de mídia da mensagem (o que o painel precisa saber para renderizar). */
type MediaKind = "none" | WhatsAppMediaKind;

function detectMediaKind(message: AnyObj | null): MediaKind {
  if (!message) return "none";
  if (asObj(message.imageMessage)) return "image";
  if (asObj(message.audioMessage)) return "audio";
  if (asObj(message.videoMessage)) return "video";
  if (asObj(message.stickerMessage)) return "sticker";
  if (asObj(message.locationMessage) || asObj(message.liveLocationMessage))
    return "location";
  if (
    asObj(message.documentMessage) ||
    asObj(message.documentWithCaptionMessage)
  )
    return "document";
  return "none";
}

/** Nome do arquivo de um documento (para o anexo aparecer nomeado no painel). */
function documentName(message: AnyObj | null): string {
  const doc =
    asObj(message?.documentMessage) ??
    asObj(asObj(message?.documentWithCaptionMessage)?.message)?.documentMessage;
  const d = asObj(doc);
  const name = d?.fileName ?? d?.title;
  return typeof name === "string" ? name : "";
}

/** Link do mapa a partir do pino recebido (o painel abre no Google Maps). */
function locationLink(message: AnyObj | null): string {
  const loc = asObj(message?.locationMessage) ?? asObj(message?.liveLocationMessage);
  const lat = Number(loc?.degreesLatitude);
  const lng = Number(loc?.degreesLongitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return "";
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

function toEvolutionState(state: unknown): "connected" | "connecting" | "disconnected" {
  if (state === "open") return "connected";
  if (state === "connecting") return "connecting";
  return "disconnected";
}

export async function POST(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token") ?? "";

  let body: AnyObj;
  try {
    body = (await req.json()) as AnyObj;
  } catch {
    return ok();
  }

  const instance = typeof body.instance === "string" ? body.instance : "";
  const event = String(body.event ?? "").toLowerCase();
  if (!instance) return ok();

  const admin = createAdminSupabase();
  if (!admin) return ok();

  const cfg = await getConfigByInstance(admin, instance);
  // Valida o segredo do webhook — ignora chamadas não reconhecidas.
  if (!cfg || cfg.webhookToken !== token) return ok();

  // Auto-corrige o número conectado da loja: a Evolution manda o dono da instância
  // em `sender` (JID) em cada evento. Se ainda não temos o número salvo, guardamos
  // agora — a vitrine usa esse número como contato real (não o telefone de cadastro).
  if (!cfg.connectedNumber && !event.includes("connection")) {
    // Só em eventos de mensagem (o de conexão não traz `sender`); receber
    // mensagem prova que está conectado, então gravamos status "connected".
    const senderDigits =
      typeof body.sender === "string" ? body.sender.replace(/\D/g, "") : "";
    if (senderDigits) {
      await updateConnection(admin, cfg.storeId, "connected", senderDigits);
      cfg.connectedNumber = senderDigits;
    }
  }

  // --- Atualização de conexão -------------------------------------------------
  if (event.includes("connection")) {
    const data = asObj(body.data);
    const state = toEvolutionState(data?.state);
    await updateConnection(admin, cfg.storeId, state);
    return ok();
  }

  // --- Mensagem recebida ------------------------------------------------------
  if (!event.includes("messages.upsert") && !event.includes("messages_upsert")) {
    return ok();
  }

  const rawData = asObj(body.data);
  const msg =
    rawData && Array.isArray(rawData.messages)
      ? asObj(rawData.messages[0])
      : rawData;
  if (!msg) return ok();

  const key = asObj(msg.key);
  if (!key) return ok();

  const remoteJid = typeof key.remoteJid === "string" ? key.remoteJid : "";
  if (!remoteJid || remoteJid.endsWith("@g.us")) return ok(); // ignora grupos

  const customerPhone = remoteJid.split("@")[0];
  const message = unwrapMessage(asObj(msg.message));
  const text = extractText(message).trim();

  const mediaKind = detectMediaKind(message);
  const waMessageId = typeof key.id === "string" ? key.id : "";

  /**
   * Baixa a mídia da Evolution e guarda no Storage, para o balão do painel
   * mostrar a foto/áudio/vídeo de verdade. Nunca lança — sem o arquivo, a
   * conversa segue só com o texto.
   */
  const saveMedia = async (): Promise<{ url: string; base64?: string; mimetype?: string }> => {
    if (mediaKind === "none" || mediaKind === "location") return { url: "" };
    const media = await getMediaBase64(cfg.evolutionInstance, msg);
    if (!media) return { url: "" };
    const url = await storeConversationMedia(admin, {
      storeId: cfg.storeId,
      customerPhone,
      messageId: waMessageId,
      base64: media.base64,
      mimetype: media.mimetype,
      kind: mediaKind,
    });
    return { url: url ?? "", base64: media.base64, mimetype: media.mimetype };
  };

  // --- Mensagem enviada pelo próprio número da loja ---------------------------
  // Pode ser (a) o ECO do que nós mandamos (IA ou painel) ou (b) o DONO
  // respondendo pelo celular. Só (b) entra no histórico e pausa a IA.
  if (key.fromMe === true) {
    // 1) O `key.id` já está gravado = mensagem nossa. É a única checagem que
    //    funciona para FOTO/PDF/LOCALIZAÇÃO — a comparação de texto abaixo nunca
    //    conseguiu distinguir mídia da IA de mídia do dono.
    if (waMessageId && (await messageExistsByWaId(admin, cfg.storeId, waMessageId))) {
      return ok();
    }
    // 2) Eco de TEXTO: cobre os envios em que a Evolution não devolveu o id.
    //    Janela de 8 porque a IA responde em vários balões, e cada um volta aqui.
    if (text) {
      const recentAi = await getLastAssistantMessages(
        admin,
        cfg.storeId,
        customerPhone,
        8
      );
      if (recentAi.some((c) => c.trim() === text)) return ok();
    }
    // 3) Mídia sem id conhecido: pode ser corrida (o eco chegou antes de a gente
    //    terminar de gravar o envio). Espera um instante e confere de novo, senão
    //    a IA se auto-pausaria ao mandar a localização/catálogo.
    if (waMessageId && mediaKind !== "none" && text === "") {
      await new Promise((r) => setTimeout(r, 1500));
      if (await messageExistsByWaId(admin, cfg.storeId, waMessageId)) return ok();
    }

    // Sem texto e sem mídia não é o dono "falando" (reação, enquete, edição…):
    // não vira balão vazio nem pausa a IA — igual ao comportamento de antes.
    const label = mediaKindLabel(mediaKind === "none" ? null : mediaKind);
    const content =
      text || (mediaKind === "location" ? locationLink(message) : "") || label;
    if (!content) return ok();

    // É o dono falando. Espelha no painel (com a mídia) e pausa a IA.
    try {
      const { url } = await saveMedia();
      await appendMessage(admin, cfg.storeId, customerPhone, "assistant", content, {
        waMessageId,
        sender: "owner",
        mediaType: mediaKind === "none" ? null : mediaKind,
        mediaUrl: url || (mediaKind === "location" ? locationLink(message) : ""),
        mediaName: mediaKind === "document" ? documentName(message) : null,
      });
    } catch (e) {
      console.error("[whatsapp/webhook] espelho do dono", e);
    }

    if (cfg.aiHandoffMinutes > 0) {
      const until = new Date(
        Date.now() + cfg.aiHandoffMinutes * 60_000
      ).toISOString();
      await setCustomerPause(admin, cfg.storeId, customerPhone, until, "handoff");
    }
    return ok();
  }

  // Nada que a gente saiba tratar e sem texto → ignora.
  if (!text && mediaKind === "none") return ok();

  // "SAIR" tira o cliente das CAMPANHAS — e só delas: o atendimento normal
  // continua (quem escreve SAIR não quer perder o suporte, quer parar a
  // promoção). Vem antes de agendar a resposta para a IA não emendar em cima.
  // Só encerra aqui quando o cliente REALMENTE saiu da base de campanhas; se
  // não for encontrado, segue o fluxo normal (pode ser alguém dizendo
  // "cancelar" no meio de um pedido) e a gravação acontece lá embaixo, uma vez.
  if (text && isOptOutMessage(text) && (await markOptOut(admin, cfg.storeId, customerPhone))) {
    await appendMessage(admin, cfg.storeId, customerPhone, "user", text, {
      waMessageId,
      sender: "customer",
    });
    const aviso =
      "Prontinho! Você não vai mais receber nossas promoções. 😊 Se precisar de alguma coisa, é só chamar aqui.";
    const sentId = await sendText(cfg.evolutionInstance, customerPhone, aviso, 1200);
    await appendMessage(admin, cfg.storeId, customerPhone, "assistant", aviso, {
      waMessageId: sentId,
      sender: "ai",
    });
    return ok();
  }

  console.log("[whatsapp/webhook] msg recebida", {
    store: cfg.storeId,
    from: customerPhone,
    kind: mediaKind === "none" ? "text" : mediaKind,
    aiEnabled: cfg.aiEnabled,
    aiConfigured: isAiConfigured(),
  });

  // A IA vai responder esta mensagem? A conversa é GRAVADA de qualquer jeito (a
  // aba Conversas é um espelho do WhatsApp: o lojista precisa ver o que o cliente
  // mandou mesmo com a IA desligada ou pausada). O que muda é só o agendamento da
  // resposta — e a transcrição/descrição, que só existem para dar contexto à IA e
  // custam dinheiro.
  let aiWillReply = true;
  if (!cfg.aiEnabled) {
    console.log("[whatsapp/webhook] sem resposta: IA desligada", cfg.storeId);
    aiWillReply = false;
  } else if (!isAiConfigured()) {
    console.log("[whatsapp/webhook] sem resposta: OPENAI_API_KEY ausente no servidor");
    aiWillReply = false;
  } else if (globalPauseActive(cfg)) {
    console.log("[whatsapp/webhook] sem resposta: pausa global", cfg.storeId);
    aiWillReply = false;
  } else if (await isCustomerPaused(admin, cfg.storeId, customerPhone)) {
    console.log("[whatsapp/webhook] sem resposta: cliente pausado", customerPhone);
    aiWillReply = false;
  }
  // Figurinha não merece uma resposta da IA (nem custa transcrição) — mas aparece
  // no painel como no WhatsApp.
  if (mediaKind === "sticker") aiWillReply = false;

  try {
    // --- Arquivo da mídia -----------------------------------------------------
    // Uma única ida à Evolution serve para as duas coisas: guardar o arquivo (o
    // painel mostra a foto/áudio de verdade) e alimentar Whisper/visão.
    const saved = await saveMedia();
    let mediaUrl = saved.url;

    // --- Texto que a IA enxerga ----------------------------------------------
    let storedText = text;

    if (mediaKind === "audio") {
      const transcript =
        aiWillReply && saved.base64
          ? await transcribeAudio(saved.base64, saved.mimetype ?? "")
          : null;
      if (aiWillReply && !transcript) {
        // Não deu para entender o áudio — pede para escrever, sem agendar resposta.
        const aviso =
          "Recebi seu áudio, mas não consegui ouvir direito 😅 Pode me mandar por escrito, por favor?";
        const sentId = await sendText(cfg.evolutionInstance, customerPhone, aviso, 1500);
        await appendMessage(admin, cfg.storeId, customerPhone, "user", "[áudio]", {
          waMessageId,
          sender: "customer",
          mediaType: "audio",
          mediaUrl,
        });
        await appendMessage(admin, cfg.storeId, customerPhone, "assistant", aviso, {
          waMessageId: sentId,
          sender: "ai",
        });
        return ok();
      }
      storedText = transcript ?? "[Áudio enviado pelo cliente]";
    } else if (mediaKind === "image") {
      const dataUrl =
        aiWillReply && saved.base64
          ? `data:${saved.mimetype || "image/jpeg"};base64,${saved.base64}`
          : null;
      const desc = dataUrl ? await describeImage(dataUrl, text) : null;
      // Guarda a legenda + a descrição da foto para o atendente ter contexto.
      storedText = [
        text,
        desc ? `[Foto enviada pelo cliente — ${desc}]` : "[Foto enviada pelo cliente]",
      ]
        .filter(Boolean)
        .join("\n");
    } else if (mediaKind === "video") {
      storedText = [text, "[Vídeo enviado pelo cliente]"].filter(Boolean).join("\n");
    } else if (mediaKind === "document") {
      const name = documentName(message);
      storedText = [text, `[Documento enviado pelo cliente${name ? `: ${name}` : ""}]`]
        .filter(Boolean)
        .join("\n");
    } else if (mediaKind === "sticker") {
      storedText = "[Figurinha enviada pelo cliente]";
    } else if (mediaKind === "location") {
      const link = locationLink(message);
      mediaUrl = link;
      storedText = [text, `[Localização enviada pelo cliente${link ? ` — ${link}` : ""}]`]
        .filter(Boolean)
        .join("\n");
    }

    // Grava a mensagem do cliente (sempre) e, quando cabe, AGENDA a resposta
    // (debounce) — quem responde é o cron.
    await appendMessage(admin, cfg.storeId, customerPhone, "user", storedText, {
      waMessageId,
      sender: "customer",
      mediaType: mediaKind === "none" ? null : mediaKind,
      mediaUrl,
      mediaName: mediaKind === "document" ? documentName(message) : null,
    });
    // CRM: quem conversa também é cliente. Guarda aqui porque `whatsapp_messages`
    // é apagada em 30 dias — sem isto, quem nunca comprou sumiria do sistema.
    // Nunca lança (o helper engole o próprio erro), então não atrasa a resposta.
    await syncCrmCustomerFromMessage(admin, cfg.storeId, customerPhone);
    if (aiWillReply) {
      await schedulePendingReply(
        admin,
        cfg.storeId,
        customerPhone,
        DEBOUNCE_SECONDS
      );
    }
  } catch (err) {
    console.error("[whatsapp/webhook]", err);
  }

  return ok();
}
