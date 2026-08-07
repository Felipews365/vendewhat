/**
 * CRM — resumo da base (faixa de números no topo de /dashboard/clientes).
 *
 * A conta roda no banco (`crm_store_stats`): somar total_spent pelo supabase-js
 * exigiria baixar a base inteira. Sem a migration da fase 2 devolve `null` e a
 * faixa simplesmente não aparece.
 */
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";

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

/** Quantos meses os gráficos mostram. */
const TIMELINE_MONTHS = 6;

export async function GET() {
  const ctx = await resolveStore();
  if ("error" in ctx) return ctx.error;
  const { storeId, admin } = ctx;

  // As três consultas são independentes: vão juntas para não somar latência.
  const [statsRes, timelineRes, funnelRes] = await Promise.all([
    admin.rpc("crm_store_stats", { p_store_id: storeId }),
    admin.rpc("crm_store_timeline", {
      p_store_id: storeId,
      p_months: TIMELINE_MONTHS,
    }),
    admin.rpc("crm_store_funnel", { p_store_id: storeId }),
  ]);

  if (statsRes.error) {
    // Migration da fase 2 pendente: a tela some com a faixa, sem quebrar.
    console.warn("[api/crm/stats]", statsRes.error.message);
    return NextResponse.json({ ok: true, stats: null, timeline: [], funnel: [] });
  }

  const row = (Array.isArray(statsRes.data) ? statsRes.data[0] : statsRes.data) as
    | Record<string, unknown>
    | undefined;
  if (!row) {
    return NextResponse.json({ ok: true, stats: null, timeline: [], funnel: [] });
  }

  const timeline = ((timelineRes.data ?? []) as Record<string, unknown>[]).map(
    (r) => ({
      mes: String(r.mes ?? ""),
      novos: Number(r.novos ?? 0),
      receita: Number(r.receita ?? 0),
    })
  );

  const funnel = ((funnelRes.data ?? []) as Record<string, unknown>[]).map((r) => ({
    stage: String(r.stage ?? ""),
    total: Number(r.total ?? 0),
    valor: Number(r.valor ?? 0),
  }));

  return NextResponse.json({
    ok: true,
    stats: {
      total: Number(row.total ?? 0),
      novos30d: Number(row.novos_30d ?? 0),
      compradores: Number(row.compradores ?? 0),
      receita: Number(row.receita ?? 0),
      ticketMedio: Number(row.ticket_medio ?? 0),
      semTelefone: Number(row.sem_telefone ?? 0),
    },
    timeline,
    funnel,
  });
}
