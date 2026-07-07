import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import {
  appendMessage,
  getConfig,
  getFullConversation,
  setCustomerPause,
} from "@/lib/whatsappConfig";
import { sendText } from "@/lib/evolution";

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

function normalizePhone(v: unknown): string {
  return typeof v === "string" ? v.replace(/\D/g, "") : "";
}

// Histórico completo de uma conversa.
export async function GET(req: Request) {
  const ctx = await resolveStore();
  if ("error" in ctx) return ctx.error;
  const { storeId, admin } = ctx;

  const phone = normalizePhone(new URL(req.url).searchParams.get("phone"));
  if (!phone) {
    return NextResponse.json(
      { ok: false, error: "Informe o número do cliente." },
      { status: 400 }
    );
  }

  const messages = await getFullConversation(admin, storeId, phone, 300);
  return NextResponse.json({ ok: true, messages });
}

type Body = { phone?: string; text?: string };

// Envia uma mensagem manual (o lojista assume a conversa) e pausa a IA para ele.
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

  const phone = normalizePhone(body.phone);
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!phone) {
    return NextResponse.json(
      { ok: false, error: "Informe o número do cliente." },
      { status: 400 }
    );
  }
  if (!text) {
    return NextResponse.json(
      { ok: false, error: "Escreva uma mensagem." },
      { status: 400 }
    );
  }

  const cfg = await getConfig(admin, storeId);
  if (!cfg || cfg.connectionStatus !== "connected") {
    return NextResponse.json(
      { ok: false, error: "WhatsApp não está conectado." },
      { status: 409 }
    );
  }

  try {
    await sendText(cfg.evolutionInstance, phone, text.slice(0, 4000));
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Falha ao enviar." },
      { status: 502 }
    );
  }

  // Registra a mensagem como fala da loja e pausa a IA para este cliente
  // (você assumiu a conversa). Usa o tempo de handoff; se desativado, 30 min.
  await appendMessage(admin, storeId, phone, "assistant", text.slice(0, 4000));
  const pauseMinutes = cfg.aiHandoffMinutes > 0 ? cfg.aiHandoffMinutes : 30;
  const until = new Date(Date.now() + pauseMinutes * 60_000).toISOString();
  await setCustomerPause(admin, storeId, phone, until, "handoff");

  return NextResponse.json({ ok: true });
}
