/**
 * Wrapper REST da Evolution API (v2) — usado só no servidor.
 *
 * Configurar no ambiente:
 *   EVOLUTION_API_URL  -> base da sua Evolution (ex.: https://evo.seudominio.com)
 *   EVOLUTION_API_KEY  -> apikey global da Evolution
 */

const EVENTS = ["MESSAGES_UPSERT", "CONNECTION_UPDATE", "QRCODE_UPDATED"] as const;

function baseUrl(): string {
  const url = process.env.EVOLUTION_API_URL;
  if (!url) throw new Error("EVOLUTION_API_URL não configurada.");
  return url.replace(/\/+$/, "");
}

function apiKey(): string {
  const key = process.env.EVOLUTION_API_KEY;
  if (!key) throw new Error("EVOLUTION_API_KEY não configurada.");
  return key;
}

/** Indica se a integração Evolution está configurada (sem lançar erro). */
export function isEvolutionConfigured(): boolean {
  return Boolean(process.env.EVOLUTION_API_URL && process.env.EVOLUTION_API_KEY);
}

/**
 * Extrai a mensagem de erro da resposta da Evolution. A v2 costuma aninhar em
 * `response.message` (que pode ser um array), além do `message`/`error` no topo.
 */
function extractErrorMessage(parsed: unknown, status: number): string {
  const fallback = `Evolution API erro ${status}`;
  if (!parsed || typeof parsed !== "object") {
    return typeof parsed === "string" && parsed ? parsed : fallback;
  }
  const obj = parsed as Record<string, unknown>;
  const response = obj.response as Record<string, unknown> | undefined;
  const candidates: unknown[] = [
    obj.message,
    response?.message,
    response?.error,
    obj.error,
  ];
  for (const c of candidates) {
    if (Array.isArray(c) && c.length) return c.map((x) => String(x)).join(" ");
    if (typeof c === "string" && c.trim()) return c;
  }
  return fallback;
}

