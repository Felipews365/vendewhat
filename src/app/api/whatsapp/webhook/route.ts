import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import {
  appendMessage,
  getConfigByInstance,
  getLastAssistantMessages,
  globalPauseActive,
  isCustomerPaused,
  schedulePendingReply,
  setCustomerPause,
  updateConnection,
} from "@/lib/whatsappConfig";
import { getMediaBase64, sendText } from "@/lib/evolution";
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
  const img = asObj(message.imageMessage);
  if (img && typeof img.caption === "string") return img.caption;
  return "";
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

  // Tipo de mídia (para tratar imagem/áudio além de texto).
  const imageMsg = asObj(message?.imageMessage);
  const audioMsg = asObj(message?.audioMessage);
  const mediaKind: "none" | "image" | "audio" = imageMsg
    ? "image"
    : audioMsg
    ? "audio"
    : "none";

  // Mensagem enviada pelo próprio número da loja.
  if (key.fromMe === true) {
    // Pode ser o eco da própria IA (ignora) ou o dono respondendo manualmente.
    // Quando é o dono, pausa a IA para esse cliente pelo tempo de "handoff".
    if (cfg.aiHandoffMinutes > 0) {
      // Áudio é sempre o dono falando: a IA só manda texto, foto, vídeo,
      // localização e PDF — nunca áudio.
      let ownerSpoke = mediaKind === "audio";
      if (!ownerSpoke && text) {
        // Janela maior porque a IA agora responde em várias partes (vários balões);
        // cada uma volta como fromMe e precisa ser reconhecida como eco (não handoff).
        const recentAi = await getLastAssistantMessages(
          admin,
          cfg.storeId,
          customerPhone,
          8
        );
        ownerSpoke = !recentAi.some((c) => c.trim() === text);
      }
      if (ownerSpoke) {
        const until = new Date(
          Date.now() + cfg.aiHandoffMinutes * 60_000
        ).toISOString();
        await setCustomerPause(admin, cfg.storeId, customerPhone, until, "handoff");
      }
    }
    return ok();
  }

  // Nada que a gente saiba tratar (sticker, contato, etc.) e sem texto → ignora.
  if (!text && mediaKind === "none") return ok();

  console.log("[whatsapp/webhook] msg recebida", {
    store: cfg.storeId,
    from: customerPhone,
    kind: mediaKind === "none" ? "text" : mediaKind,
    aiEnabled: cfg.aiEnabled,
    aiConfigured: isAiConfigured(),
  });

  // Se a IA está desligada, não responde (mas a loja ainda recebe a mensagem normalmente).
  if (!cfg.aiEnabled) {
    console.log("[whatsapp/webhook] ignorado: IA desligada", cfg.storeId);
    return ok();
  }
  if (!isAiConfigured()) {
    console.log("[whatsapp/webhook] ignorado: OPENAI_API_KEY ausente no servidor");
    return ok();
  }

  // Atendimento pausado — globalmente ou só para este cliente.
  if (globalPauseActive(cfg)) {
    console.log("[whatsapp/webhook] ignorado: pausa global", cfg.storeId);
    return ok();
  }
  if (await isCustomerPaused(admin, cfg.storeId, customerPhone)) {
    console.log("[whatsapp/webhook] ignorado: cliente pausado", customerPhone);
    return ok();
  }

  try {
    // --- Normaliza o conteúdo recebido (texto / áudio transcrito / imagem) ----
    // A mídia é resolvida aqui (temos acesso fácil à Evolution); no histórico
    // fica só texto, então o cron que responde trabalha apenas com texto.
    let storedText = text;

    if (mediaKind === "audio") {
      const media = await getMediaBase64(cfg.evolutionInstance, msg);
      const transcript = media
        ? await transcribeAudio(media.base64, media.mimetype)
        : null;
      if (!transcript) {
        // Não deu para entender o áudio — pede para escrever, sem agendar resposta.
        const aviso =
          "Recebi seu áudio, mas não consegui ouvir direito 😅 Pode me mandar por escrito, por favor?";
        await sendText(cfg.evolutionInstance, customerPhone, aviso, 1500);
        await appendMessage(admin, cfg.storeId, customerPhone, "user", "[áudio]");
        await appendMessage(admin, cfg.storeId, customerPhone, "assistant", aviso);
        return ok();
      }
      storedText = transcript;
    } else if (mediaKind === "image") {
      const media = await getMediaBase64(cfg.evolutionInstance, msg);
      const dataUrl = media
        ? `data:${media.mimetype || "image/jpeg"};base64,${media.base64}`
        : null;
      const desc = dataUrl ? await describeImage(dataUrl, text) : null;
      // Guarda a legenda + a descrição da foto para o atendente ter contexto.
      storedText = [
        text,
        desc ? `[Foto enviada pelo cliente — ${desc}]` : "[Foto enviada pelo cliente]",
      ]
        .filter(Boolean)
        .join("\n");
    }

    // Grava a mensagem do cliente e AGENDA a resposta (debounce). O cron responde.
    await appendMessage(admin, cfg.storeId, customerPhone, "user", storedText);
    await schedulePendingReply(
      admin,
      cfg.storeId,
      customerPhone,
      DEBOUNCE_SECONDS
    );
  } catch (err) {
    console.error("[whatsapp/webhook]", err);
  }

  return ok();
}
