import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { ensureConfig, updateConnection } from "@/lib/whatsappConfig";
import {
  connectInstance,
  createInstance,
  isEvolutionConfigured,
} from "@/lib/evolution";

export const runtime = "nodejs";

export async function POST() {
  if (!isEvolutionConfigured()) {
    return NextResponse.json(
      { ok: false, error: "Integração WhatsApp não configurada no servidor." },
      { status: 503 }
    );
  }

  const baseUrl = process.env.APP_BASE_URL;
  if (!baseUrl) {
    return NextResponse.json(
      { ok: false, error: "APP_BASE_URL não configurada no servidor." },
      { status: 503 }
    );
  }

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
    return NextResponse.json(
      { ok: false, error: "Servidor sem service role." },
      { status: 503 }
    );
  }

  try {
    const cfg = await ensureConfig(admin, store.id as string);
    const webhookUrl = `${baseUrl.replace(/\/+$/, "")}/api/whatsapp/webhook?token=${cfg.webhookToken}`;
    await createInstance(cfg.evolutionInstance, webhookUrl);
    const qr = await connectInstance(cfg.evolutionInstance);
    await updateConnection(admin, store.id as string, "connecting");
    return NextResponse.json({
      ok: true,
      qr: qr.base64,
      pairingCode: qr.pairingCode,
    });
  } catch (err) {
    console.error("[whatsapp/connect]", err);
    return NextResponse.json(
      {
        ok: false,
        error:
          err instanceof Error ? err.message : "Falha ao conectar o WhatsApp.",
      },
      { status: 502 }
    );
  }
}
