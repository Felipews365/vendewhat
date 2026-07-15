import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import {
  PLAN_CATALOG,
  type PlanAccent,
  type PlanDefinition,
} from "@/lib/plans";

type PlanRow = {
  id: string;
  title: string;
  description: string | null;
  monthly: number | string;
  features: string[] | null;
  accent: string | null;
  icon: string | null;
  highlight: boolean | null;
  sort_order: number | null;
  active: boolean | null;
};

const VALID_ACCENTS: PlanAccent[] = ["pink", "cyan", "purple"];
const VALID_ICONS: PlanDefinition["icon"][] = ["bolt", "star", "briefcase"];

function rowToPlan(row: PlanRow): PlanDefinition {
  const accent = (
    VALID_ACCENTS.includes(row.accent as PlanAccent) ? row.accent : "pink"
  ) as PlanAccent;
  const icon = (
    VALID_ICONS.includes(row.icon as PlanDefinition["icon"]) ? row.icon : "bolt"
  ) as PlanDefinition["icon"];
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? "",
    monthly: typeof row.monthly === "string" ? Number(row.monthly) : row.monthly,
    features: Array.isArray(row.features) ? row.features : [],
    accent,
    icon,
    highlight: Boolean(row.highlight),
  };
}

/**
 * Carrega os planos da tabela `plans` (ordenados por sort_order).
 * Cai no catálogo estático (`PLAN_CATALOG`) se a tabela estiver vazia ou
 * der erro — assim a UI nunca quebra, mesmo antes de rodar a migration.
 */
export async function loadPlans(): Promise<PlanDefinition[]> {
  try {
    const supabase = await createServerSupabase();
    const { data, error } = await supabase
      .from("plans")
      .select(
        "id, title, description, monthly, features, accent, icon, highlight, sort_order, active"
      )
      .eq("active", true)
      .order("sort_order", { ascending: true });

    if (error || !data || data.length === 0) return PLAN_CATALOG;
    return (data as PlanRow[]).map(rowToPlan);
  } catch {
    return PLAN_CATALOG;
  }
}

export type CurrentSubscription = {
  planId: string | null;
  status: string | null;
  billingCycle: string | null;
  expiresAt: string | null;
  /**
   * Renova sozinha? Só o preapproval (assinatura recorrente) grava o
   * `gateway_subscription_id` — avulso e registro manual do admin ficam sem.
   * Derivado no servidor: o id do gateway não precisa ir ao browser.
   */
  recurring: boolean;
};

/**
 * Lê a assinatura da loja do usuário logado (RLS: o dono lê a própria).
 * Devolve `null` se não houver sessão, loja ou assinatura.
 */
export async function loadCurrentSubscription(): Promise<CurrentSubscription | null> {
  try {
    const supabase = await createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    const { data: store } = await supabase
      .from("stores")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!store) return null;

    const { data: sub } = await supabase
      .from("subscriptions")
      .select("plan_id, status, billing_cycle, expires_at, gateway_subscription_id")
      .eq("store_id", (store as { id: string }).id)
      .maybeSingle();
    if (!sub) return null;

    const s = sub as {
      plan_id: string | null;
      status: string | null;
      billing_cycle: string | null;
      expires_at: string | null;
      gateway_subscription_id: string | null;
    };
    return {
      planId: s.plan_id,
      status: s.status,
      billingCycle: s.billing_cycle,
      expiresAt: s.expires_at,
      recurring: Boolean(s.gateway_subscription_id),
    };
  } catch {
    return null;
  }
}
