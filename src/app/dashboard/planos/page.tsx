import { loadPlans } from "@/lib/plans.server";
import PlansView from "./PlansView";

export const dynamic = "force-dynamic";

export default async function DashboardPlanosPage() {
  const plans = await loadPlans();
  return <PlansView plans={plans} />;
}
