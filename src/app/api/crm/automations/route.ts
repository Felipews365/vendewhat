/**
 * CRM — interruptores das automações. O catálogo de regras é fixo em
 * src/lib/crm/automations.ts; aqui só grava ligado/desligado e o parâmetro.
 */
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { isRuleId, ruleById } from "@/lib/crm/automations";

export const runtime = "nodejs";

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

export async function GET() {
  const ctx = await resolveStore();
  if ("error" in ctx) return ctx.error;
  const { storeId, admin } = ctx;

  try {
    const { data, error } = await admin
      .from("crm_automations")
      .select("rule_id, enabled, params")
      .eq("store_id", storeId);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, rules: data ?? [] });
  } catch {
    // Migration pendente: a tela mostra tudo desligado, sem quebrar.
    return NextResponse.json({ ok: true, rules: [] });
  }
}

type Body = { ruleId?: string; enabled?: boolean; days?: number };

export async function POST(req: Request) {
  const ctx = await resolveStore();
  if ("error" in ctx) return ctx.error;
  const { storeId, admin } = ctx;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido." }, { status: 400 });
  }

  const ruleId = String(body.ruleId ?? "");
  if (!isRuleId(ruleId)) {
    return NextResponse.json({ ok: false, error: "Regra inválida." }, { status: 400 });
  }

  const rule = ruleById(ruleId);
  const params: Record<string, unknown> = {};
  if (rule?.daysParam) {
    const raw = Number(body.days ?? rule.daysParam.default);
    // Prende no intervalo do catálogo: "0 dias" marcaria a base inteira.
    const days = Math.min(
      rule.daysParam.max,
      Math.max(rule.daysParam.min, Number.isFinite(raw) ? raw : rule.daysParam.default)
    );
    params.days = days;
  }

  try {
    const { error } = await admin.from("crm_automations").upsert(
      {
        store_id: storeId,
        rule_id: ruleId,
        enabled: Boolean(body.enabled),
        params,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "store_id,rule_id" }
    );
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, params });
  } catch (err) {
    console.error("[api/crm/automations]", err);
    return NextResponse.json(
      {
        ok: false,
        error: "Não foi possível salvar. Rode a migration crm-notes-tasks no Supabase.",
      },
      { status: 500 }
    );
  }
}
