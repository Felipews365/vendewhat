/**
 * CRM — leitura e sincronização da base de clientes.
 *
 * Usa um SupabaseClient (o admin/service-role) — só no servidor, como os
 * helpers de src/lib/whatsappConfig.ts, e com a mesma assinatura `(db, storeId, …)`.
 *
 * Tudo aqui TOLERA a migration ausente: se `crm_customers` não existir, as
 * leituras devolvem vazio e as escritas viram no-op. O atendimento nunca pode
 * cair porque uma migration do CRM não foi rodada.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { isMissingColumnError } from "@/lib/dbColumnErrors";
import { crmPhoneKey, crmPhoneVariants, isCrmPhoneUsable } from "@/lib/crm/phone";
import {
  inactiveDaysFor,
  type SegmentId,
  type SortId,
} from "@/lib/crm/segments";
import { DEFAULT_STAGE, isStageId, type StageId } from "@/lib/crm/stages";
import { normalizeSearch } from "@/lib/crm/tags";

const TABLE = "crm_customers";

export type CrmCustomer = {
  id: string;
  phoneKey: string;
  phoneTail: string;
  waPhone: string;
  name: string;
  firstSeenAt: string;
  lastMessageAt: string | null;
  lastOrderAt: string | null;
  ordersCount: number;
  totalSpent: number;
  /** Etapa do funil. Sem a migration da fase 2, todo mundo cai no default. */
  stage: StageId;
  stageChangedAt: string | null;
  /** Pediu para não receber campanhas (fase 3). */
  optedOutAt: string | null;
  lastCampaignAt: string | null;
};

type Row = Record<string, unknown>;

function rowToCustomer(r: Row): CrmCustomer {
  const rawStage = String(r.stage ?? "");
  return {
    id: String(r.id ?? ""),
    phoneKey: String(r.phone_key ?? ""),
    phoneTail: String(r.phone_tail ?? ""),
    waPhone: String(r.wa_phone ?? ""),
    name: String(r.name ?? ""),
    firstSeenAt: String(r.first_seen_at ?? ""),
    lastMessageAt: (r.last_message_at as string | null) ?? null,
    lastOrderAt: (r.last_order_at as string | null) ?? null,
    ordersCount: Number(r.orders_count ?? 0),
    totalSpent: Number(r.total_spent ?? 0),
    stage: isStageId(rawStage) ? rawStage : DEFAULT_STAGE,
    stageChangedAt: (r.stage_changed_at as string | null) ?? null,
    optedOutAt: (r.opted_out_at as string | null) ?? null,
    lastCampaignAt: (r.last_campaign_at as string | null) ?? null,
  };
}

const BASE_COLS =
  "id, phone_key, phone_tail, wa_phone, name, first_seen_at, last_message_at, last_order_at, orders_count, total_spent";
const STAGE_COLS = "stage, stage_changed_at";
const CAMPAIGN_COLS = "opted_out_at, last_campaign_at";

/**
 * As migrations das fases 2 e 3 podem não ter sido rodadas. Em vez de derrubar
 * a lista inteira, a primeira falha por coluna ausente desliga aquele grupo de
 * colunas para o resto do processo — mesmo espírito do `isMissingColumnError`
 * usado nas páginas de produto.
 */
let stageAvailable = true;
let campaignAvailable = true;

function selectCols(): string {
  return [
    BASE_COLS,
    stageAvailable ? STAGE_COLS : "",
    campaignAvailable ? CAMPAIGN_COLS : "",
  ]
    .filter(Boolean)
    .join(", ");
}

/** Falhou por coluna de fase pendente? Desliga o grupo e pede nova tentativa. */
function handledMissingStage(message: string, code?: string | null): boolean {
  if (stageAvailable && isMissingColumnError(message, "stage", code)) {
    console.warn("[crm/customers] sem a coluna stage — rode supabase-migration-crm-funnel.sql");
    stageAvailable = false;
    return true;
  }
  if (campaignAvailable && isMissingColumnError(message, "opted_out_at", code)) {
    console.warn(
      "[crm/customers] sem as colunas de campanha — rode supabase-migration-crm-campaigns.sql"
    );
    campaignAvailable = false;
    return true;
  }
  return false;
}