async function call<T>(
  method: "GET" | "POST" | "DELETE",
  path: string,
  body?: unknown
): Promise<T> {
  const res = await fetch(`${baseUrl()}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      apikey: apiKey(),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });

  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }

  if (!res.ok) {
    throw new Error(extractErrorMessage(parsed, res.status));
  }
  return parsed as T;
}

export type EvolutionState = "connected" | "connecting" | "disconnected";

/** Normaliza o `state` da Evolution ('open'|'connecting'|'close') para nosso vocabulário. */
function normalizeState(state: unknown): EvolutionState {
  if (state === "open") return "connected";
  if (state === "connecting") return "connecting";
  return "disconnected";
}

export type QrResult = {
  /** QR em base64 (geralmente já como data URI) ou null. */
  base64: string | null;
  /** Código de pareamento (alternativa ao QR). */
  pairingCode: string | null;
};

function extractQr(data: Record<string, unknown>): QrResult {
  // Em v2 o connect retorna { base64, code, pairingCode } ou { qrcode: { base64, pairingCode } }.
  const qr =
    data.qrcode && typeof data.qrcode === "object"
      ? (data.qrcode as Record<string, unknown>)
      : data;
  const base64 =
    typeof qr.base64 === "string" ? qr.base64 : null;
  const pairingCode =
    typeof qr.pairingCode === "string"
      ? qr.pairingCode
      : typeof data.pairingCode === "string"
      ? (data.pairingCode as string)
      : null;
  return { base64, pairingCode };
}

/** Cria a instância (idempotente: ignora "já existe") e configura o webhook. */
export async function createInstance(
  instance: string,
  webhookUrl: string
): Promise<void> {
  try {
    await call("POST", "/instance/create", {
      instanceName: instance,
      qrcode: true,
      integration: "WHATSAPP-BAILEYS",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message.toLowerCase() : "";
    // Instância já existe — seguimos para (re)configurar o webhook.
    if (!msg.includes("already") && !msg.includes("exist") && !msg.includes("in use")) {
      throw err;
    }
  }
  await setWebhook(instance, webhookUrl);
}

/** (Re)configura o webhook da instância. */
export async function setWebhook(
  instance: string,
  webhookUrl: string
): Promise<void> {
  await call("POST", `/webhook/set/${encodeURIComponent(instance)}`, {
    webhook: {
      enabled: true,
      url: webhookUrl,
      // Manda os dois padrões de nome (versões diferentes da Evolution usam um ou outro).
      byEvents: false,
      webhookByEvents: false,
      base64: false,
      webhookBase64: false,
      events: [...EVENTS],
    },
  });
}

/**
 * Consulta o webhook atualmente gravado na instância (para diagnóstico).
 * Nunca lança — devolve o objeto de erro para logar.
 */
export async function getWebhookInfo(
  instance: string
): Promise<Record<string, unknown>> {
  try {
    const data = await call<Record<string, unknown>>(
      "GET",
      `/webhook/find/${encodeURIComponent(instance)}`
    );
    return data ?? {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

/** Conecta a instância e retorna o QR Code (base64) / pairing code. */
export async function connectInstance(instance: string): Promise<QrResult> {
  const data = await call<Record<string, unknown>>(
    "GET",
    `/instance/connect/${encodeURIComponent(instance)}`
  );
  return extractQr(data ?? {});
}

export type ConnectionInfo = {
  state: EvolutionState;
  /** Número conectado (somente dígitos) quando disponível. */
  number: string | null;
};

/** Estado da conexão da instância. */
export async function getConnectionState(
  instance: string
): Promise<ConnectionInfo> {
  const data = await call<Record<string, unknown>>(
    "GET",
    `/instance/connectionState/${encodeURIComponent(instance)}`
  );
  const inst =
    data && typeof data.instance === "object"
      ? (data.instance as Record<string, unknown>)
      : data;
  const state = normalizeState(inst?.state);
  const ownerJid =
    typeof inst?.owner === "string"
      ? inst.owner
      : typeof inst?.ownerJid === "string"
      ? (inst.ownerJid as string)
      : null;
  let number = ownerJid ? ownerJid.replace(/\D/g, "") || null : null;
  // O /connectionState geralmente NÃO traz o dono; se estiver conectado e sem
  // número, busca o ownerJid em /instance/fetchInstances (backfill do número real
  // da loja, usado no contato da vitrine em vez do telefone de cadastro).
  if (!number && state === "connected") {
    number = await fetchOwnerNumber(instance);
  }
  return { state, number };
}

/**
 * Descobre o número do dono da instância (só dígitos) via /instance/fetchInstances.
 * A Evolution v2 responde com uma lista onde cada item tem `ownerJid`/`owner`
 * (às vezes aninhado em `instance`). Retorna null se não achar.
 */
async function fetchOwnerNumber(instance: string): Promise<string | null> {
  try {
    const res = await call<unknown>(
      "GET",
      `/instance/fetchInstances?instanceName=${encodeURIComponent(instance)}`
    );
    const list = Array.isArray(res) ? res : [res];
    for (const raw of list) {
      if (!raw || typeof raw !== "object") continue;
      const item = raw as Record<string, unknown>;
      const inst =
        item.instance && typeof item.instance === "object"
          ? (item.instance as Record<string, unknown>)
          : item;
      const jid =
        typeof inst.ownerJid === "string"
          ? inst.ownerJid
          : typeof inst.owner === "string"
          ? inst.owner
          : null;
      const digits = jid ? jid.replace(/\D/g, "") : "";
      if (digits) return digits;
    }
  } catch {
    // fetchInstances pode não existir/estar protegido — segue sem o número.
  }
  return null;
}

/** Desconecta (logout) a instância — mantém a instância criada para reconectar depois. */
export async function logoutInstance(instance: string): Promise<void> {
  try {
    await call("DELETE", `/instance/logout/${encodeURIComponent(instance)}`);
  } catch {
    // Já desconectada — ignora.
  }
}

/**
 * Envia uma mensagem de texto. `number` deve conter DDI + DDD + número (só dígitos).
 * `delayMs` (opcional): a Evolution mostra "digitando…" (presence composing) por esse
 * tempo antes de entregar a mensagem — deixa o atendimento com cara de humano.
 */
export async function sendText(
  instance: string,
  number: string,
  text: string,
  delayMs?: number
): Promise<void> {
  await call("POST", `/message/sendText/${encodeURIComponent(instance)}`, {
    number: number.replace(/\D/g, ""),
    text,
    ...(delayMs && delayMs > 0 ? { delay: Math.round(delayMs) } : {}),
  });
}

/**
 * Baixa o conteúdo de uma mensagem de mídia (imagem/áudio) como base64.
 * `rawMessage` é o objeto `data.messages[0]` (ou `data`) recebido no webhook —
 * a Evolution usa a `key.id` dele para localizar a mídia. Nunca lança: devolve
 * null se não conseguir (mídia expirada, endpoint indisponível, etc.).
 */
export async function getMediaBase64(
  instance: string,
  rawMessage: unknown
): Promise<{ base64: string; mimetype: string } | null> {
  try {
    const data = await call<Record<string, unknown>>(
      "POST",
      `/chat/getBase64FromMediaMessage/${encodeURIComponent(instance)}`,
      { message: rawMessage, convertToMp4: false }
    );
    const base64 = typeof data?.base64 === "string" ? data.base64 : null;
    const mimetype = typeof data?.mimetype === "string" ? data.mimetype : "";
    return base64 ? { base64, mimetype } : null;
  } catch (e) {
    console.error("[evolution] getMediaBase64", e);
    return null;
  }
}

/** Envia a localização nativa do WhatsApp (o pino do mapa). */
export async function sendLocation(
  instance: string,
  number: string,
  loc: { latitude: number; longitude: number; name?: string; address?: string }
): Promise<void> {
  await call("POST", `/message/sendLocation/${encodeURIComponent(instance)}`, {
    number: number.replace(/\D/g, ""),
    name: loc.name ?? "",
    address: loc.address ?? "",
    latitude: loc.latitude,
    longitude: loc.longitude,
  });
}

/** Envia uma mídia por URL (foto, por padrão) com legenda opcional. */
export async function sendMedia(
  instance: string,
  number: string,
  media: {
    url: string;
    caption?: string;
    mediatype?: "image" | "video" | "document";
    /** Nome do arquivo mostrado no anexo (útil em documentos, ex.: catálogo.pdf). */
    fileName?: string;
    /** MIME do arquivo. Documentos no Evolution v2 exigem (ex.: application/pdf). */
    mimetype?: string;
  }
): Promise<void> {
  await call("POST", `/message/sendMedia/${encodeURIComponent(instance)}`, {
    number: number.replace(/\D/g, ""),
    mediatype: media.mediatype ?? "image",
    media: media.url,
    caption: media.caption ?? "",
    ...(media.fileName ? { fileName: media.fileName } : {}),
    ...(media.mimetype ? { mimetype: media.mimetype } : {}),
  });
}
