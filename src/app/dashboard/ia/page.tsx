import WhatsAppIaClient from "@/components/dashboard/WhatsAppIaClient";
import { loadCurrentSubscription } from "@/lib/plans.server";
import { planHasAi } from "@/lib/plans";

// "Configuração da IA": conexão do WhatsApp + configuração do atendente de IA.
// No plano "Sem IA" a aba de configuração some (só a Conexão fica) — ver
// WhatsAppIaClient. Sem assinatura assume que tem IA, igual ao aviso do topo.
export default async function IaPage() {
  const sub = await loadCurrentSubscription();
  return <WhatsAppIaClient view="ia" planHasAi={planHasAi(sub?.planId)} />;
}