// --- Sincronização -----------------------------------------------------------

type SyncArgs = {
  /** Telefone como veio (pode ter máscara). */
  phone: string;
  /** Nome do cliente, se conhecido. Nunca apaga um nome já salvo. */
  name?: string;
  /** Dígitos com que ele aparece nas tabelas whatsapp_* (JID do webhook). */
  waPhone?: string;
  /** Marca `last_message_at = now()` (só o webhook usa). */
  touchMessage?: boolean;
};

/**
 * Cria/atualiza o cliente e recalcula os agregados. Toda a lógica está na
 * função `crm_sync_customer` do banco (ver a migration) — daqui sai uma
 * chamada só. Nunca lança: um erro no CRM não pode derrubar um pedido nem uma
 * resposta da IA.
 */
export async function syncCrmCustomer(
  db: SupabaseClient,
  storeId: string,
  args: SyncArgs
): Promise<string | null> {
  if (!storeId || !isCrmPhoneUsable(args.phone)) return null;
  try {
    const { data, error } = await db.rpc("crm_sync_customer", {
      p_store_id: storeId,
      p_phone: args.phone,
      p_name: args.name ?? null,
      p_wa_phone: args.waPhone ?? null,
      p_touch_message: args.touchMessage ?? false,
    });
    if (error) {
      console.error("[crm/customers] syncCrmCustomer", error.message);
      return null;
    }
    return typeof data === "string" ? data : null;
  } catch (err) {
    console.error("[crm/customers] syncCrmCustomer", err);
    return null;
  }
}

/** Chamado ao criar um pedido (checkout do site e fechamento pela IA). */
export async function syncCrmCustomerFromOrder(
  db: SupabaseClient,
  storeId: string,
  order: { customerPhone: string; customerName: string }
): Promise<void> {
  const id = await syncCrmCustomer(db, storeId, {
    phone: order.customerPhone,
    name: order.customerName,
  });
  if (!id) return;

  // Comprou → entra em "Comprou" no funil, mas SÓ se ainda estava no começo.
  // Quem o lojista moveu para outra etapa fica onde está: curadoria manual
  // sempre vence a automação (regra que vale para todo o funil).
  await setCrmStage(db, storeId, id, "ganho", { onlyIfStage: DEFAULT_STAGE });
}

/**
 * Move o cliente de etapa. `onlyIfStage` torna a escrita condicional — é o que
 * permite a automação não atropelar o que o lojista arrastou à mão.
 */
