import { loadPlans, loadCurrentSubscription } from "@/lib/plans.server";
import PlansView from "./PlansView";

export const dynamic = "force-dynamic";

export default async function DashboardPlanosPage() {
  const [plans, current] = await Promise.all([
    loadPlans(),
    loadCurrentSubscription(),
  ]);
  return <PlansView plans={plans} current={current} />;
}
