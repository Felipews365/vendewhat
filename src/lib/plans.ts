/** Catálogo de planos (landing + painel). Preços mensais em BRL; anual = −16% sobre 12× mensal. */
export type PlanAccent = "pink" | "cyan" | "purple";

export type PlanDefinition = {
  id: string;
  title: string;
  monthly: number;
  description: string;
  features: string[];
  accent: PlanAccent;
  highlight?: boolean;
  icon: "bolt" | "star" | "briefcase";
};

export const PLAN_ANNUAL_DISCOUNT = 0.16;

export const PLAN_CATALOG: PlanDefinition[] = [
  {
    id: "essencial",
    title: "Sem IA",
    monthly: 89.9,
    description:
      "A vitrine essencial para sua loja aparecer bem e vender mais.",
    features: [
      "Vitrine da loja",
      "Catálogo de produtos",
      "Link para WhatsApp",
      "Página de contato",
      "Localização da loja",
      "Suporte básico",
    ],
    accent: "pink",
    icon: "bolt",
  },
  {
    id: "profissional",
    title: "IA Completo",
    monthly: 500,
    description:
      "Atendimento inteligente com IA para responder rápido e vender melhor.",
    features: [
      "Tudo do plano Sem IA",
      "IA para tirar dúvidas dos clientes",
      "Respostas sobre valores e produtos",
      "Envio do link do catálogo",
      "Envio de catálogo em PDF",
      "Localização da loja pela IA",
      "Até 1.000 conversas com clientes por mês",
      "Ideal para atendimento frequente",
    ],
    accent: "cyan",
    highlight: true,
    icon: "star",
  },
  {
    id: "empresarial",
    title: "IA Sob Medida",
    monthly: 350,
    description:
      "IA personalizada para o seu negócio, com pagamento por uso.",
    features: [
      "Ajustes personalizados nas respostas",
      "Treinamento com dados da sua loja",
      "Configuração mais fina do fluxo",
      "Integrações específicas",
      "Suporte mais próximo",
      "Créditos pré-pagos para uso da IA",
      "Recarrega quando quiser, a partir de R$ 30",
      "Controle total do seu custo",
    ],
    accent: "purple",
    icon: "briefcase",
  },
];

export function formatBRL(value: number) {
  return value.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Valor mensal equivalente no ciclo anual (16% de desconto sobre o total anual). */
export function monthlyEquivalentAnnual(monthly: number) {
  return monthly * (1 - PLAN_ANNUAL_DISCOUNT);
}