export async function setCrmStage(
  db: SupabaseClient,
  storeId: string,
  id: string,
  stage: StageId,
  opts: { onlyIfStage?: StageId } = {}
): Promise<boolean> {
  if (!stageAvailable) return false;
  try {
    let q = db
      .from(TABLE)
      .update({
        stage,
        stage_changed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("store_id", storeId)
      .eq("id", id);

    if (opts.onlyIfStage) q = q.eq("stage", opts.onlyIfStage);

    const { error } = await q;
    if (error) {
      if (handledMissingStage(error.message, error.code)) return false;
      console.error("[crm/customers] setCrmStage", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[crm/customers] setCrmStage", err);
    return false;
  }
}

/** Chamado quando o cliente manda mensagem no WhatsApp (webhook). */
export async function syncCrmCustomerFromMessage(
  db: SupabaseClient,
  storeId: string,
  waPhone: string,
  name?: string
): Promise<void> {
  await syncCrmCustomer(db, storeId, {
    phone: waPhone,
    waPhone,
    name,
    touchMessage: true,
  });
}

// --- Listagem ----------------------------------------------------------------

export type ListOptions = {
  segment: SegmentId;
  sort: SortId;
  /** Busca por nome ou telefone. */
  query?: string;
  /** Só uma etapa do funil (usado pelo kanban). */
  stage?: StageId;
  limit?: number;
  offset?: number;
};

const PAGE_SIZE = 50;

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

/**
 * Lista os clientes da loja aplicando segmento + ordenação no banco (todas as
 * colunas usadas têm índice). A busca textual e o filtro por etiqueta são
 * aplicados em JS sobre a página, porque etiqueta mora em outra tabela e a
 * busca precisa ignorar acento — ver `listCrmCustomers` no route handler.
 */
export async function listCrmCustomers(
  db: SupabaseClient,
  storeId: string,
  opts: ListOptions
): Promise<{ customers: CrmCustomer[]; total: number }> {
  const limit = opts.limit ?? PAGE_SIZE;
  const offset = opts.offset ?? 0;

  try {
    let q = db
      .from(TABLE)
      .select(selectCols(), { count: "exact" })
      .eq("store_id", storeId);

    if (opts.stage && stageAvailable) q = q.eq("stage", opts.stage);

    // --- segmento
    const inactive = inactiveDaysFor(opts.segment);
    if (opts.segment === "novos_30d") {
      q = q.gte("first_seen_at", daysAgoIso(30));
    } else if (opts.segment === "compraram") {
      q = q.gt("orders_count", 0);
    } else if (opts.segment === "recorrentes") {
      q = q.gte("orders_count", 2);
    } else if (opts.segment === "nunca_compraram") {
      q = q.eq("orders_count", 0);
    } else if (opts.segment === "melhores") {
      q = q.gt("total_spent", 0);
    } else if (inactive > 0) {
      const cut = daysAgoIso(inactive);
      // "Sumiu" = não comprou NEM falou desde o corte. Datas nulas contam como
      // silêncio (nunca comprou / nunca falou), daí o `is.null` em cada ramo.
      q = q
        .or(`last_order_at.is.null,last_order_at.lt.${cut}`)
        .or(`last_message_at.is.null,last_message_at.lt.${cut}`);
    }

    // --- ordenação
    if (opts.sort === "valor" || opts.segment === "melhores") {
      q = q.order("total_spent", { ascending: false });
    } else if (opts.sort === "pedidos") {
      q = q.order("orders_count", { ascending: false });
    } else if (opts.sort === "antigos") {
      q = q.order("first_seen_at", { ascending: true });
    } else {
      q = q.order("first_seen_at", { ascending: false });
    }

    const { data, count, error } = await q.range(offset, offset + limit - 1);
    if (error) {
      // Migration do funil pendente: repete sem as colunas de etapa.
      if (handledMissingStage(error.message, error.code)) {
        return listCrmCustomers(db, storeId, opts);
      }
      console.error("[crm/customers] listCrmCustomers", error.message);
      return { customers: [], total: 0 };
    }
    return {
      // O select montado em runtime (selectCols) derruba a inferência do
      // supabase-js, daí o cast único — mesmo padrão do catalogRows.
      customers: ((data ?? []) as unknown as Row[]).map(rowToCustomer),
      total: count ?? 0,
    };
  } catch (err) {
    // Migration do CRM ainda não rodada.
    console.error("[crm/customers] listCrmCustomers", err);
    return { customers: [], total: 0 };
  }
}

/**
 * Busca por nome/telefone. Roda em JS (sem acento) sobre um lote maior, porque
 * o `ilike` do Postgres não ignora acento sem extensão — e a base de um lojista
 * cabe folgadamente num lote.
 */
const SEARCH_SCAN_LIMIT = 2000;

export async function searchCrmCustomers(
  db: SupabaseClient,
  storeId: string,
  query: string,
  sort: SortId
): Promise<CrmCustomer[]> {
  const needle = normalizeSearch(query);
  const digits = query.replace(/\D/g, "");
  if (!needle) return [];

  const { customers } = await listCrmCustomers(db, storeId, {
    segment: "todos",
    sort,
    limit: SEARCH_SCAN_LIMIT,
  });

  return customers.filter((c) => {
    if (normalizeSearch(c.name).includes(needle)) return true;
    if (digits && c.phoneKey.includes(digits)) return true;
    if (digits && digits.length >= 4 && c.phoneTail.includes(digits)) return true;
    return false;
  });
}

// --- Ficha 360° --------------------------------------------------------------

export async function getCrmCustomerById(
  db: SupabaseClient,
  storeId: string,
  id: string
): Promise<CrmCustomer | null> {
  try {
    const { data } = await db
      .from(TABLE)
      .select(selectCols())
      .eq("store_id", storeId)
      .eq("id", id)
      .maybeSingle();
    return data ? rowToCustomer(data as unknown as Row) : null;
  } catch {
    return null;
  }
}

/** Acha o cliente por qualquer formato de telefone (deep link `?phone=`). */
export async function findCrmCustomerByPhone(
  db: SupabaseClient,
  storeId: string,
  phone: string
): Promise<CrmCustomer | null> {
  const key = crmPhoneKey(phone);
  if (!key) return null;
  try {
    const { data } = await db
      .from(TABLE)
      .select(selectCols())
      .eq("store_id", storeId)
      .eq("phone_key", key)
      .maybeSingle();
    if (data) return rowToCustomer(data as unknown as Row);

    // Número fora do padrão BR: cai no casamento tolerante pelos 8 últimos.
    const { data: byTail } = await db
      .from(TABLE)
      .select(selectCols())
      .eq("store_id", storeId)
      .eq("phone_tail", key.slice(-8))
      .limit(1);
    const first = (byTail ?? [])[0] as unknown as Row | undefined;
    return first ? rowToCustomer(first) : null;
  } catch {
    return null;
  }
}

export type CrmCustomerOrder = {
  id: string;
  orderNumber: number;
  createdAt: string;
  subtotal: number;
  status: string;
  paymentStatus: string;
};

/**
 * Pedidos do cliente. O casamento é pela chave canônica, que só o banco sabe
 * calcular sobre o telefone mascarado de `orders` — por isso a lista sai de uma
 * consulta por variantes conhecidas mais um filtro final em JS.
 */
export async function listCrmCustomerOrders(
  db: SupabaseClient,
  storeId: string,
  customer: CrmCustomer
): Promise<CrmCustomerOrder[]> {
  const key = customer.phoneKey;
  const tail = customer.phoneTail;
  try {
    const { data } = await db
      .from("orders")
      .select(
        "id, order_number, created_at, subtotal, status, payment_status, customer_phone"
      )
      .eq("store_id", storeId)
      .not("customer_phone", "is", null)
      .order("created_at", { ascending: false })
      .limit(400);

    const rows = (data ?? []) as Row[];
    return rows
      .filter((r) => {
        const raw = String(r.customer_phone ?? "");
        if (!raw) return false;
        if (crmPhoneKey(raw) === key) return true;
        // Fallback tolerante (mesma regra do phone_tail).
        return raw.replace(/\D/g, "").slice(-8) === tail;
      })
      .map((r) => ({
        id: String(r.id ?? ""),
        orderNumber: Number(r.order_number ?? 0),
        createdAt: String(r.created_at ?? ""),
        subtotal: Number(r.subtotal ?? 0),
        status: String(r.status ?? "novo"),
        paymentStatus: String(r.payment_status ?? "pendente"),
      }));
  } catch (err) {
    console.error("[crm/customers] listCrmCustomerOrders", err);
    return [];
  }
}

/**
 * As etiquetas de um cliente. Lê pelas VARIANTES do telefone porque
 * `whatsapp_conversation_tags` guarda "os dígitos que vieram" — as chaves
 * antigas não são migradas (migrar quebraria o webhook e o findCustomerName).
 */
export function pickByPhoneVariants<T>(
  map: Record<string, T>,
  phone: string
): T | undefined {
  for (const v of crmPhoneVariants(phone)) {
    const hit = map[v];
    if (hit !== undefined) return hit;
  }
  return undefined;
}
