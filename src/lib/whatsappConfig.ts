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
  /** Minutos de silêncio do cliente até a IA enviar o follow-up. 0 = desativado. */
  aiFollowupMinutes: number;
  /** Mensagem fixa de follow-up. Vazio = a IA gera com base na conversa. */
  aiFollowupMessage: string;
  /** Dias após o pedido até a IA mandar a mensagem de pós-venda. 0 = desativado. */
  aiPostsaleDays: number;
  /** Mensagem fixa de pós-venda. Vazio = a IA gera. */
  aiPostsaleMessage: string;
  /** Endereço de onde a loja fica (a IA informa quando perguntam). Vazio = usa o de retirada. */
  aiLocationAddress: string;
  /** Coordenadas para o pino do mapa do WhatsApp. null = sem pino. */
  aiLocationLat: number | null;
  aiLocationLng: number | null;
  /** Link do Google Maps colado pelo lojista (para reexibir no editor). */
  aiLocationUrl: string;
  /** Foto da loja/fachada que a IA envia quando o cliente pede. Vazio = sem foto. */
  aiStorePhotoUrl: string;
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
    aiFollowupMinutes:
      typeof row.ai_followup_minutes === "number"
        ? row.ai_followup_minutes
        : Number(row.ai_followup_minutes ?? 0) || 0,
    aiFollowupMessage:
      typeof row.ai_followup_message === "string" ? row.ai_followup_message : "",
    aiPostsaleDays:
      typeof row.ai_postsale_days === "number"
        ? row.ai_postsale_days
        : Number(row.ai_postsale_days ?? 0) || 0,
    aiPostsaleMessage:
      typeof row.ai_postsale_message === "string" ? row.ai_postsale_message : "",
    aiLocationAddress:
      typeof row.ai_location_address === "string" ? row.ai_location_address : "",
    aiLocationLat:
      typeof row.ai_location_lat === "number" ? row.ai_location_lat : null,
    aiLocationLng:
      typeof row.ai_location_lng === "number" ? row.ai_location_lng : null,
    aiLocationUrl:
      typeof row.ai_location_url === "string" ? row.ai_location_url : "",
    aiStorePhotoUrl:
      typeof row.ai_store_photo_url === "string" ? row.ai_store_photo_url : "",
  };
}

