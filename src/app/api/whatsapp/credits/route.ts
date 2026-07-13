import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { isMercadoPagoConfigured } from "@/lib/mercadopago";
import { loadCredits, TOKENS_PER_CONVERSATION, CREDIT_PACKAGES } from "@/lib/aiCredits";

export const runtime = "nodejs";

/** Resolve a loja do usuário logado. */
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

  return { storeId: store.id as string };
}

/** Saldo atual da loja (em conversas). Crédito manual é feito no painel admin. */
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
  return NextResponse.json({
    ok: true,
    conversationsLeft: state.conversationsLeft,
    availableTokens: state.available,
    includedTokens: state.includedTokens,
    usedTokens: state.usedTokens,
    creditTokens: state.creditTokens,
    includedConversations: Math.floor(state.includedTokens / TOKENS_PER_CONVERSATION),
    creditConversations: Math.floor(state.creditTokens / TOKENS_PER_CONVERSATION),
    packages: CREDIT_PACKAGES,
    mpConfigured: isMercadoPagoConfigured(),
  });
}
