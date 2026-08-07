/**
 * CRM — lista de clientes e edição (nome / etiquetas).
 *
 * Só o dono (autenticado) enxerga a própria loja; a leitura de `crm_customers`
 * e a escrita nas tabelas de WhatsApp (que não têm policy) passam por service
 * role, sempre com `.eq("store_id", storeId)`.
 */
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { listConversationTags, setContactName, setConversationTags } from "@/lib/whatsappConfig";
import {
  listCrmCustomers,
  searchCrmCustomers,
  syncCrmCustomer,
  setCrmStage,
  getCrmCustomerById,
  findCrmCustomerByPhone,
  pickByPhoneVariants,
  type CrmCustomer,
} from "@/lib/crm/customers";
import { isSegmentId, isSortId, type SegmentId, type SortId } from "@/lib/crm/segments";
import { isStageId, type StageId } from "@/lib/crm/stages";
import { normalizeSearch, splitTag } from "@/lib/crm/tags";

export const runtime = "nodejs";

/** Autentica o dono e devolve { storeId, admin } ou uma resposta de erro. */
async function resolveStore() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      error: NextResponse.json(
        { ok: false, error: "Não autenticado." },
        { status: 401 }
      ),
    };
  }
  const { data: store } = await supabase
    .from("stores")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!store?.id) {
    return {
      error: NextResponse.json(
        { ok: false, error: "Loja não encontrada." },
        { status: 404 }
      ),
    };
  }
  const admin = createAdminSupabase();
  if (!admin) {
    return {
      error: NextResponse.json(
        { ok: false, error: "Servidor sem service role." },
        { status: 503 }
      ),
    };
  }
  return { storeId: store.id as string, admin };
}

type CustomerDto = CrmCustomer & { tags: string[] };

function withTags(
  customers: CrmCustomer[],
  tagsMap: Record<string, string[]>
): CustomerDto[] {
  return customers.map((c) => ({
    ...c,
    tags: pickByPhoneVariants(tagsMap, c.waPhone || c.phoneKey) ?? [],
  }));
}

// GET ?segment=&sort=&q=&tags=a,b&offset=&phone=
export async function GET(req: Request) {
  const ctx = await resolveStore();
  if ("error" in ctx) return ctx.error;
  const { storeId, admin } = ctx;

  const url = new URL(req.url);
  const rawSegment = url.searchParams.get("segment") ?? "todos";
  const rawSort = url.searchParams.get("sort") ?? "recentes";
  const segment: SegmentId = isSegmentId(rawSegment) ? rawSegment : "todos";
  const sort: SortId = isSortId(rawSort) ? rawSort : "recentes";
  const query = (url.searchParams.get("q") ?? "").trim();
  const offset = Math.max(0, Number(url.searchParams.get("offset") ?? 0) || 0);
  const tagFilter = (url.searchParams.get("tags") ?? "")
    .split(",")
    .map((t) => normalizeSearch(t))
    .filter(Boolean);

  // As etiquetas vêm todas de uma vez (é um objeto por loja) e toleram a
  // migration de tags ausente.
  let tagsMap: Record<string, string[]> = {};
  try {
    tagsMap = await listConversationTags(admin, storeId);
  } catch {
    tagsMap = {};
  }

  // Deep link `?phone=` (vindo do painel de conversas / pedidos).
  const phone = (url.searchParams.get("phone") ?? "").trim();
  if (phone) {
    const found = await findCrmCustomerByPhone(admin, storeId, phone);
    return NextResponse.json({
      ok: true,
      customers: found ? withTags([found], tagsMap) : [],
      total: found ? 1 : 0,
      hasMore: false,
    });
  }

  const rawStage = url.searchParams.get("stage") ?? "";
  const stage: StageId | undefined = isStageId(rawStage) ? rawStage : undefined;
  // O kanban carrega uma coluna inteira de uma vez (não pagina por rolagem).
  const limit = stage ? 200 : undefined;

  const { customers, total } = query
    ? {
        customers: await searchCrmCustomers(admin, storeId, query, sort),
        total: -1,
      }
    : await listCrmCustomers(admin, storeId, { segment, sort, stage, offset, limit });

  let dto = withTags(customers, tagsMap);

  // Filtro por etiqueta: OU entre as marcadas, E com o resto (busca/segmento).
  if (tagFilter.length > 0) {
    dto = dto.filter((c) =>
      c.tags.some((raw) => tagFilter.includes(normalizeSearch(splitTag(raw).name)))
    );
  }

  return NextResponse.json({
    ok: true,
    customers: dto,
    total: total < 0 ? dto.length : total,
    hasMore: total < 0 ? false : offset + customers.length < total,
  });
}

type PatchBody = { id?: string; name?: string; tags?: string[]; stage?: string };

// POST — renomear o cliente, definir as etiquetas e/ou mover de etapa.
export async function POST(req: Request) {
  const ctx = await resolveStore();
  if ("error" in ctx) return ctx.error;
  const { storeId, admin } = ctx;

  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido." }, { status: 400 });
  }

  const id = String(body.id ?? "").trim();
  if (!id) {
    return NextResponse.json(
      { ok: false, error: "Informe o cliente." },
      { status: 400 }
    );
  }

  const customer = await getCrmCustomerById(admin, storeId, id);
  if (!customer) {
    return NextResponse.json(
      { ok: false, error: "Cliente não encontrado." },
      { status: 404 }
    );
  }

  // Escreve nas tabelas de WhatsApp com o `wa_phone` — é a chave com que o
  // painel de conversas encontra a linha (as chaves antigas não são migradas).
  const waPhone = customer.waPhone || customer.phoneKey;

  if (typeof body.name === "string") {
    try {
      const saved = await setContactName(admin, storeId, waPhone, body.name);
      // Reflete o nome na base do CRM (o sync nunca apaga um nome já salvo, e
      // aqui o lojista pode querer justamente limpar — daí a escrita direta).
      await admin
        .from("crm_customers")
        .update({ name: saved, updated_at: new Date().toISOString() })
        .eq("store_id", storeId)
        .eq("id", id);
    } catch {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Não foi possível salvar o nome. Rode a migration whatsapp-contacts no Supabase.",
        },
        { status: 500 }
      );
    }
  }

  // Mover de etapa é a ação mais frequente do kanban: sai primeiro e sozinha,
  // sem arrastar junto o recálculo de agregados (o arrasto precisa ser rápido).
  if (typeof body.stage === "string") {
    if (!isStageId(body.stage)) {
      return NextResponse.json(
        { ok: false, error: "Etapa inválida." },
        { status: 400 }
      );
    }
    const moved = await setCrmStage(admin, storeId, id, body.stage);
    if (!moved) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Não foi possível mover o cliente. Rode a migration crm-funnel no Supabase.",
        },
        { status: 500 }
      );
    }
    if (body.name === undefined && body.tags === undefined) {
      return NextResponse.json({ ok: true, stage: body.stage });
    }
  }

  let tags: string[] | undefined;
  if (Array.isArray(body.tags)) {
    try {
      tags = await setConversationTags(admin, storeId, waPhone, body.tags);
    } catch {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Não foi possível salvar as etiquetas. Rode a migration whatsapp-tags no Supabase.",
        },
        { status: 500 }
      );
    }
  }

  // Recalcula os agregados de quebra (barato: uma rpc).
  await syncCrmCustomer(admin, storeId, { phone: customer.phoneKey });

  const fresh = await getCrmCustomerById(admin, storeId, id);
  return NextResponse.json({ ok: true, customer: fresh, tags });
}