const SELECT =
  "store_id, evolution_instance, webhook_token, connection_status, connected_number, ai_enabled, ai_name, ai_tone, faq, ai_paused, ai_paused_until, ai_handoff_minutes, ai_followup_minutes, ai_followup_message, ai_postsale_days, ai_postsale_message, ai_location_address, ai_location_lat, ai_location_lng, ai_location_url, ai_store_photo_url";

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
    aiFollowupMinutes: number;
    aiFollowupMessage: string;
    aiPostsaleDays: number;
    aiPostsaleMessage: string;
    aiLocationAddress: string;
    aiLocationLat: number | null;
    aiLocationLng: number | null;
    aiLocationUrl: string;
    aiStorePhotoUrl: string;
  }
): Promise<void> {
  const handoff = Math.max(
    0,
    Math.min(1440, Math.round(Number.isFinite(cfg.aiHandoffMinutes) ? cfg.aiHandoffMinutes : 30))
  );
  const followup = Math.max(
    0,
    Math.min(
      10080,
      Math.round(Number.isFinite(cfg.aiFollowupMinutes) ? cfg.aiFollowupMinutes : 0)
    )
  );
  const postsaleDays = Math.max(
    0,
    Math.min(90, Math.round(Number.isFinite(cfg.aiPostsaleDays) ? cfg.aiPostsaleDays : 0))
  );
  await db
    .from(TABLE)
    .update({
      ai_enabled: cfg.aiEnabled,
      ai_name: cfg.aiName.trim().slice(0, 60) || "Atendente",
      ai_tone: normalizeTone(cfg.aiTone),
      faq: cfg.faq.trim().slice(0, 4000),
      ai_handoff_minutes: handoff,
      ai_followup_minutes: followup,
      ai_followup_message: cfg.aiFollowupMessage.trim().slice(0, 1000),
      ai_postsale_days: postsaleDays,
      ai_postsale_message: cfg.aiPostsaleMessage.trim().slice(0, 1000),
      ai_location_address: cfg.aiLocationAddress.trim().slice(0, 300),
      ai_location_lat:
        cfg.aiLocationLat != null && Number.isFinite(cfg.aiLocationLat)
          ? cfg.aiLocationLat
          : null,
      ai_location_lng:
        cfg.aiLocationLng != null && Number.isFinite(cfg.aiLocationLng)
          ? cfg.aiLocationLng
          : null,
      ai_location_url: cfg.aiLocationUrl.trim().slice(0, 500),
      ai_store_photo_url: cfg.aiStorePhotoUrl.trim().slice(0, 500),
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

// --- Follow-up (cron) --------------------------------------------------------

const FOLLOWUPS = "whatsapp_followups";

/** Lojas com follow-up ligado, IA ativa e WhatsApp conectado (para o cron). */
export async function listFollowupConfigs(
  db: SupabaseClient
): Promise<WhatsAppConfig[]> {
  const { data } = await db
    .from(TABLE)
    .select(SELECT)
    .gt("ai_followup_minutes", 0)
    .eq("ai_enabled", true)
    .eq("connection_status", "connected");
  return ((data ?? []) as Record<string, unknown>[]).map(rowToConfig);
}

/** Telefones com pausa ativa para a loja (handoff ou manual). */
export async function getActivePausedPhones(
  db: SupabaseClient,
  storeId: string
): Promise<Set<string>> {
  const pauses = await listCustomerPauses(db, storeId);
  return new Set(pauses.map((p) => p.customerPhone));
}

/** Mapa telefone -> timestamp (ms) do último follow-up enviado. */
export async function getFollowupTimes(
  db: SupabaseClient,
  storeId: string
): Promise<Map<string, number>> {
  const { data } = await db
    .from(FOLLOWUPS)
    .select("customer_phone, last_followup_at")
    .eq("store_id", storeId);
  const map = new Map<string, number>();
  for (const r of (data ?? []) as Record<string, unknown>[]) {
    const phone = String(r.customer_phone ?? "");
    const at = r.last_followup_at ? new Date(String(r.last_followup_at)).getTime() : 0;
    if (phone) map.set(phone, at);
  }
  return map;
}

/** Registra que a loja já cutucou este cliente agora. */
export async function markFollowup(
  db: SupabaseClient,
  storeId: string,
  customerPhone: string
): Promise<void> {
  await db.from(FOLLOWUPS).upsert(
    {
      store_id: storeId,
      customer_phone: customerPhone,
      last_followup_at: new Date().toISOString(),
    },
    { onConflict: "store_id,customer_phone" }
  );
}

// --- Pós-venda (cron) --------------------------------------------------------

/** Lojas com pós-venda ligado e WhatsApp conectado (para o cron). */
export async function listPostsaleConfigs(
  db: SupabaseClient
): Promise<WhatsAppConfig[]> {
  const { data } = await db
    .from(TABLE)
    .select(SELECT)
    .gt("ai_postsale_days", 0)
    .eq("connection_status", "connected");
  return ((data ?? []) as Record<string, unknown>[]).map(rowToConfig);
}

export type DuePostsaleOrder = {
  id: string;
  customerPhone: string;
  customerName: string;
  orderNumber: number | null;
};

/**
 * Pedidos prontos para o pós-venda: já passou o prazo (em dias), ainda não
 * receberam a mensagem e não são antigos demais (janela de 3 dias para evitar
 * cutucar pedidos que ficaram para trás após uma queda do cron).
 */
export async function listDuePostsaleOrders(
  db: SupabaseClient,
  storeId: string,
  days: number,
  limit = 30
): Promise<DuePostsaleOrder[]> {
  const now = Date.now();
  const dueBefore = new Date(now - days * 86_400_000).toISOString();
  const tooOld = new Date(now - (days + 3) * 86_400_000).toISOString();
  const { data } = await db
    .from("orders")
    .select("id, customer_phone, customer_name, order_number, created_at")
    .eq("store_id", storeId)
    .is("postsale_sent_at", null)
    .not("customer_phone", "is", null)
    .lte("created_at", dueBefore)
    .gte("created_at", tooOld)
    .order("created_at", { ascending: true })
    .limit(limit);
  return ((data ?? []) as Record<string, unknown>[])
    .map((r) => ({
      id: String(r.id),
      customerPhone: String(r.customer_phone ?? ""),
      customerName: typeof r.customer_name === "string" ? r.customer_name : "",
      orderNumber:
        typeof r.order_number === "number" ? r.order_number : null,
    }))
    .filter((o) => o.customerPhone);
}

/** Marca que o pós-venda do pedido já foi enviado. */
export async function markPostsaleSent(
  db: SupabaseClient,
  orderId: string
): Promise<void> {
  await db
    .from("orders")
    .update({ postsale_sent_at: new Date().toISOString() })
    .eq("id", orderId);
}

export type ConversationTimes = {
  /** ms da última mensagem (qualquer lado). */
  lastAnyAt: number;
  /** ms da última mensagem do cliente (role=user), ou 0 se nunca. */
  lastUserAt: number;
};

/** Por cliente: quando foi a última mensagem (qualquer lado) e a última do cliente. */
export async function getConversationTimes(
  db: SupabaseClient,
  storeId: string,
  limit = 500
): Promise<Map<string, ConversationTimes>> {
  const { data } = await db
    .from("whatsapp_messages")
    .select("customer_phone, role, created_at")
    .eq("store_id", storeId)
    .order("created_at", { ascending: false })
    .limit(limit);
  const map = new Map<string, ConversationTimes>();
  for (const r of (data ?? []) as Record<string, unknown>[]) {
    const phone = String(r.customer_phone ?? "");
    if (!phone) continue;
    const at = r.created_at ? new Date(String(r.created_at)).getTime() : 0;
    const isUser = r.role !== "assistant";
    const cur = map.get(phone);
    if (!cur) {
      // Como vem em ordem decrescente, a 1ª ocorrência é a mais recente.
      map.set(phone, { lastAnyAt: at, lastUserAt: isUser ? at : 0 });
    } else if (isUser && cur.lastUserAt === 0) {
      cur.lastUserAt = at;
    }
  }
  return map;
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

// --- Debounce (agrupamento de mensagens seguidas) ----------------------------
// O webhook grava a mensagem e AGENDA uma resposta (respond_after = agora + Xs),
// sem gerar nada na hora. Se o cliente manda outra mensagem, o agendamento é
// empurrado para frente (o timer reinicia). Um cron externo (~1 min) chama o
// endpoint de debounce, que responde às conversas cujo tempo de silêncio venceu —
// juntando todas as mensagens do lote numa única resposta.

const PENDING = "whatsapp_pending_replies";

/** Agenda/reagenda a resposta para `delaySeconds` a partir de agora (debounce). */
export async function schedulePendingReply(
  db: SupabaseClient,
  storeId: string,
  customerPhone: string,
  delaySeconds: number
): Promise<void> {
  const respondAfter = new Date(Date.now() + delaySeconds * 1000).toISOString();
  await db.from(PENDING).upsert(
    {
      store_id: storeId,
      customer_phone: customerPhone,
      respond_after: respondAfter,
    },
    { onConflict: "store_id,customer_phone" }
  );
}

export type PendingReply = {
  storeId: string;
  customerPhone: string;
  respondAfter: string;
  createdAt: string;
};

/** Conversas cujo silêncio já venceu (respond_after <= agora), da mais antiga. */
export async function listDuePendingReplies(
  db: SupabaseClient,
  limit = 50
): Promise<PendingReply[]> {
  const nowIso = new Date().toISOString();
  const { data } = await db
    .from(PENDING)
    .select("store_id, customer_phone, respond_after, created_at")
    .lte("respond_after", nowIso)
    .order("respond_after", { ascending: true })
    .limit(limit);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    storeId: String(r.store_id),
    customerPhone: String(r.customer_phone),
    respondAfter: String(r.respond_after),
    createdAt: typeof r.created_at === "string" ? r.created_at : "",
  }));
}

/**
 * "Reserva" um pendente para esta execução do cron, empurrando o `respond_after`
 * para daqui a `leaseSeconds` (lock otimista). Só reserva se ainda estiver
 * vencido (`respond_after <= dueBeforeIso`) — assim dois crons simultâneos não
 * respondem duas vezes, e se uma mensagem nova chegou (empurrou para o futuro),
 * a reserva falha e o cliente que ainda digita não é interrompido.
 * Retorna true se conseguiu reservar.
 */
export async function claimPendingReply(
  db: SupabaseClient,
  storeId: string,
  customerPhone: string,
  dueBeforeIso: string,
  leaseSeconds = 300
): Promise<boolean> {
  const lease = new Date(Date.now() + leaseSeconds * 1000).toISOString();
  const { data } = await db
    .from(PENDING)
    .update({ respond_after: lease })
    .eq("store_id", storeId)
    .eq("customer_phone", customerPhone)
    .lte("respond_after", dueBeforeIso)
    .select("customer_phone");
  return Array.isArray(data) && data.length > 0;
}

/** Remove o agendamento (resposta enviada, ou conversa que não deve receber resposta). */
export async function deletePendingReply(
  db: SupabaseClient,
  storeId: string,
  customerPhone: string
): Promise<void> {
  await db
    .from(PENDING)
    .delete()
    .eq("store_id", storeId)
    .eq("customer_phone", customerPhone);
}
