import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { conversationsFromTokens, includedTokensForPlan } from "@/lib/aiCredits";

export type StoreRow = {
  id: string;
  user_id: string;
  name: string;
  slug: string;
  phone: string | null;
  logo: string | null;
  created_at: string;
};

export type SubscriptionRow = {
  id: string;
  store_id: string;
  plan_id: string | null;
  status: string;
  billing_cycle: string;
  amount: number | string | null;
  started_at: string | null;
  expires_at: string | null;
  notes: string | null;
  gateway: string | null;
  gateway_subscription_id: string | null;
  gateway_status: string | null;
  payer_email: string | null;
  created_at: string;
  updated_at: string;
};

export type PaymentRow = {
  id: string;
  store_id: string;
  amount: number | string;
  method: string | null;
  paid_at: string | null;
  period_end: string | null;
  notes: string | null;
  created_at: string;
};

export type PlanRow = {
  id: string;
  title: string;
  description: string | null;
  monthly: number | string;
  features: string[] | null;
  accent: string;
  icon: string;
  highlight: boolean;
  sort_order: number;
  active: boolean;
};

/** Consumo/saldo da IA de uma loja, em conversas (1 conversa ≈ 80 mil tokens). */
export type AdminClientAi = {
  /** Conversas ainda disponíveis (franquia restante + créditos). */
  conversationsLeft: number;
  /** Conversas gastas no ciclo atual (mês) — "quanto gastou este mês". */
  usedConversations: number;
  /** Créditos comprados/creditados ainda disponíveis. */
  creditConversations: number;
  /** Franquia mensal do plano. */
  includedConversations: number;
};

export type AdminClient = {
  store: StoreRow;
  ownerEmail: string | null;
  subscription: SubscriptionRow | null;
  planTitle: string | null;
  ai: AdminClientAi | null;
};

type AiCreditRow = {
  store_id: string;
  cycle_start: string;
  included_tokens: number;
  used_tokens: number;
  credit_tokens: number;
};

/** Mesmo ano-mês? (o ciclo da franquia renova por mês-calendário). */
function isSameMonthUtc(dateStr: string | null, now: Date): boolean {
  if (!dateStr) return false;
  const d = new Date(`${dateStr}T00:00:00Z`);
  return (
    d.getUTCFullYear() === now.getUTCFullYear() &&
    d.getUTCMonth() === now.getUTCMonth()
  );
}

/**
 * Converte a linha bruta de `store_ai_credits` em conversas, sem escrever no banco
 * (a renovação real do ciclo acontece quando a loja usa a IA). Se o ciclo virou o
 * mês, trata a franquia como renovada (consumo do mês = 0).
 */
function aiFromRow(
  row: AiCreditRow | undefined,
  planId: string | null,
  now: Date
): AdminClientAi | null {
  if (!row) return null;
  const included = includedTokensForPlan(planId);
  const usedTokens = isSameMonthUtc(row.cycle_start, now) ? row.used_tokens : 0;
  const creditTokens = Math.max(0, row.credit_tokens);
  const available = Math.max(0, included - usedTokens) + creditTokens;
  return {
    conversationsLeft: conversationsFromTokens(available),
    usedConversations: conversationsFromTokens(usedTokens),
    creditConversations: conversationsFromTokens(creditTokens),
    includedConversations: conversationsFromTokens(included),
  };
}

function toNumber(v: number | string | null | undefined): number {
  if (v == null) return 0;
  return typeof v === "string" ? Number(v) || 0 : v;
}

/** Map user_id -> email usando o admin auth (service role). */
async function ownerEmailMap(
  db: ReturnType<typeof createAdminSupabase>
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!db) return map;
  // listUsers é paginado (default 50). Buscamos até 1000 (20 páginas).
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 50 });
    if (error || !data?.users?.length) break;
    for (const u of data.users) {
      if (u.email) map.set(u.id, u.email);
    }
    if (data.users.length < 50) break;
  }
  return map;
}

