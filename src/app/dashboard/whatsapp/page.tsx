import WhatsAppIaClient from "@/components/dashboard/WhatsAppIaClient";

// "Atendimento": só as conversas ao vivo (conexão e config. IA ficam em /dashboard/ia).
export default function AtendimentoPage() {
  return <WhatsAppIaClient view="atendimento" />;
}
