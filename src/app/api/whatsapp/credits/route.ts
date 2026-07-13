import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { isAdminEmail } from "@/lib/admin";
import { isMercadoPagoConfigured } from "@/lib/mercadopago";
import {
  addCredits,
  loadCredits,
  TOKENS_PER_CONVERSATION,
  CREDIT_PACKAGES,
} from "@/lib/aiCredits";

export const runtime = "nodejs";

/** Resolve a loja e o e-mail do usuário logado. */
async function resolveStore() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado." as const, status: 401 };

  const { data: store } = await supabase
    .from("stores")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!store?.id) return { error: "Loja não encontrada." as const, status: 404 };

  return { storeId: store.id as string, email: user.email ?? null };
}

function shapeState(state: Awaited<ReturnType<typeof loadCredits>>, canTopUp: boolean) {
  return {
    ok: true,
    conversationsLeft: state.conversationsLeft,
    availableTokens: state.available,
    includedTokens: state.includedTokens,
    usedTokens: state.usedTokens,
    creditTokens: state.creditTokens,
    includedConversations: Math.floor(state.includedTokens / TOKENS_PER_CONVERSATION),
    creditConversations: Math.floor(state.creditTokens / TOKENS_PER_CONVERSATION),
    packages: CREDIT_PACKAGES,
    canTopUp,
    mpConfigured: isMercadoPagoConfigured(),
  };
}

/** Saldo atual da loja (em conversas). */
export async function GET() {
  const r = await resolveStore();
  if ("error" in r) {
    return NextResponse.json({ ok: false, error: r.error }, { status: r.status });
  }
  const admin = createAdminSupabase();
  if (!admin) {
    return NextResponse.json({ ok: false, error: "Servidor sem service role." }, { status: 503 });
  }

  const state = await loadCredits(admin, r.storeId);
  return NextResponse.json(shapeState(state, isAdminEmail(r.email)));
}

type PostBody = { conversations?: number; storeId?: string };

/**
 * Credita conversas de teste (Fase 1). Restrito ao dono do SaaS (ADMIN_EMAILS) —
 * na Fase 2 a recarga vira automática pelo webhook do Mercado Pago.
 */
export async function POST(req: Request) {
  const r = await resolveStore();
  if ("error" in r) {
    return NextResponse.json({ ok: false, error: r.error }, { status: r.status });
  }
  if (!isAdminEmail(r.email)) {
    return NextResponse.json({ ok: false, error: "Sem permissão." }, { status: 403 });
  }
  const admin = createAdminSupabase();
  if (!admin) {
    return NextResponse.json({ ok: false, error: "Servidor sem service role." }, { status: 503 });
  }

  let body: PostBody;
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido." }, { status: 400 });
  }

  const conversations = Math.max(0, Math.min(100_000, Math.round(Number(body.conversations) || 0)));
  if (conversations <= 0) {
    return NextResponse.json({ ok: false, error: "Informe a quantidade de conversas." }, { status: 400 });
  }

  const targetStore = typeof body.storeId === "string" && body.storeId ? body.storeId : r.storeId;
  const state = await addCredits(admin, targetStore, conversations * TOKENS_PER_CONVERSATION);
  return NextResponse.json(shapeState(state, true));
}
