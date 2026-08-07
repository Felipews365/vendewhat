/**
 * CRM — automações.
 *
 * Catálogo FIXO: o lojista liga/desliga e ajusta um número, nada mais. Um
 * construtor de regras ("se X e Y então Z") seria poderoso e ninguém do público
 * usaria — e regra malfeita em cima de WhatsApp vira mensagem errada para
 * cliente real.
 *
 * ⚠️ REGRA NÃO ENVIA MENSAGEM. Elas só etiquetam ou criam tarefa para o
 * lojista. Disparo automático já existe em três lugares (follow-up, pós-venda,
 * carrinho abandonado) e não pode ganhar um quarto caminho — seria impossível
 * saber por que um cliente recebeu o quê.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { listConversationTags, setConversationTags } from "@/lib/whatsappConfig";
import { joinTag, splitTag } from "@/lib/crm/tags";

export type RuleId =
  | "inativo"
  | "orcamento_parado"
  | "cliente_novo"
  | "recorrente";

export type AutomationRule = {
  id: RuleId;
  label: string;
  description: string;
  /** Nome do parâmetro em dias, quando a regra aceita ajuste. */
  daysParam?: { label: string; default: number; min: number; max: number };
};

export const CRM_AUTOMATIONS: AutomationRule[] = [
  {
    id: "inativo",
    label: "Marcar quem sumiu",
    description:
      "Cliente sem comprar nem falar há um tempo ganha a etiqueta “Inativo”, para você achar fácil e chamar de volta.",
    daysParam: { label: "Dias sem falar", default: 30, min: 7, max: 180 },
  },
  {
    id: "orcamento_parado",
    label: "Cobrar orçamento parado",
    description:
      "Cliente parado em “Orçamento enviado” vira uma tarefa para você retomar a conversa.",
    daysParam: { label: "Dias parado", default: 3, min: 1, max: 30 },
  },
  {
    id: "cliente_novo",
    label: "Etiquetar cliente novo",
    description: "Quem faz o primeiro pedido ganha a etiqueta “Cliente novo”.",
  },
  {
    id: "recorrente",
    label: "Etiquetar cliente recorrente",
    description:
      "Quem compra pela segunda vez ganha a etiqueta “Recorrente” — é a sua base fiel.",
  },
];

const RULE_IDS = new Set<string>(CRM_AUTOMATIONS.map((r) => r.id));

export function isRuleId(v: unknown): v is RuleId {
  return typeof v === "string" && RULE_IDS.has(v);
}

export function ruleById(id: string): AutomationRule | undefined {
  return CRM_AUTOMATIONS.find((r) => r.id === id);
}

/** Etiqueta que cada regra aplica (nome + cor, no formato "Nome¦cor"). */
const RULE_TAG: Partial<Record<RuleId, string>> = {
  inativo: joinTag("Inativo", "gray"),
  cliente_novo: joinTag("Cliente novo", "green"),
  recorrente: joinTag("Recorrente", "teal"),
};

/** Teto de etiquetas por conversa (igual ao sanitizeTags do servidor). */
const MAX_TAGS = 8;

/** Quantos clientes uma regra processa por passada do cron. */
const BATCH = 200;

type Admin = SupabaseClient;
type Row = Record<string, unknown>;

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

/**
 * Acrescenta a etiqueta sem apagar as que já existem e sem duplicar (a
 * comparação é pelo NOME, então "Inativo" salvo em outra cor não vira uma
 * segunda etiqueta). Devolve `true` se gravou.
 */
async function addTag(
  admin: Admin,
  storeId: string,
  waPhone: string,
  current: string[],
  rawTag: string
): Promise<boolean> {
  const name = splitTag(rawTag).name.toLowerCase();
  if (current.some((t) => splitTag(t).name.toLowerCase() === name)) return false;
  if (current.length >= MAX_TAGS) return false;
  await setConversationTags(admin, storeId, waPhone, [...current, rawTag]);
  return true;
}

