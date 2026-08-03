/**
 * Motor de créditos da IA (Fase 1).
 *
 * Cada loja tem um saldo de tokens (tabela `store_ai_credits`). O painel mostra em
 * "conversas" (1 conversa ≈ TOKENS_PER_CONVERSATION), mas o desconto é por token
 * real gasto na OpenAI. O saldo disponível junta a franquia mensal do plano (que
 * renova a cada ciclo) com os créditos comprados (que acumulam e não expiram).
 *
 * Regra de consumo: desconta PRIMEIRO da franquia do mês, depois dos créditos.
 * Quando o saldo zera, a IA para de responder e o dono é avisado (Opção A).
 *
 * Antes do saldo vem o PLANO: no "Sem IA" a IA não atende de jeito nenhum
 * (`hasAiBalance`), mas nada é apagado — config, histórico e créditos ficam
 * guardados e voltam inteiros se o lojista fizer upgrade.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { planHasAi } from "@/lib/plans";

const TABLE = "store_ai_credits";

/** 1 conversa completa de um cliente ≈ 80 mil tokens (a IA relê o catálogo a cada resposta). */
export const TOKENS_PER_CONVERSATION = 80_000;

/** Avisa "saldo baixo" quando faltam ~20 conversas. */
export const LOW_BALANCE_CONVERSATIONS = 20;
export const LOW_BALANCE_TOKENS = LOW_BALANCE_CONVERSATIONS * TOKENS_PER_CONVERSATION;

/** Bônus de boas-vindas ao criar o saldo pela 1ª vez (~30 conversas grátis para testar). */
export const WELCOME_BONUS_CONVERSATIONS = 30;
export const WELCOME_BONUS_TOKENS = WELCOME_BONUS_CONVERSATIONS * TOKENS_PER_CONVERSATION;

/** Franquia mensal de tokens por plano (id do plano → tokens/mês). */
export const PLAN_MONTHLY_TOKENS: Record<string, number> = {
  // IA Completo (id legado "profissional"): 80 mi tokens ≈ 1.000 conversas/mês.
  profissional: 80_000_000,
  // IA Sob Medida (id legado "empresarial"): sem franquia — só créditos comprados.
  empresarial: 0,
  // Sem IA (id legado "essencial"): não usa IA.
  essencial: 0,
};

/**
 * Pacotes de recarga (mostrados ao lojista).
 *
 * **Repreçados quando o atendimento saiu do `gpt-4o-mini` para o `gpt-4.1-mini`.**
 * Os pacotes antigos (100/200/450/1.200 conversas nos mesmos preços) davam
 * ~R$ 0,21–0,30 por conversa; a conversa passou a custar ~R$ 0,23 de OpenAI, então
 * os dois maiores viravam **prejuízo** (o de R$ 250 perdia ~R$ 25 por venda).
 *
 * Base da conta (ver [aiPricing.ts](src/lib/aiPricing.ts)): o `gpt-4.1-mini` sai a
 * ~$0,52 por 1M tokens na mistura real (~90% entrada / 10% saída) ≈ **R$ 2,86**, ou
 * **~R$ 0,23 por conversa** de 80 mil tokens. Os preços em reais foram **mantidos**
 * (R$ 30/50/100/250) e o que mudou foi o **número de conversas** — assim os checkouts
 * do Mercado Pago e o `findPackage(brl)` continuam valendo, sem migração de nada.
 *
 * Margem-alvo: **≥50%** em todos, com desconto por volume honesto (R$ 0,60 → R$ 0,46
 * por conversa). Fica abaixo dos R$ 0,50/conversa do plano IA Completo (R$ 499,90 por
 * 80 mi tokens), então recarregar continua valendo a pena para o lojista.
 *
 * ⚠️ Se o preço da OpenAI ou o câmbio (`AI_USD_BRL`) mudar, refaça a conta: o custo
 * por conversa é `custo_por_1M × 0,08`.
 */