/** Lista todas as lojas com a respectiva assinatura e o e-mail do dono. */
export async function getClients(): Promise<AdminClient[]> {
  const db = createAdminSupabase();
  if (!db) return [];

  const [{ data: stores }, { data: subs }, { data: plans }, aiCredits, emails] = await Promise.all([
    db
      .from("stores")
      .select("id, user_id, name, slug, phone, logo, created_at")
      .order("created_at", { ascending: false }),
    db.from("subscriptions").select("*"),
    db.from("plans").select("id, title"),
    // Tolera a tabela ausente (migration de créditos não aplicada) → sem dados de IA.
    db
      .from("store_ai_credits")
      .select("store_id, cycle_start, included_tokens, used_tokens, credit_tokens")
      .then((r) => (r.error ? [] : ((r.data as AiCreditRow[] | null) ?? []))),
    ownerEmailMap(db),
  ]);

  const subByStore = new Map<string, SubscriptionRow>();
  for (const s of (subs as SubscriptionRow[] | null) ?? []) {
    subByStore.set(s.store_id, s);
  }

  const planTitleById = new Map<string, string>();
  for (const p of (plans as { id: string; title: string }[] | null) ?? []) {
    planTitleById.set(p.id, p.title);
  }

  const aiByStore = new Map<string, AiCreditRow>();
  for (const row of aiCredits) {
    aiByStore.set(row.store_id, row);
  }

  const now = new Date();
  return ((stores as StoreRow[] | null) ?? []).map((store) => {
    const subscription = subByStore.get(store.id) ?? null;
    return {
      store,
      ownerEmail: emails.get(store.user_id) ?? null,
      subscription,
      planTitle: subscription?.plan_id ? planTitleById.get(subscription.plan_id) ?? null : null,
      ai: aiFromRow(aiByStore.get(store.id), subscription?.plan_id ?? null, now),
    };
  });
}

/** Detalhe de um cliente: loja, dono, assinatura e histórico de pagamentos. */
export async function getClient(storeId: string): Promise<
  | {
      store: StoreRow;
      ownerEmail: string | null;
      subscription: SubscriptionRow | null;
      payments: PaymentRow[];
    }
  | null
> {
  const db = createAdminSupabase();
  if (!db) return null;

  const { data: store } = await db
    .from("stores")
    .select("id, user_id, name, slug, phone, logo, created_at")
    .eq("id", storeId)
    .maybeSingle();

  if (!store) return null;

  const [{ data: subscription }, { data: payments }, emails] = await Promise.all([
    db.from("subscriptions").select("*").eq("store_id", storeId).maybeSingle(),
    db
      .from("payments")
      .select("*")
      .eq("store_id", storeId)
      .order("paid_at", { ascending: false }),
    ownerEmailMap(db),
  ]);

  return {
    store: store as StoreRow,
    ownerEmail: emails.get((store as StoreRow).user_id) ?? null,
    subscription: (subscription as SubscriptionRow | null) ?? null,
    payments: (payments as PaymentRow[] | null) ?? [],
  };
}

/** Todos os planos (inclui inativos), para o editor do admin. */
export async function getAllPlans(): Promise<PlanRow[]> {
  const db = createAdminSupabase();
  if (!db) return [];
  const { data } = await db
    .from("plans")
    .select("*")
    .order("sort_order", { ascending: true });
  return (data as PlanRow[] | null) ?? [];
}

/** Medição REAL do consumo da IA (da tabela de telemetria `ai_usage_events`). */
export type AiUsageSummary = {
  /** Houve dados no período (tabela existe e teve respostas). */
  measured: boolean;
  /** Janela em dias. */
  days: number;
  /** Respostas da IA que gastaram tokens. */
  responses: number;
  /** Conversas distintas (loja + telefone do cliente). */
  conversations: number;
  /** Tokens reais somados no período. */
  totalTokens: number;
  /** Média de tokens por resposta da IA. */
  avgTokensPerResponse: number;
  /** Média de tokens por conversa (cliente atendido). */
  avgTokensPerConversation: number;
  /** Pela média real, quantas conversas os 80 mi de tokens (IA Completo) rendem. */
  conversationsPer80M: number;
  /** Qual fração dos 80 mil tokens "reservados" por conversa é usada de fato (%). */
  usageVsBudgetPct: number;
};

