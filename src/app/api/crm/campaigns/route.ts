/**
 * CRM — campanhas: listar, prever o público e criar.
 *
 * A criação CONGELA o público em `crm_campaign_targets`. Um envio de 300
 * contatos leva dias; se a lista fosse recalculada a cada passada do cron, ela
 * mudaria no meio do caminho.
 */
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { listConversationTags, getConfig } from "@/lib/whatsappConfig";
import { listCrmCustomers, pickByPhoneVariants } from "@/lib/crm/customers";
import { isSegmentId, type SegmentId } from "@/lib/crm/segments";
import { normalizeSearch, splitTag } from "@/lib/crm/tags";
import {
  CUSTOMER_COOLDOWN_DAYS,
  DAILY_CAP,
  MAX_TARGETS,
  PER_RUN_PER_STORE,
} from "@/lib/crm/campaigns";

export const runtime = "nodejs";
export const maxDuration = 60;

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

type Admin = NonNullable<ReturnType<typeof createAdminSupabase>>;

type Audience = {
  elegiveis: { id: string; waPhone: string; name: string }[];
  excluidos: { semHistorico: number; optOut: number; recente: number; semTelefone: number };
};

/**
 * Resolve quem recebe. A elegibilidade NÃO é escolha do lojista — é o que
 * separa uma campanha de uma lista fria (que queima o número).
 */
async function resolveAudience(
  admin: Admin,
  storeId: string,
  segment: SegmentId,
  tagFilter: string[]
): Promise<Audience> {
  const { customers } = await listCrmCustomers(admin, storeId, {
    segment,
    sort: "recentes",
    limit: MAX_TARGETS,
  });

  let tagsMap: Record<string, string[]> = {};
  if (tagFilter.length > 0) {
    try {
      tagsMap = await listConversationTags(admin, storeId);
    } catch {
      tagsMap = {};
    }
  }

  const cooldown = Date.now() - CUSTOMER_COOLDOWN_DAYS * 86_400_000;
  const out: Audience = {
    elegiveis: [],
    excluidos: { semHistorico: 0, optOut: 0, recente: 0, semTelefone: 0 },
  };

  for (const c of customers) {
    if (tagFilter.length > 0) {
      const tags = pickByPhoneVariants(tagsMap, c.waPhone || c.phoneKey) ?? [];
      const hit = tags.some((raw) =>
        tagFilter.includes(normalizeSearch(splitTag(raw).name))
      );
      if (!hit) continue;
    }

    const phone = (c.waPhone || c.phoneKey).replace(/\D/g, "");
    if (!phone) {
      out.excluidos.semTelefone++;
      continue;
    }
    // Nunca falou nem comprou = lista fria. Fora.
    if (!c.lastMessageAt && c.ordersCount === 0) {
      out.excluidos.semHistorico++;
      continue;
    }
    if (c.optedOutAt) {
      out.excluidos.optOut++;
      continue;
    }
    if (c.lastCampaignAt && new Date(c.lastCampaignAt).getTime() > cooldown) {
      out.excluidos.recente++;
      continue;
    }
    out.elegiveis.push({ id: c.id, waPhone: phone, name: c.name });
  }

  return out;
}

// GET — lista as campanhas, ou prevê o público com ?preview=1
export async function GET(req: Request) {
  const ctx = await resolveStore();
  if ("error" in ctx) return ctx.error;
  const { storeId, admin } = ctx;

  const url = new URL(req.url);

  if (url.searchParams.get("preview") === "1") {
    const rawSegment = url.searchParams.get("segment") ?? "todos";
    const segment: SegmentId = isSegmentId(rawSegment) ? rawSegment : "todos";
    const tagFilter = (url.searchParams.get("tags") ?? "")
      .split(",")
      .map((t) => normalizeSearch(t))
      .filter(Boolean);

    const audience = await resolveAudience(admin, storeId, segment, tagFilter);
    const n = audience.elegiveis.length;
    // Estimativa honesta: o lojista precisa saber que leva dias.
    const dias = n > 0 ? Math.ceil(n / DAILY_CAP) : 0;

    return NextResponse.json({
      ok: true,
      preview: {
        total: n,
        excluidos: audience.excluidos,
        dias,
        porDia: DAILY_CAP,
      },
    });
  }

  const cfg = await getConfig(admin, storeId);
  const { data } = await admin
    .from("crm_campaigns")
    .select("id, name, message, status, total, sent, failed, created_at, finished_at")
    .eq("store_id", storeId)
    .order("created_at", { ascending: false })
    .limit(50);

  return NextResponse.json({
    ok: true,
    campaigns: data ?? [],
    connected: cfg?.connectionStatus === "connected",
    limits: { porDia: DAILY_CAP, porRodada: PER_RUN_PER_STORE },
  });
}