export const CREDIT_PACKAGES = [
  // R$ 0,60/conversa — custo ~R$ 11,44 → margem ~62%
  { brl: 30, conversations: 50, tokens: 4_000_000 },
  // R$ 0,50/conversa — custo ~R$ 22,88 → margem ~54%
  { brl: 50, conversations: 100, tokens: 8_000_000 },
  // R$ 0,48/conversa — custo ~R$ 48,05 → margem ~52%
  { brl: 100, conversations: 210, tokens: 16_800_000 },
  // R$ 0,46/conversa — custo ~R$ 123,55 → margem ~51%
  { brl: 250, conversations: 540, tokens: 43_200_000 },
] as const;

export function includedTokensForPlan(planId: string | null | undefined): number {
  if (!planId) return 0;
  return PLAN_MONTHLY_TOKENS[planId] ?? 0;
}

export type CreditPackage = (typeof CREDIT_PACKAGES)[number];

/** Encontra um pacote de recarga pelo valor em reais (evita confiar em preço vindo do cliente). */
export function findPackage(brl: number): CreditPackage | null {
  return CREDIT_PACKAGES.find((p) => p.brl === brl) ?? null;
}

/** Por que a IA não pode responder (`null` = pode). */
export type AiBlockReason = "no_ai_plan" | "empty" | null;

export type CreditState = {
  storeId: string;
  cycleStart: string; // YYYY-MM-DD
  /** O plano da loja inclui IA (ver `planHasAi` em plans.ts). */
  planHasAi: boolean;
  includedTokens: number;
  usedTokens: number;
  creditTokens: number;
  /** Tokens disponíveis agora (franquia restante + créditos). */
  available: number;
  /** Estimativa de conversas restantes. */
  conversationsLeft: number;
  lowWarnedAt: string | null;
  emptyWarnedAt: string | null;
};

type Row = {
  store_id: string;
  cycle_start: string;
  included_tokens: number;
  used_tokens: number;
  credit_tokens: number;
  low_warned_at: string | null;
  empty_warned_at: string | null;
  updated_at?: string;
};

function availableFrom(included: number, used: number, credit: number): number {
  return Math.max(0, included - used) + Math.max(0, credit);
}

export function conversationsFromTokens(tokens: number): number {
  return Math.max(0, Math.floor(tokens / TOKENS_PER_CONVERSATION));
}

function toState(row: Row, planHasAi: boolean): CreditState {
  const available = availableFrom(row.included_tokens, row.used_tokens, row.credit_tokens);
  return {
    storeId: row.store_id,
    cycleStart: row.cycle_start,
    planHasAi,
    includedTokens: row.included_tokens,
    usedTokens: row.used_tokens,
    creditTokens: row.credit_tokens,
    available,
    conversationsLeft: conversationsFromTokens(available),
    lowWarnedAt: row.low_warned_at,
    emptyWarnedAt: row.empty_warned_at,
  };
}

/** Lê o plano da loja (para saber a franquia mensal). */
async function getStorePlanId(
  admin: SupabaseClient,
  storeId: string
): Promise<string | null> {
  const { data } = await admin
    .from("subscriptions")
    .select("plan_id")
    .eq("store_id", storeId)
    .maybeSingle();
  const planId = (data as { plan_id?: string | null } | null)?.plan_id;
  return typeof planId === "string" ? planId : null;
}

/**
 * O plano da loja inclui IA? Atalho para os crons pularem a loja cedo, sem
 * carregar/criar o saldo — as automações (follow-up, pós-venda, carrinho) são do
 * plano com IA, inclusive as de mensagem fixa, que não custam token.
 */
export async function storePlanHasAi(
  admin: SupabaseClient,
  storeId: string
): Promise<boolean> {
  return planHasAi(await getStorePlanId(admin, storeId));
}

/** Mesmo ano-mês? (o ciclo renova por mês-calendário). */
function sameMonth(dateStr: string, now: Date): boolean {
  const d = new Date(`${dateStr}T00:00:00Z`);
  return (
    d.getUTCFullYear() === now.getUTCFullYear() &&
    d.getUTCMonth() === now.getUTCMonth()
  );
}

