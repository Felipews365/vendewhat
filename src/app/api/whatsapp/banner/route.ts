import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { getConfig, globalPauseActive } from "@/lib/whatsappConfig";
import { planHasAi as planIncludesAi } from "@/lib/plans";

export const runtime = "nodejs";

/**
 * Estado enxuto para o aviso do topo do painel: se o plano tem IA, se a IA
 * está ligada, se o WhatsApp está conectado e se a IA está pausada.
 */
export async function GET() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });
  }

  const { data: store } = await supabase
    .from("stores")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!store?.id) {
    return NextResponse.json({ ok: false, error: "Loja não encontrada." }, { status: 404 });
  }
  const storeId = store.id as string;

  // Plano atual (RLS: o dono lê a própria assinatura). Sem assinatura assume
  // que o plano tem IA (não esconde o aviso por falta de registro).
  const { data: sub } = await supabase
    .from("subscriptions")
    .select("plan_id")
    .eq("store_id", storeId)
    .maybeSingle();
  const planId = (sub as { plan_id?: string | null } | null)?.plan_id ?? null;
  const planHasAi = planIncludesAi(planId);

  const admin = createAdminSupabase();
  const cfg = admin ? await getConfig(admin, storeId) : null;

  return NextResponse.json({
    ok: true,
    planHasAi,
    aiEnabled: cfg?.aiEnabled ?? false,
    connected: cfg?.connectionStatus === "connected",
    paused: cfg ? globalPauseActive(cfg) : false,
  });
}
