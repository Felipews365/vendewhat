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
    title: "Plano Essencial",
    monthly: 89.9,
    description:
      "A opção perfeita para quem precisa criar um catálogo virtual simples e receber pedidos pelo WhatsApp.",
    features: [
      "1 número de WhatsApp para atendimento",
      "Cadastro de produtos ilimitados",
      "Pedidos ilimitados sem taxas",
      "Controle de pedidos e clientes",
      "Pagamento via PIX",
    ],
    accent: "pink",
    icon: "bolt",
  },
  {
    id: "profissional",
    title: "Plano Profissional",
    monthly: 299,
    description:
      "A melhor escolha para quem quer uma IA atendendo no WhatsApp e receber pagamentos direto pela plataforma.",
    features: [
      "Todos os recursos do plano Essencial",
      "Atendimento por IA no WhatsApp 24h",
      "Gateway de pagamento (cartão, PIX e link de cobrança)",
      "1 número de WhatsApp para atendimento",
      "Conecte seu domínio (ex: sualoja.com.br)",
      "Cálculo do valor e prazo de entrega",
      "Criação de cupons de desconto",
      "Vídeo nos produtos (limitado)",
    ],
    accent: "cyan",
    highlight: true,
    icon: "star",
  },
  {
    id: "empresarial",
    title: "Plano Empresarial",
    monthly: 599,
    description:
      "Ideal para empresas com grande demanda que precisam de CRM, IA e múltiplos atendentes no WhatsApp.",
    features: [
      "Todos os recursos do plano Profissional",
      "CRM de clientes completo",
      "Até 3 números de WhatsApp para atendimento",
      "Vídeos ilimitados nos produtos",
      "Recuperação de carrinhos abandonados",
      "API ilimitada e integração com ERP",
      "Cadastro de equipe e permissões",
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
