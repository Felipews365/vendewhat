/**
 * Preço da IA (OpenAI) → custo em reais, para o painel do admin saber quanto
 * cada loja custa de verdade.
 *
 * Por que existe: desde a separação de modelos (`OPENAI_MODEL` no atendimento,
 * `OPENAI_MODEL_BASIC` nos crons/visão) o token não tem mais um preço único —
 * o mesmo total de tokens custa 2,6x mais no atendimento do que num follow-up.
 * Somar `tokens` e multiplicar por um número só mentiria sobre a margem.
 *
 * ⚠️ Os preços mudam sem aviso na OpenAI e o câmbio muda todo dia. Confira em
 * https://openai.com/api/pricing antes de tomar decisão de preço em cima disso.
 */

/** Preço por 1 milhão de tokens, em dólar. */
type ModelPrice = { input: number; output: number };

const MODEL_PRICES: Record<string, ModelPrice> = {
  "gpt-4.1-mini": { input: 0.4, output: 1.6 },
  "gpt-4.1-nano": { input: 0.1, output: 0.4 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gpt-4o": { input: 2.5, output: 10 },
};

/**
 * Preço usado quando o evento não diz o modelo — linhas gravadas ANTES da
 * migration que adicionou a coluna `model`. Naquela época tudo rodava no
 * `gpt-4o-mini`, então é ele o palpite certo para o histórico.
 */
const LEGACY_MODEL = "gpt-4o-mini";

/**
 * Quando o evento não separa entrada de saída (linhas antigas, que só tinham
 * `tokens`), assumimos esta fração de SAÍDA. O atendimento manda o catálogo
 * inteiro a cada resposta e responde poucas linhas, então a esmagadora maioria
 * é entrada — 10% de saída é a estimativa conservadora (erra para mais caro).
 */
const ASSUMED_OUTPUT_SHARE = 0.1;

/** De onde veio a cotação usada — o painel mostra isso para você saber se confia. */
export type UsdBrlRate = {
  /** Câmbio efetivo já com IOF + spread (é o que multiplica o custo). */
  rate: number;
  /** Cotação comercial pura, quando veio da API. */
  spot: number | null;
  source: "api" | "env" | "default";
  /** Quando a cotação foi lida (ISO). */
  fetchedAt: string | null;
};

/**
 * Multiplicador sobre a cotação comercial para chegar ao que você REALMENTE paga
 * num cartão brasileiro: **IOF de 3,38%** + spread do banco/emissor (2-4%).
 * Sem isso o painel subestimaria o custo em ~7%. Ajustável por `AI_USD_SPREAD`.
 *
 * O número exato está na sua fatura: divida o valor lançado em R$ pelo valor em
 * US$ da cobrança da OpenAI e compare com a cotação do dia.
 */
function spreadMultiplier(): number {
  const raw = Number(process.env.AI_USD_SPREAD);
  return Number.isFinite(raw) && raw > 0 ? raw : 1.07;
}

/** Câmbio fixo do ambiente (`AI_USD_BRL`), usado como rede de segurança. */
function envRate(): number | null {
  const raw = Number(process.env.AI_USD_BRL);
  return Number.isFinite(raw) && raw > 0 ? raw : null;
}

/** Fallback síncrono — `AI_USD_BRL`, ou 5,50 se nem isso houver. */
export function usdToBrlRate(): number {
  return envRate() ?? 5.5;
}

/**
 * Busca a cotação do dólar e devolve o câmbio **efetivo** (spot × IOF/spread).
 *
 * Usa a AwesomeAPI (gratuita, sem chave, cotação comercial do BC). O resultado é
 * cacheado por 6h pelo `fetch` do Next — o painel do admin não pode depender de
 * uma chamada externa a cada render, e a cotação não muda o suficiente para
 * justificar mais frequência.
 *
 * **Nunca lança:** timeout de 4s e, em qualquer falha, cai no `AI_USD_BRL` (e daí
 * no 5,50). Custo de IA é informativo — não vale derrubar o `/admin` por causa
 * de uma API de câmbio fora do ar. O `source` no retorno diz o que aconteceu.
 */
export async function fetchUsdBrlRate(): Promise<UsdBrlRate> {
  const fallback = (source: "env" | "default"): UsdBrlRate => ({
    rate: usdToBrlRate(),
    spot: null,
    source,
    fetchedAt: null,
  });

  try {
    const res = await fetch("https://economia.awesomeapi.com.br/json/last/USD-BRL", {
      signal: AbortSignal.timeout(4000),
      next: { revalidate: 21_600 }, // 6h
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as { USDBRL?: { bid?: string } };
    const spot = Number(json?.USDBRL?.bid);
    if (!Number.isFinite(spot) || spot <= 0) throw new Error("cotação inválida");
    return {
      rate: spot * spreadMultiplier(),
      spot,
      source: "api",
      fetchedAt: new Date().toISOString(),
    };
  } catch {
    return fallback(envRate() !== null ? "env" : "default");
  }
}

export type TokenUsage = {
  /** Modelo que gerou a resposta. Vazio/nulo = evento antigo (ver LEGACY_MODEL). */
  model?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  /** Total (`usage.total_tokens`). Usado quando não há a separação acima. */
  totalTokens: number;
};

/** Custo em DÓLARES de um gasto de tokens. Nunca negativo. */
export function costUsd(usage: TokenUsage): number {
  const price = MODEL_PRICES[(usage.model ?? "").trim()] ?? MODEL_PRICES[LEGACY_MODEL];
  const total = Math.max(0, usage.totalTokens || 0);

  // Com a separação real, cobra cada metade pelo seu preço.
  const hasSplit =
    (usage.inputTokens ?? null) !== null || (usage.outputTokens ?? null) !== null;
  const output = hasSplit
    ? Math.max(0, usage.outputTokens || 0)
    : Math.round(total * ASSUMED_OUTPUT_SHARE);
  const input = hasSplit ? Math.max(0, usage.inputTokens || 0) : total - output;

  return (input * price.input + output * price.output) / 1_000_000;
}

/**
 * Custo em REAIS de um gasto de tokens. O câmbio vem por parâmetro (e não de
 * dentro) porque a cotação é buscada **uma vez** por render do painel e reusada
 * em milhares de eventos — buscar por evento seria absurdo, e uma função
 * assíncrona aqui contaminaria toda a agregação.
 * Omitir o câmbio cai no `AI_USD_BRL`.
 */
export function costBrl(usage: TokenUsage, rate = usdToBrlRate()): number {
  return costUsd(usage) * rate;
}

/** Formata um valor em reais (aceita centavos de fração, ex.: R$ 0,0834). */
export function formatBrlCost(value: number): string {
  // Abaixo de R$ 1 o arredondamento em 2 casas esconde a diferença entre lojas.
  const digits = value > 0 && value < 1 ? 4 : 2;
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/** Lista dos modelos com preço conhecido (para a nota de rodapé do painel). */
export function pricedModels(): { model: string; input: number; output: number }[] {
  return Object.entries(MODEL_PRICES).map(([model, p]) => ({
    model,
    input: p.input,
    output: p.output,
  }));
}
