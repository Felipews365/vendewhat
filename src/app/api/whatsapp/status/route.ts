import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { getConfig, updateConnection } from "@/lib/whatsappConfig";
import { getConnectionState, isEvolutionConfigured } from "@/lib/evolution";

export const runtime = "nodejs";

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

  const admin = createAdminSupabase();
  const cfg = admin ? await getConfig(admin, store.id as string) : null;

  if (!cfg) {
    return NextResponse.json({ ok: true, status: "disconnected", number: null });
  }

  // Sincroniza com a Evolution quando configurada.
  if (admin && isEvolutionConfigured()) {
    try {
      const info = await getConnectionState(cfg.evolutionInstance);
      if (info.state !== cfg.connectionStatus || info.number) {
        await updateConnection(
          admin,
          store.id as string,
          info.state,
          info.number ?? undefined
        );
      }
      return NextResponse.json({
        ok: true,
        status: info.state,
        number: info.number ?? cfg.connectedNumber,
      });
    } catch (err) {
      console.error("[whatsapp/status]", err);
    }
  }

  return NextResponse.json({
    ok: true,
    status: cfg.connectionStatus,
    number: cfg.connectedNumber,
  });
}