/** Lojas que ligaram alguma automação. */
async function enabledRules(
  admin: Admin
): Promise<{ storeId: string; ruleId: RuleId; days: number }[]> {
  const { data } = await admin
    .from("crm_automations")
    .select("store_id, rule_id, enabled, params")
    .eq("enabled", true)
    .limit(500);

  const out: { storeId: string; ruleId: RuleId; days: number }[] = [];
  for (const r of (data ?? []) as Row[]) {
    const ruleId = String(r.rule_id ?? "");
    if (!isRuleId(ruleId)) continue;
    const rule = ruleById(ruleId);
    const params = (r.params ?? {}) as Row;
    const days =
      Number(params.days ?? rule?.daysParam?.default ?? 0) ||
      rule?.daysParam?.default ||
      0;
    out.push({ storeId: String(r.store_id), ruleId, days });
  }
  return out;
}

/**
 * Roda as automações. Chamada pelo cron que já existe
 * (/api/whatsapp/followups) — nada novo a agendar. Nunca envia mensagem.
 */
export async function runCrmAutomations(admin: Admin): Promise<number> {
  let applied = 0;

  let rules: { storeId: string; ruleId: RuleId; days: number }[];
  try {
    rules = await enabledRules(admin);
  } catch {
    // Migration da fase 4 pendente: o cron segue sem automações.
    return 0;
  }

  // Etiquetas são um objeto por loja: lê uma vez e reaproveita nas regras.
  const tagsCache = new Map<string, Record<string, string[]>>();
  const tagsFor = async (storeId: string) => {
    const hit = tagsCache.get(storeId);
    if (hit) return hit;
    let map: Record<string, string[]> = {};
    try {
      map = await listConversationTags(admin, storeId);
    } catch {
      map = {};
    }
    tagsCache.set(storeId, map);
    return map;
  };

  for (const { storeId, ruleId, days } of rules) {
    try {
      if (ruleId === "orcamento_parado") {
        applied += await runOrcamentoParado(admin, storeId, days);
        continue;
      }

      const tag = RULE_TAG[ruleId];
      if (!tag) continue;

      let q = admin
        .from("crm_customers")
        .select("id, wa_phone, phone_key, orders_count")
        .eq("store_id", storeId)
        .limit(BATCH);

      if (ruleId === "inativo") {
        const cut = daysAgoIso(days || 30);
        q = q
          .or(`last_order_at.is.null,last_order_at.lt.${cut}`)
          .or(`last_message_at.is.null,last_message_at.lt.${cut}`);
      } else if (ruleId === "cliente_novo") {
        q = q.eq("orders_count", 1);
      } else if (ruleId === "recorrente") {
        q = q.gte("orders_count", 2);
      }

      const { data } = await q;
      const map = await tagsFor(storeId);

      for (const c of (data ?? []) as Row[]) {
        const phone = String(c.wa_phone ?? c.phone_key ?? "").replace(/\D/g, "");
        if (!phone) continue;
        const current = map[phone] ?? [];
        const ok = await addTag(admin, storeId, phone, current, tag);
        if (ok) {
          map[phone] = [...current, tag]; // mantém o cache coerente no lote
          applied++;
        }
      }
    } catch (err) {
      console.error("[crm/automations]", ruleId, err);
    }
  }

  return applied;
}

/** Orçamento parado há N dias vira tarefa (uma por cliente, sem repetir). */
async function runOrcamentoParado(
  admin: Admin,
  storeId: string,
  days: number
): Promise<number> {
  const cut = daysAgoIso(days || 3);
  const { data } = await admin
    .from("crm_customers")
    .select("id, name, phone_key")
    .eq("store_id", storeId)
    .eq("stage", "orcamento")
    .lt("stage_changed_at", cut)
    .limit(BATCH);

  const customers = (data ?? []) as Row[];
  if (customers.length === 0) return 0;

  // Quem já tem tarefa em aberto desta regra não ganha outra.
  const ids = customers.map((c) => String(c.id));
  const { data: existing } = await admin
    .from("crm_tasks")
    .select("customer_id")
    .eq("store_id", storeId)
    .eq("source", "auto:orcamento_parado")
    .is("done_at", null)
    .in("customer_id", ids);

  const already = new Set(
    ((existing ?? []) as Row[]).map((r) => String(r.customer_id))
  );

  const rows = customers
    .filter((c) => !already.has(String(c.id)))
    .map((c) => ({
      store_id: storeId,
      customer_id: String(c.id),
      title: `Retomar orçamento com ${String(c.name ?? "").trim() || "o cliente"}`,
      due_at: new Date().toISOString(),
      source: "auto:orcamento_parado",
    }));

  if (rows.length === 0) return 0;
  await admin.from("crm_tasks").insert(rows);
  return rows.length;
}
