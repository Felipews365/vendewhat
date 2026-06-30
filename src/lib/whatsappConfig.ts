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
  /** Pausa global da IA (não responde ninguém enquanto ativa). */
  aiPaused: boolean;
  /** Quando a pausa global expira (ISO). null = pausada até a loja reativar. */
  aiPausedUntil: string | null;
  /** Minutos que a IA fica pausada para um cliente após a loja responder. 0 = desativado. */
  aiHandoffMinutes: number;
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
    aiPaused: row.ai_paused === true,
    aiPausedUntil:
      typeof row.ai_paused_until === "string" && row.ai_paused_until
        ? row.ai_paused_until
        : null,
    aiHandoffMinutes:
      typeof row.ai_handoff_minutes === "number"
        ? row.ai_handoff_minutes
        : Number(row.ai_handoff_minutes ?? 30) || 0,
  };
}

const SELECT =
  "store_id, evolution_instance, webhook_token, connection_status, connected_number, ai_enabled, ai_name, ai_tone, faq, ai_paused, ai_paused_until, ai_handoff_minutes";

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
  cfg: {
    aiEnabled: boolean;
    aiName: string;
    aiTone: AiTone;
    faq: string;
    aiHandoffMinutes: number;
  }
): Promise<void> {
  const handoff = Math.max(
    0,
    Math.min(1440, Math.round(Number.isFinite(cfg.aiHandoffMinutes) ? cfg.aiHandoffMinutes : 30))
  );
  await db
    .from(TABLE)
    .update({
      ai_enabled: cfg.aiEnabled,
      ai_name: cfg.aiName.trim().slice(0, 60) || "Atendente",
      ai_tone: normalizeTone(cfg.aiTone),
      faq: cfg.faq.trim().slice(0, 4000),
      ai_handoff_minutes: handoff,
      updated_at: new Date().toISOString(),
    })
    .eq("store_id", storeId);
}

// --- Pausas ------------------------------------------------------------------

/** True se a pausa global está ativa agora (considera expiração). */
export function globalPauseActive(
  cfg: Pick<WhatsAppConfig, "aiPaused" | "aiPausedUntil">,
  now: number = Date.now()
): boolean {
  if (!cfg.aiPaused) return false;
  if (!cfg.aiPausedUntil) return true; // pausa indefinida
  return new Date(cfg.aiPausedUntil).getTime() > now;
}

/** Pausa a IA globalmente. untilIso null = até a loja reativar. */
export async function setGlobalPause(
  db: SupabaseClient,
  storeId: string,
  untilIso: string | null
): Promise<void> {
  await db
    .from(TABLE)
    .update({
      ai_paused: true,
      ai_paused_until: untilIso,
      updated_at: new Date().toISOString(),
    })
    .eq("store_id", storeId);
}

/** Reativa a IA globalmente. */
export async function clearGlobalPause(
  db: SupabaseClient,
  storeId: string
): Promise<void> {
  await db
    .from(TABLE)
    .update({
      ai_paused: false,
      ai_paused_until: null,
      updated_at: new Date().toISOString(),
    })
    .eq("store_id", storeId);
}

export type CustomerPause = {
  customerPhone: string;
  pausedUntil: string | null;
  reason: string;
};

const PAUSES = "whatsapp_pauses";

/** Pausa a IA para um cliente específico. untilIso null = até a loja reativar. */
export async function setCustomerPause(
  db: SupabaseClient,
  storeId: string,
  customerPhone: string,
  untilIso: string | null,
  reason: "manual" | "handoff" = "manual"
): Promise<void> {
  await db.from(PAUSES).upsert(
    {
      store_id: storeId,
      customer_phone: customerPhone,
      paused_until: untilIso,
      reason,
      created_at: new Date().toISOString(),
    },
    { onConflict: "store_id,customer_phone" }
  );
}

/** Reativa a IA para um cliente específico. */
export async function clearCustomerPause(
  db: SupabaseClient,
  storeId: string,
  customerPhone: string
): Promise<void> {
  await db
    .from(PAUSES)
    .delete()
    .eq("store_id", storeId)
    .eq("customer_phone", customerPhone);
}

/** Lista as pausas de cliente ainda ativas (descarta as expiradas). */
export async function listCustomerPauses(
  db: SupabaseClient,
  storeId: string
): Promise<CustomerPause[]> {
  const { data } = await db
    .from(PAUSES)
    .select("customer_phone, paused_until, reason")
    .eq("store_id", storeId)
    .order("created_at", { ascending: false });
  const now = Date.now();
  return ((data ?? []) as Record<string, unknown>[])
    .filter(
      (r) =>
        !r.paused_until ||
        new Date(String(r.paused_until)).getTime() > now
    )
    .map((r) => ({
      customerPhone: String(r.customer_phone),
      pausedUntil:
        typeof r.paused_until === "string" && r.paused_until
          ? r.paused_until
          : null,
      reason: String(r.reason ?? "manual"),
    }));
}

export type RecentCustomer = {
  customerPhone: string;
  lastMessage: string;
  lastAt: string;
};

/** Clientes que já conversaram com a loja, do mais recente para o mais antigo. */
export async function listRecentCustomers(
  db: SupabaseClient,
  storeId: string,
  limit = 30
): Promise<RecentCustomer[]> {
  const { data } = await db
    .from("whatsapp_messages")
    .select("customer_phone, content, created_at")
    .eq("store_id", storeId)
    .order("created_at", { ascending: false })
    .limit(200);
  const seen = new Map<string, RecentCustomer>();
  for (const r of (data ?? []) as Record<string, unknown>[]) {
    const phone = String(r.customer_phone ?? "");
    if (!phone || seen.has(phone)) continue; // 1ª ocorrência = mensagem mais recente
    seen.set(phone, {
      customerPhone: phone,
      lastMessage: String(r.content ?? ""),
      lastAt: typeof r.created_at === "string" ? r.created_at : "",
    });
    if (seen.size >= limit) break;
  }
  return Array.from(seen.values());
}

/** True se a IA está pausada para este cliente agora (limpa a pausa se expirou). */
export async function isCustomerPaused(
  db: SupabaseClient,
  storeId: string,
  customerPhone: string
): Promise<boolean> {
  const { data } = await db
    .from(PAUSES)
    .select("paused_until")
    .eq("store_id", storeId)
    .eq("customer_phone", customerPhone)
    .maybeSingle();
  if (!data) return false;
  const until = (data as Record<string, unknown>).paused_until;
  if (!until) return true; // pausa indefinida
  if (new Date(String(until)).getTime() > Date.now()) return true;
  await clearCustomerPause(db, storeId, customerPhone);
  return false;
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

/** Conteúdo das últimas respostas da IA (para reconhecer o eco da própria loja). */
export async function getLastAssistantMessages(
  db: SupabaseClient,
  storeId: string,
  customerPhone: string,
  limit = 3
): Promise<string[]> {
  const { data } = await db
    .from("whatsapp_messages")
    .select("content")
    .eq("store_id", storeId)
    .eq("customer_phone", customerPhone)
    .eq("role", "assistant")
    .order("created_at", { ascending: false })
    .limit(limit);
  return ((data ?? []) as { content: string }[]).map((r) =>
    String(r.content ?? "")
  );
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
