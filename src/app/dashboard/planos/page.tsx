import { loadPlans, loadCurrentSubscription } from "@/lib/plans.server";
import PlansView from "./PlansView";

export const dynamic = "force-dynamic";

// `?pagamento=` vem das back_urls do Mercado Pago (ver /api/billing/checkout):
// ok | pendente | falhou. Lido aqui e repassado para a view dar a resposta ao
// lojista — no Pix o MP não mostra "pagou" na tela dele, quem confirma é o webhook.
export default async function DashboardPlanosPage({
  searchParams,
}: {
  searchParams: { pagamento?: string };
}) {
  const [plans, current] = await Promise.all([
    loadPlans(),
    loadCurrentSubscription(),
  ]);
  return (
    <PlansView plans={plans} current={current} payment={searchParams.pagamento ?? null} />
  );
}
