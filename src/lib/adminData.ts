import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";

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

export type AdminClient = {
  store: StoreRow;
  ownerEmail: string | null;
  subscription: SubscriptionRow | null;
  planTitle: string | null;
};

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

  const [{ data: stores }, { data: subs }, { data: plans }, emails] = await Promise.all([
    db
      .from("stores")
      .select("id, user_id, name, slug, phone, logo, created_at")
      .order("created_at", { ascending: false }),
    db.from("subscriptions").select("*"),
    db.from("plans").select("id, title"),
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

  return ((stores as StoreRow[] | null) ?? []).map((store) => {
    const subscription = subByStore.get(store.id) ?? null;
    return {
      store,
      ownerEmail: emails.get(store.user_id) ?? null,
      subscription,
      planTitle: subscription?.plan_id ? planTitleById.get(subscription.plan_id) ?? null : null,
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

/** Métricas de resumo para os cards do topo. */
export function summarize(clients: AdminClient[]) {
  const now = Date.now();
  let active = 0;
  let expired = 0;
  let mrr = 0;
  for (const c of clients) {
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
  return { total: clients.length, active, expired, mrr };
}
