/**
 * Importa para o painel o que a Evolution guardou de uma conversa **antes** de o
 * VendeWhat entrar (ou enquanto o webhook esteve fora do ar).
 *
 * ⚠️ Depende do que a SUA Evolution guardou: ela só devolve o histórico que
 * estiver no banco dela. Instalação sem store de mensagens, ou conta conectada
 * sem `syncFullHistory`, simplesmente não tem nada para dar — a rota responde
 * `imported: 0` em vez de erro, e o painel avisa o lojista.
 *
 * Não baixa mídia antiga (o arquivo no servidor do WhatsApp costuma ter expirado):
 * a foto/áudio antigos entram como um balão identificado ("📷 Foto"), sem o
 * arquivo. O que chega a partir de agora, esse sim vem com o arquivo.
 */
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import {
  MESSAGE_RETENTION_DAYS,
  getConfig,
  type MessageSender,
} from "@/lib/whatsappConfig";
import { findMessages } from "@/lib/evolution";
import { mediaKindLabel } from "@/lib/whatsappMedia";
import { toWhatsAppNumber } from "@/lib/customerPhone";

export const runtime = "nodejs";
export const maxDuration = 60;

type AnyObj = Record<string, unknown>;

function asObj(v: unknown): AnyObj | null {
  return v && typeof v === "object" ? (v as AnyObj) : null;
}

function unwrap(message: AnyObj | null): AnyObj | null {
  if (!message) return null;
  const eph = asObj(message.ephemeralMessage);
  if (eph) return unwrap(asObj(eph.message));
  const vo =
    asObj(message.viewOnceMessage) ??
    asObj(message.viewOnceMessageV2) ??
    asObj(message.viewOnceMessageV2Extension);
  if (vo) return unwrap(asObj(vo.message));
  return message;
}

function textOf(message: AnyObj | null): string {
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

function mediaOf(message: AnyObj | null): string {
  if (!message) return "";
  if (asObj(message.imageMessage)) return "image";
  if (asObj(message.audioMessage)) return "audio";
  if (asObj(message.videoMessage)) return "video";
  if (asObj(message.stickerMessage)) return "sticker";
  if (asObj(message.locationMessage) || asObj(message.liveLocationMessage))
    return "location";
  if (asObj(message.documentMessage) || asObj(message.documentWithCaptionMessage))
    return "document";
  return "";
}

/** `messageTimestamp` vem em segundos (às vezes como string ou { low }). */
function timestampOf(raw: AnyObj): string | null {
  const t = raw.messageTimestamp ?? raw.timestamp;
  const num =
    typeof t === "number"
      ? t
      : typeof t === "string"
      ? Number(t)
      : Number(asObj(t)?.low ?? NaN);
  if (!Number.isFinite(num) || num <= 0) return null;
  // Segundos (10 dígitos) ou milissegundos, conforme a versão.
  const ms = num > 1e12 ? num : num * 1000;
  return new Date(ms).toISOString();
}

export async function POST(req: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });
  }
  const { data: store } = await supabase
    .from("stores")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!store?.id) {
    return NextResponse.json({ ok: false, error: "Loja não encontrada." }, { status: 404 });
  }
  const admin = createAdminSupabase();
  if (!admin) {
    return NextResponse.json(
      { ok: false, error: "Servidor sem service role." },
      { status: 503 }
    );
  }
  const storeId = store.id as string;

  let phone = "";
  try {
    const body = (await req.json()) as { phone?: string };
    phone = typeof body.phone === "string" ? body.phone.replace(/\D/g, "") : "";
  } catch {
    /* corpo inválido → phone vazio */
  }
  if (!phone) {
    return NextResponse.json(
      { ok: false, error: "Informe o número do cliente." },
      { status: 400 }
    );
  }

  const cfg = await getConfig(admin, storeId);
  if (!cfg || cfg.connectionStatus !== "connected") {
    return NextResponse.json(
      { ok: false, error: "Conecte o WhatsApp da loja para importar." },
      { status: 409 }
    );
  }

  const remoteJid = `${toWhatsAppNumber(phone)}@s.whatsapp.net`;
  const records = await findMessages(cfg.evolutionInstance, remoteJid, 300);
  if (records.length === 0) {
    return NextResponse.json({ ok: true, imported: 0, available: 0 });
  }

  // Só o que cabe na janela de retenção — importar mais velho seria apagado pela
  // limpeza na próxima passada do cron.
  const cutoff = Date.now() - MESSAGE_RETENTION_DAYS * 86_400_000;

  const rows: AnyObj[] = [];
  for (const raw of records) {
    const key = asObj(raw.key);
    const waId = typeof key?.id === "string" ? key.id : "";
    if (!waId) continue;
    const createdAt = timestampOf(raw);
    if (!createdAt || new Date(createdAt).getTime() < cutoff) continue;

    const message = unwrap(asObj(raw.message));
    const mediaType = mediaOf(message);
    const text = textOf(message).trim();
    const content = text || mediaKindLabel(mediaType || null);
    if (!content) continue; // nada que dê para mostrar

    const fromMe = key?.fromMe === true;
    rows.push({
      store_id: storeId,
      customer_phone: phone,
      role: fromMe ? "assistant" : "user",
      content: content.slice(0, 4000),
      created_at: createdAt,
      wa_message_id: waId,
      // Importado é sempre conversa humana: o que saiu da loja foi o dono no
      // celular (a IA só passou a existir depois da conexão).
      sender: (fromMe ? "owner" : "customer") satisfies MessageSender,
      media_type: mediaType || null,
      // Mídia antiga não é baixada (costuma ter expirado no servidor do WhatsApp).
      media_url: null,
    });
  }

  if (rows.length === 0) {
    return NextResponse.json({ ok: true, imported: 0, available: records.length });
  }

  // O índice único (store_id, wa_message_id) faz o reimport ser inofensivo:
  // o que já está no painel é ignorado, só entra o que falta.
  const { error } = await admin
    .from("whatsapp_messages")
    .upsert(rows, { onConflict: "store_id,wa_message_id", ignoreDuplicates: true });
  if (error) {
    console.error("[whatsapp/import-history]", error.message);
    return NextResponse.json(
      {
        ok: false,
        error:
          "Não foi possível importar. Rode a migration do espelho de conversas (supabase-migration-whatsapp-mirror.sql).",
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, imported: rows.length, available: records.length });
}
