import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { getConfig, updateConnection } from "@/lib/whatsappConfig";
import { isEvolutionConfigured, logoutInstance } from "@/lib/evolution";

export const runtime = "nodejs";

export async function POST() {
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

  const admin = createAdminSupabase();
  if (!admin) {
    return NextResponse.json({ ok: false, error: "Servidor sem service role." }, { status: 503 });
  }

  const cfg = await getConfig(admin, store.id as string);
  if (cfg && isEvolutionConfigured()) {
    await logoutInstance(cfg.evolutionInstance);
  }
  await updateConnection(admin, store.id as string, "disconnected");
  return NextResponse.json({ ok: true });
}