const AI_BUDGET_PER_CONVERSATION = 80_000;
const AI_COMPLETO_MONTHLY_TOKENS = 80_000_000;

/**
 * Lê a telemetria real de consumo da IA e calcula as médias (por resposta e por
 * conversa). Tolera a tabela ausente (migration não aplicada) → `measured:false`.
 * Agrega em JS (o cliente supabase-js não faz GROUP BY direto); o volume no início
 * é pequeno, com teto de segurança na leitura.
 */
export async function getAiUsageSummary(
  opts: { days?: number; storeId?: string } = {}
): Promise<AiUsageSummary> {
  const days = opts.days ?? 30;
  const empty: AiUsageSummary = {
    measured: false,
    days,
    responses: 0,
    conversations: 0,
    totalTokens: 0,
    avgTokensPerResponse: 0,
    avgTokensPerConversation: 0,
    conversationsPer80M: 0,
    usageVsBudgetPct: 0,
  };
  const db = createAdminSupabase();
  if (!db) return empty;

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  let query = db
    .from("ai_usage_events")
    .select("store_id, customer_phone, tokens")
    .gte("created_at", since)
    .limit(100000);
  if (opts.storeId) query = query.eq("store_id", opts.storeId);
  const { data, error } = await query;
  if (error) return empty; // tabela ausente / erro → sem medição

  const rows =
    (data as { store_id: string; customer_phone: string | null; tokens: number }[] | null) ??
    [];
  if (rows.length === 0) return empty;

  let totalTokens = 0;
  const conversationSet = new Set<string>();
  for (const r of rows) {
    totalTokens += Math.max(0, r.tokens || 0);
    const phone = (r.customer_phone ?? "").trim();
    conversationSet.add(`${r.store_id}:${phone || "sem-telefone"}`);
  }
  const responses = rows.length;
  const conversations = conversationSet.size;
  const avgTokensPerResponse = responses > 0 ? Math.round(totalTokens / responses) : 0;
  const avgTokensPerConversation =
    conversations > 0 ? Math.round(totalTokens / conversations) : 0;

  return {
    measured: true,
    days,
    responses,
    conversations,
    totalTokens,
    avgTokensPerResponse,
    avgTokensPerConversation,
    conversationsPer80M:
      avgTokensPerConversation > 0
        ? Math.floor(AI_COMPLETO_MONTHLY_TOKENS / avgTokensPerConversation)
        : 0,
    usageVsBudgetPct:
      avgTokensPerConversation > 0
        ? Math.round((avgTokensPerConversation / AI_BUDGET_PER_CONVERSATION) * 100)
        : 0,
  };
}

/** Métricas de resumo para os cards do topo. */
export function summarize(clients: AdminClient[]) {
  const now = Date.now();
  let active = 0;
  let expired = 0;
  let mrr = 0;
  let aiUsed = 0;
  let aiLeft = 0;
  for (const c of clients) {
    if (c.ai) {
      aiUsed += c.ai.usedConversations;
      aiLeft += c.ai.conversationsLeft;
    }
    const sub = c.subscription;
    if (!sub) continue;
    // Vitalício nunca vence; conta como ativo, mas não entra na receita mensal.
    if (sub.status === "vitalicio") {
      active += 1;
      continue;
    }
    const exp = sub.expires_at ? new Date(sub.expires_at).getTime() : null;
    const isExpired = exp != null && exp < now;
    if (sub.status === "active" && !isExpired) {
      active += 1;
      mrr += toNumber(sub.amount);
    }
    if (isExpired || sub.status === "expired" || sub.status === "past_due") {
      expired += 1;
    }
  }
  return { total: clients.length, active, expired, mrr, aiUsed, aiLeft };
}
