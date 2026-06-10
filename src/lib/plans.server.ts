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
