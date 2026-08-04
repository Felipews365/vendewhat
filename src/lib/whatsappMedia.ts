/**
 * Guarda no Storage a mídia que passa pela conversa do WhatsApp, para a aba
 * Conversas do painel ser um espelho real (foto/áudio/vídeo/documento aparecem
 * como no celular, não só como "[Foto enviada pelo cliente]").
 *
 * Fica no bucket `product-images` que já existe (pasta `whatsapp/`), então não há
 * bucket nem policy nova: as rotas gravam por service role e a URL pública é o
 * que o painel do dono renderiza.
 *
 * ⚠️ Nada aqui pode derrubar o atendimento: toda falha vira `null` e a conversa
 * segue com o texto/descrição de sempre.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export const MEDIA_BUCKET = "product-images";
/** Pasta raiz da mídia de conversa (usada também pela limpeza por idade). */
export const MEDIA_PREFIX = "whatsapp";

/** Acima disso não vale a pena guardar (o WhatsApp já limita ~16MB em vídeo). */
const MAX_MEDIA_BYTES = 20 * 1024 * 1024;

export type WhatsAppMediaKind =
  | "image"
  | "audio"
  | "video"
  | "document"
  | "sticker"
  | "location";

/** Rótulo curto para a lista de conversas e para o balão sem legenda. */
export function mediaKindLabel(kind: string | null | undefined): string {
  switch (kind) {
    case "image":
      return "📷 Foto";
    case "audio":
      return "🎤 Áudio";
    case "video":
      return "🎥 Vídeo";
    case "document":
      return "📄 Documento";
    case "sticker":
      return "🩶 Figurinha";
    case "location":
      return "📍 Localização";
    default:
      return "";
  }
}

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "audio/ogg": "ogg",
  "audio/opus": "ogg",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/amr": "amr",
  "audio/wav": "wav",
  "video/mp4": "mp4",
  "video/3gpp": "3gp",
  "video/quicktime": "mov",
  "application/pdf": "pdf",
};

function extForMime(mimetype: string, fallback: string): string {
  const clean = mimetype.split(";")[0].trim().toLowerCase();
  return EXT_BY_MIME[clean] ?? fallback;
}

/**
 * Sobe o base64 recebido da Evolution e devolve a URL pública. Nunca lança —
 * devolve `null` quando não dá para guardar (arquivo grande demais, storage fora
 * do ar, base64 inválido).
 */
export async function storeConversationMedia(
  db: SupabaseClient,
  args: {
    storeId: string;
    customerPhone: string;
    /** `key.id` da mensagem — serve de nome do arquivo (idempotente). */
    messageId: string;
    base64: string;
    mimetype: string;
    kind: WhatsAppMediaKind;
  }
): Promise<string | null> {
  try {
    const buffer = Buffer.from(args.base64, "base64");
    if (buffer.byteLength === 0 || buffer.byteLength > MAX_MEDIA_BYTES) return null;

    const fallbackExt =
      args.kind === "audio"
        ? "ogg"
        : args.kind === "video"
        ? "mp4"
        : args.kind === "document"
        ? "bin"
        : "jpg";
    const ext = extForMime(args.mimetype, fallbackExt);
    const safeId = (args.messageId || `${Date.now()}`).replace(/[^\w-]/g, "").slice(0, 60);
    const phone = args.customerPhone.replace(/\D/g, "");
    const path = `${MEDIA_PREFIX}/${args.storeId}/${phone}/${safeId}.${ext}`;

    const { error } = await db.storage.from(MEDIA_BUCKET).upload(path, buffer, {
      contentType: args.mimetype || "application/octet-stream",
      upsert: true,
    });
    if (error) {
      console.error("[whatsappMedia] upload", error.message);
      return null;
    }
    const { data } = db.storage.from(MEDIA_BUCKET).getPublicUrl(path);
    return data?.publicUrl || null;
  } catch (e) {
    console.error("[whatsappMedia] storeConversationMedia", e);
    return null;
  }
}

/**
 * Caminho dentro do bucket a partir da URL pública (para a limpeza por idade
 * apagar o arquivo junto com a linha da mensagem). Só devolve caminho da pasta
 * `whatsapp/` — nunca apagaria uma foto de produto por engano.
 */
export function storagePathFromPublicUrl(url: string | null | undefined): string | null {
  if (!url || typeof url !== "string") return null;
  const marker = `/${MEDIA_BUCKET}/`;
  const i = url.indexOf(marker);
  if (i === -1) return null;
  const path = decodeURIComponent(url.slice(i + marker.length).split("?")[0]);
  return path.startsWith(`${MEDIA_PREFIX}/`) ? path : null;
}
