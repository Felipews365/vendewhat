/**
 * Wrapper REST do Mercado Pago — usado só no servidor.
 *
 * Recebe o `accessToken` como argumento para servir tanto à SUA conta (créditos
 * da IA e mensalidade) quanto à conta de cada LOJISTA (gateway da loja, token
 * guardado em `store_payment_gateway`).
 *
 * Configurar no ambiente (só a sua conta):
 *   MP_ACCESS_TOKEN               -> app de Checkout Pro (recarga de créditos)
 *   MP_SUBSCRIPTION_ACCESS_TOKEN  -> app de Assinaturas (mensalidade/preapproval)
 *
 * São DOIS tokens porque o produto é escolha única por aplicação no MP: um app de
 * Checkout Pro responde UNAUTHORIZED em /preapproval, e vice-versa. Use `TEST-...`
 * para testar.
 */
import "server-only";

const API_BASE = "https://api.mercadopago.com";

/** Token da SUA conta para Checkout Pro (créditos). Lança se ausente. */
export function platformAccessToken(): string {
  const token = process.env.MP_ACCESS_TOKEN;
  if (!token) throw new Error("MP_ACCESS_TOKEN não configurada.");
  return token;
}

/** Indica se a sua conta MP está configurada para Checkout Pro (sem lançar). */
export function isMercadoPagoConfigured(): boolean {
  return Boolean(process.env.MP_ACCESS_TOKEN);
}

/** Token da SUA conta para assinaturas (preapproval). Lança se ausente. */
export function subscriptionAccessToken(): string {
  const token =
    process.env.MP_SUBSCRIPTION_ACCESS_TOKEN || process.env.MP_ACCESS_TOKEN;
  if (!token) throw new Error("MP_SUBSCRIPTION_ACCESS_TOKEN não configurada.");
  return token;
}

/** Indica se a assinatura automática está configurada (sem lançar). */
export function isSubscriptionConfigured(): boolean {
  return Boolean(
    process.env.MP_SUBSCRIPTION_ACCESS_TOKEN || process.env.MP_ACCESS_TOKEN
  );
}

/** Um token de teste do MP começa com "TEST-". */
export function isTestToken(token: string | null | undefined): boolean {
  return Boolean(token && token.startsWith("TEST-"));
}

async function mpCall<T>(
  accessToken: string,
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  body?: unknown
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
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
    let msg = `Mercado Pago erro ${res.status}`;
    if (parsed && typeof parsed === "object" && "message" in parsed) {
      const m = (parsed as { message: unknown }).message;
      if (m) msg = String(m);
    }
    throw new Error(msg);
  }
  return parsed as T;
}

export type MpUser = {
  id: number;
  nickname?: string;
  email?: string;
  site_id?: string;
};

/** Valida um token consultando o dono da conta. Usado ao conectar o lojista. */
export async function getMpUser(accessToken: string): Promise<MpUser> {
  return mpCall<MpUser>(accessToken, "GET", "/users/me");
}

// ---------------------------------------------------------------------------
// Assinatura recorrente (mensalidade do SaaS) — preapproval
// ---------------------------------------------------------------------------
export type PreapprovalInput = {
  reason: string;
  amount: number;
  payerEmail: string;
  backUrl: string;
  notificationUrl: string;
  externalReference: string;
};

export type Preapproval = {
  id: string;
  status: string; // pending | authorized | paused | cancelled
  init_point?: string;
  external_reference?: string;
  payer_email?: string;
  auto_recurring?: { transaction_amount?: number };
};

/** Cria uma assinatura mensal (R$/mês) e retorna o init_point para o checkout. */
export async function createPreapproval(
  accessToken: string,
  input: PreapprovalInput
): Promise<Preapproval> {
  return mpCall<Preapproval>(accessToken, "POST", "/preapproval", {
    reason: input.reason,
    external_reference: input.externalReference,
    payer_email: input.payerEmail,
    back_url: input.backUrl,
    notification_url: input.notificationUrl,
    status: "pending",
    auto_recurring: {
      frequency: 1,
      frequency_type: "months",
      transaction_amount: input.amount,
      currency_id: "BRL",
    },
  });
}

export async function getPreapproval(
  accessToken: string,
  id: string
): Promise<Preapproval> {
  return mpCall<Preapproval>(
    accessToken,
    "GET",
    `/preapproval/${encodeURIComponent(id)}`
  );
}

export async function cancelPreapproval(
  accessToken: string,
  id: string
): Promise<void> {
  await mpCall(accessToken, "PUT", `/preapproval/${encodeURIComponent(id)}`, {
    status: "cancelled",
  });
}

// ---------------------------------------------------------------------------
// Checkout de pedido (gateway da loja) — preference
// ---------------------------------------------------------------------------
export type PreferenceItem = {
  title: string;
  quantity: number;
  unitPrice: number;
};

export type PreferenceInput = {
  items: PreferenceItem[];
  externalReference: string;
  notificationUrl: string;
  backUrls: { success: string; failure: string; pending: string };
  payerName?: string;
};

export type Preference = {
  id: string;
  init_point?: string;
  sandbox_init_point?: string;
};

/** Cria a preference do pedido e retorna o init_point do checkout. */
export async function createPreference(
  accessToken: string,
  input: PreferenceInput
): Promise<Preference> {
  return mpCall<Preference>(accessToken, "POST", "/checkout/preferences", {
    items: input.items.map((it) => ({
      title: it.title.slice(0, 250),
      quantity: it.quantity,
      unit_price: it.unitPrice,
      currency_id: "BRL",
    })),
    external_reference: input.externalReference,
    notification_url: input.notificationUrl,
    back_urls: {
      success: input.backUrls.success,
      failure: input.backUrls.failure,
      pending: input.backUrls.pending,
    },
    auto_return: "approved",
    ...(input.payerName ? { payer: { name: input.payerName } } : {}),
  });
}

export type MpPayment = {
  id: number;
  status: string; // approved | pending | rejected | ...
  status_detail?: string;
  external_reference?: string;
  transaction_amount?: number;
  date_approved?: string | null;
};

export async function getPayment(
  accessToken: string,
  id: string
): Promise<MpPayment> {
  return mpCall<MpPayment>(
    accessToken,
    "GET",
    `/v1/payments/${encodeURIComponent(id)}`
  );
}
