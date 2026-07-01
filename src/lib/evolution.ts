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
      byEvents: false,
      base64: true,
      events: [...EVENTS],
    },
  });
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
  const number = ownerJid ? ownerJid.replace(/\D/g, "") || null : null;
  return { state, number };
}

/** Desconecta (logout) a instância — mantém a instância criada para reconectar depois. */
export async function logoutInstance(instance: string): Promise<void> {
  try {
    await call("DELETE", `/instance/logout/${encodeURIComponent(instance)}`);
  } catch {
    // Já desconectada — ignora.
  }
}

/** Envia uma mensagem de texto. `number` deve conter DDI + DDD + número (só dígitos). */
export async function sendText(
  instance: string,
  number: string,
  text: string
): Promise<void> {
  await call("POST", `/message/sendText/${encodeURIComponent(instance)}`, {
    number: number.replace(/\D/g, ""),
    text,
  });
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
  }
): Promise<void> {
  await call("POST", `/message/sendMedia/${encodeURIComponent(instance)}`, {
    number: number.replace(/\D/g, ""),
    mediatype: media.mediatype ?? "image",
    media: media.url,
    caption: media.caption ?? "",
  });
}