type CreateBody = {
  name?: string;
  message?: string;
  segment?: string;
  tags?: string[];
};

// POST — cria a campanha e congela o público.
export async function POST(req: Request) {
  const ctx = await resolveStore();
  if ("error" in ctx) return ctx.error;
  const { storeId, admin } = ctx;

  let body: CreateBody;
  try {
    body = (await req.json()) as CreateBody;
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido." }, { status: 400 });
  }

  const name = String(body.name ?? "").trim().slice(0, 80);
  const message = String(body.message ?? "").trim().slice(0, 900);

  if (name.length < 2) {
    return NextResponse.json(
      { ok: false, error: "Dê um nome para a campanha." },
      { status: 400 }
    );
  }
  if (message.length < 10) {
    return NextResponse.json(
      { ok: false, error: "Escreva a mensagem que os clientes vão receber." },
      { status: 400 }
    );
  }
  // Personalizar não é capricho: texto idêntico em massa é o padrão que o
  // WhatsApp detecta para banir.
  if (!/\{nome\}/i.test(message)) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "A mensagem precisa ter {nome} — mensagens idênticas em massa fazem o WhatsApp bloquear seu número.",
      },
      { status: 400 }
    );
  }

  const cfg = await getConfig(admin, storeId);
  if (!cfg || cfg.connectionStatus !== "connected") {
    return NextResponse.json(
      {
        ok: false,
        error: "Conecte o WhatsApp da loja antes de criar uma campanha.",
      },
      { status: 400 }
    );
  }

  // Uma campanha ativa por vez: duas em paralelo dobrariam o ritmo real.
  const { count: running } = await admin
    .from("crm_campaigns")
    .select("id", { count: "exact", head: true })
    .eq("store_id", storeId)
    .eq("status", "enviando");
  if ((running ?? 0) > 0) {
    return NextResponse.json(
      {
        ok: false,
        error: "Você já tem uma campanha enviando. Espere terminar ou pause ela.",
      },
      { status: 400 }
    );
  }

  const rawSegment = String(body.segment ?? "todos");
  const segment: SegmentId = isSegmentId(rawSegment) ? rawSegment : "todos";
  const tagFilter = (Array.isArray(body.tags) ? body.tags : [])
    .map((t) => normalizeSearch(String(t)))
    .filter(Boolean);

  const audience = await resolveAudience(admin, storeId, segment, tagFilter);
  if (audience.elegiveis.length === 0) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Ninguém desse público pode receber agora (só entram clientes que já falaram ou compraram, e que não receberam campanha nos últimos dias).",
      },
      { status: 400 }
    );
  }

  const { data: created, error } = await admin
    .from("crm_campaigns")
    .insert({
      store_id: storeId,
      name,
      message,
      audience: { segment, tags: tagFilter },
      status: "enviando",
      total: audience.elegiveis.length,
      started_at: new Date().toISOString(),
    })
    .select("id")
    .maybeSingle();

  if (error || !created) {
    console.error("[api/crm/campaigns]", error?.message);
    return NextResponse.json(
      {
        ok: false,
        error:
          "Não foi possível criar a campanha. Rode a migration crm-campaigns no Supabase.",
      },
      { status: 500 }
    );
  }

  const campaignId = String((created as Record<string, unknown>).id);

  // Congela o público em lotes (uma loja pode ter milhares de contatos).
  const rows = audience.elegiveis.map((c) => ({
    campaign_id: campaignId,
    store_id: storeId,
    customer_id: c.id,
    wa_phone: c.waPhone,
    name: c.name,
  }));
  for (let i = 0; i < rows.length; i += 500) {
    await admin.from("crm_campaign_targets").insert(rows.slice(i, i + 500));
  }

  return NextResponse.json({
    ok: true,
    id: campaignId,
    total: audience.elegiveis.length,
  });
}
