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
    monthly: 69.9,
    description:
      "A opção perfeita para quem precisa criar um catálogo virtual simples e receber pedidos pelo WhatsApp.",
    features: [
      "Recebimento de pedidos via WhatsApp",
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
    monthly: 99.9,
    description:
      "A melhor escolha para quem precisa de um e-commerce profissional, com recursos extras para profissionalizar a operação.",
    features: [
      "Todos os recursos do plano Essencial",
      "Recebimento por cartão e link de cobrança",
      "Conecte seu domínio (ex: sualoja.com.br)",
      "Cálculo do valor e prazo de entrega",
      "Criação de cupons de desconto",
      "Vídeo no produto",
    ],
    accent: "cyan",
    highlight: true,
    icon: "star",
  },
  {
    id: "empresarial",
    title: "Plano Empresarial",
    monthly: 165.9,
    description:
      "Ideal para empresas que possuem grandes demandas e precisam de recursos avançados de gestão e vendas.",
    features: [
      "Todos os recursos do plano Profissional",
      "Login para cliente acessar preços e pedidos",
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