function todayIso(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/**
 * Garante que existe a linha de créditos da loja, renova o ciclo quando vira o mês
 * e mantém a franquia sincronizada com o plano atual. Devolve o estado atual.
 */
export async function loadCredits(
  admin: SupabaseClient,
  storeId: string
): Promise<CreditState> {
  const now = new Date();
  const { data } = await admin.from(TABLE).select("*").eq("store_id", storeId).maybeSingle();
  const planId = await getStorePlanId(admin, storeId);
  const included = includedTokensForPlan(planId);
  const hasAiPlan = planHasAi(planId);

  // Primeira vez: cria a linha com a franquia do plano + bônus de boas-vindas.
  if (!data) {
    const row: Row = {
      store_id: storeId,
      cycle_start: todayIso(now),
      included_tokens: included,
      used_tokens: 0,
      credit_tokens: WELCOME_BONUS_TOKENS,
      low_warned_at: null,
      empty_warned_at: null,
    };
    await admin.from(TABLE).insert(row);
    return toState(row, hasAiPlan);
  }

  const row = data as Row;
  const patch: Partial<Row> = {};

  // Virou o mês → renova a franquia e zera o consumo (créditos comprados ficam).
  if (!sameMonth(row.cycle_start, now)) {
    patch.cycle_start = todayIso(now);
    patch.used_tokens = 0;
    patch.included_tokens = included;
    patch.low_warned_at = null;
    patch.empty_warned_at = null;
  } else if (row.included_tokens !== included) {
    // Plano mudou no meio do mês → ajusta a franquia.
    patch.included_tokens = included;
  }

  if (Object.keys(patch).length > 0) {
    patch.updated_at = new Date().toISOString();
    await admin.from(TABLE).update(patch).eq("store_id", storeId);
    Object.assign(row, patch);
  }

  return toState(row, hasAiPlan);
}

/**
 * A IA pode responder? Barra por PLANO antes do saldo: no "Sem IA" a IA não
 * atende nem com crédito (o bônus de boas-vindas viraria IA vitalícia de graça,
 * pois crédito não expira). Os créditos ficam **guardados** para quando o lojista
 * fizer upgrade — nada é gasto nem apagado enquanto está bloqueado.
 */
export async function hasAiBalance(
  admin: SupabaseClient,
  storeId: string
): Promise<{ ok: boolean; state: CreditState; reason: AiBlockReason }> {
  const state = await loadCredits(admin, storeId);
  if (!state.planHasAi) return { ok: false, state, reason: "no_ai_plan" };
  if (state.available <= 0) return { ok: false, state, reason: "empty" };
  return { ok: true, state, reason: null };
}

export type ConsumeResult = {
  state: CreditState;
  /** Cruzou para saldo zero agora (e ainda não avisou) → avisar o dono. */
  justEmptied: boolean;
  /** Entrou na faixa de saldo baixo agora (e ainda não avisou) → avisar o dono. */
  justLow: boolean;
};

/** Origem do gasto de tokens (para a telemetria do painel admin). */
export type AiUsageKind = "reply" | "followup" | "postsale" | "cart";

/**
 * Contexto do gasto, gravado só como telemetria. `model`/`inputTokens`/
 * `outputTokens` vêm do `ReplyResult` e alimentam o custo em R$ do painel admin
 * (ver [aiPricing.ts](src/lib/aiPricing.ts)); o desconto de saldo não os usa.
 */
export type AiUsageMeta = {
  customerPhone?: string | null;
  kind?: AiUsageKind;
  model?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
};

/**
 * Grava uma linha de telemetria por resposta da IA (tokens reais gastos), para o
 * painel admin medir o consumo real por resposta/conversa. É só histórico — não
 * afeta o saldo. Tolera a tabela ausente (migration não aplicada): ignora o erro.
 */
async function logAiUsage(
  admin: SupabaseClient,
  storeId: string,
  tokens: number,
  meta?: AiUsageMeta
): Promise<void> {
  if (tokens <= 0) return;
  const base = {
    store_id: storeId,
    customer_phone: meta?.customerPhone ?? null,
    kind: meta?.kind ?? "reply",
    tokens,
  };
  try {
    const { error } = await admin.from("ai_usage_events").insert({
      ...base,
      // Colunas da migration de custo (ai-usage-cost). Sem elas não dá para
      // converter tokens em reais, já que atendimento e crons usam modelos de
      // preços diferentes e a saída custa 4x a entrada.
      model: meta?.model ?? null,
      input_tokens: meta?.inputTokens ?? null,
      output_tokens: meta?.outputTokens ?? null,
    });
    if (!error) return;
    // Migration de custo não aplicada → regrava só com as colunas antigas, para
    // não perder a telemetria de tokens que já funcionava.
    await admin.from("ai_usage_events").insert(base);
  } catch {
    // Tabela pode não existir ainda — telemetria é opcional, nunca quebra o fluxo.
  }
}

/**
 * Desconta os tokens gastos (franquia primeiro, depois créditos) e sinaliza se é
 * hora de avisar o dono (saldo baixo / esgotado). Marca os avisos para não repetir.
 */
export async function consumeTokens(
  admin: SupabaseClient,
  storeId: string,
  tokens: number,
  meta?: AiUsageMeta
): Promise<ConsumeResult> {
  const before = await loadCredits(admin, storeId);
  const spend = Math.max(0, Math.round(tokens));

  const remainingIncluded = Math.max(0, before.includedTokens - before.usedTokens);
  const fromIncluded = Math.min(spend, remainingIncluded);
  const fromCredit = spend - fromIncluded;
  const newUsed = before.usedTokens + fromIncluded;
  const newCredit = Math.max(0, before.creditTokens - fromCredit);

  const availableBefore = before.available;
  const availableAfter = availableFrom(before.includedTokens, newUsed, newCredit);

  const justEmptied =
    availableBefore > 0 && availableAfter <= 0 && !before.emptyWarnedAt;
  const justLow =
    availableAfter > 0 &&
    availableAfter <= LOW_BALANCE_TOKENS &&
    availableBefore > LOW_BALANCE_TOKENS &&
    !before.lowWarnedAt;

  const nowIso = new Date().toISOString();
  const patch: Partial<Row> = {
    used_tokens: newUsed,
    credit_tokens: newCredit,
    updated_at: nowIso,
  };
  if (justEmptied) patch.empty_warned_at = nowIso;
  if (justLow) patch.low_warned_at = nowIso;

  await admin.from(TABLE).update(patch).eq("store_id", storeId);
  await logAiUsage(admin, storeId, spend, meta);

  const state: CreditState = {
    ...before,
    usedTokens: newUsed,
    creditTokens: newCredit,
    available: availableAfter,
    conversationsLeft: conversationsFromTokens(availableAfter),
    lowWarnedAt: justLow ? nowIso : before.lowWarnedAt,
    emptyWarnedAt: justEmptied ? nowIso : before.emptyWarnedAt,
  };
  return { state, justEmptied, justLow };
}

/** Marca que o dono já foi avisado do saldo esgotado (para não repetir a cada mensagem). */
export async function markEmptyWarned(
  admin: SupabaseClient,
  storeId: string
): Promise<void> {
  const nowIso = new Date().toISOString();
  await admin
    .from(TABLE)
    .update({ empty_warned_at: nowIso, updated_at: nowIso })
    .eq("store_id", storeId);
}

/**
 * Credita tokens comprados (recarga) — acumula e limpa os avisos, já que o saldo
 * voltou. Na Fase 1 é chamado manualmente (teste); na Fase 2, pelo webhook do MP.
 */
export async function addCredits(
  admin: SupabaseClient,
  storeId: string,
  tokens: number
): Promise<CreditState> {
  const before = await loadCredits(admin, storeId);
  const add = Math.max(0, Math.round(tokens));
  const newCredit = before.creditTokens + add;
  await admin
    .from(TABLE)
    .update({
      credit_tokens: newCredit,
      low_warned_at: null,
      empty_warned_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("store_id", storeId);
  return {
    ...before,
    creditTokens: newCredit,
    available: availableFrom(before.includedTokens, before.usedTokens, newCredit),
    conversationsLeft: conversationsFromTokens(
      availableFrom(before.includedTokens, before.usedTokens, newCredit)
    ),
    lowWarnedAt: null,
    emptyWarnedAt: null,
  };
}
