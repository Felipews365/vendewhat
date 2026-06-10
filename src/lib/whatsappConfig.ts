/**
 * Tipos e helpers de persistência da configuração de WhatsApp/IA por loja.
 * Usa um SupabaseClient (normalmente o admin/service-role) — só no servidor.
 */
import { randomBytes } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

export type AiTone = "simpatico" | "formal" | "descontraido";
export const AI_TONES: AiTone[] = ["simpatico", "formal", "descontraido"];
export const AI_TONE_LABELS: Record<AiTone, string> = {
  simpatico: "Simpático",
  formal: "Formal",
  descontraido: "Descontraído",
};

export type ConnectionStatus = "disconnected" | "connecting" | "connected";

export type WhatsAppConfig = {
  storeId: string;
  evolutionInstance: string;
  webhookToken: string;
  connectionStatus: ConnectionStatus;
  connectedNumber: string | null;
  aiEnabled: boolean;
  aiName: string;
  aiTone: AiTone;
  faq: string;
};

const TABLE = "store_whatsapp";

/** Nome estável da instância Evolution para a loja (sem hífens do uuid). */
export function instanceForStore(storeId: string): string {
  return `vendewhat_${storeId.replace(/-/g, "")}`;
}

function normalizeTone(v: unknown): AiTone {
  return AI_TONES.includes(v as AiTone) ? (v as AiTone) : "simpatico";
}

function rowToConfig(row: Record<string, unknown>): WhatsAppConfig {
  return {
    storeId: String(row.store_id),
    evolutionInstance: String(row.evolution_instance),
    webhookToken: String(row.webhook_token),
    connectionStatus: (["disconnected", "connecting", "connected"].includes(
      String(row.connection_status)
    )
      ? row.connection_status
      : "disconnected") as ConnectionStatus,
    connectedNumber:
      typeof row.connected_number === "string" && row.connected_number
        ? row.connected_number
        : null,
    aiEnabled: row.ai_enabled === true,
    aiName:
      typeof row.ai_name === "string" && row.ai_name.trim()
        ? row.ai_name.trim()
        : "Atendente",
    aiTone: normalizeTone(row.ai_tone),
    faq: typeof row.faq === "string" ? row.faq : "",
  };
}

const SELECT =
  "store_id, evolution_instance, webhook_token, connection_status, connected_number, ai_enabled, ai_name, ai_tone, faq";

/** Lê a config da loja (ou null se ainda não existe). */
export async function getConfig(
  db: SupabaseClient,
  storeId: string
): Promise<WhatsAppConfig | null> {
  const { data } = await db
    .from(TABLE)
    .select(SELECT)
    .eq("store_id", storeId)
    .maybeSingle();
  return data ? rowToConfig(data as Record<string, unknown>) : null;
}

/** Lê a config pela instância Evolution (usado no webhook). */
export async function getConfigByInstance(
  db: SupabaseClient,
  instance: string
): Promise<WhatsAppConfig | null> {
  const { data } = await db
    .from(TABLE)
    .select(SELECT)
    .eq("evolution_instance", instance)
    .maybeSingle();
  return data ? rowToConfig(data as Record<string, unknown>) : null;
}

/** Garante que a loja tem uma linha de config (cria com instance + token se faltar). */
export async function ensureConfig(
  db: SupabaseClient,
  storeId: string
): Promise<WhatsAppConfig> {
  const existing = await getConfig(db, storeId);
  if (existing) return existing;

  const insert = {
    store_id: storeId,
    evolution_instance: instanceForStore(storeId),
    webhook_token: randomBytes(24).toString("hex"),
  };
  const { data, error } = await db
    .from(TABLE)
    .insert(insert)
    .select(SELECT)
    .single();
  if (error || !data) {
    throw new Error(error?.message || "Não foi possível criar a config do WhatsApp.");
  }
  return rowToConfig(data as Record<string, unknown>);
}

/** Atualiza o estado de conexão (e número, quando informado). */
export async function updateConnection(
  db: SupabaseClient,
  storeId: string,
  status: ConnectionStatus,
  connectedNumber?: string | null
): Promise<void> {
  const patch: Record<string, unknown> = {
    connection_status: status,
    updated_at: new Date().toISOString(),
  };
  if (connectedNumber !== undefined) patch.connected_number = connectedNumber;
  if (status === "disconnected") patch.connected_number = null;
  await db.from(TABLE).update(patch).eq("store_id", storeId);
}

/** Salva os campos de configuração da IA. */
export async function saveAiConfig(
  db: SupabaseClient,
  storeId: string,
  cfg: { aiEnabled: boolean; aiName: string; aiTone: AiTone; faq: string }
): Promise<void> {
  await db
    .from(TABLE)
    .update({
      ai_enabled: cfg.aiEnabled,
      ai_name: cfg.aiName.trim().slice(0, 60) || "Atendente",
      ai_tone: normalizeTone(cfg.aiTone),
      faq: cfg.faq.trim().slice(0, 4000),
      updated_at: new Date().toISOString(),
    })
    .eq("store_id", storeId);
}

export type ChatTurn = { role: "user" | "assistant"; content: string };

/** Histórico recente (ordem cronológica) de uma conversa com um cliente. */
export async function getRecentHistory(
  db: SupabaseClient,
  storeId: string,
  customerPhone: string,
  limit = 10
): Promise<ChatTurn[]> {
  const { data } = await db
    .from("whatsapp_messages")
    .select("role, content")
    .eq("store_id", storeId)
    .eq("customer_phone", customerPhone)
    .order("created_at", { ascending: false })
    .limit(limit);
  const rows = (data ?? []) as { role: string; content: string }[];
  return rows
    .reverse()
    .map((r) => ({
      role: r.role === "assistant" ? "assistant" : "user",
      content: String(r.content ?? ""),
    }));
}

/** Registra uma mensagem da conversa. */
export async function appendMessage(
  db: SupabaseClient,
  storeId: string,
  customerPhone: string,
  role: "user" | "assistant",
  content: string
): Promise<void> {
  await db.from("whatsapp_messages").insert({
    store_id: storeId,
    customer_phone: customerPhone,
    role,
    content: content.slice(0, 4000),
  });
}
