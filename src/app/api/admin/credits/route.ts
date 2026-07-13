import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { addCredits, loadCredits, TOKENS_PER_CONVERSATION } from "@/lib/aiCredits";

export const runtime = "nodejs";

function shape(state: Awaited<ReturnType<typeof loadCredits>>) {
  return {
    conversationsLeft: state.conversationsLeft,
    creditConversations: Math.floor(state.creditTokens / TOKENS_PER_CONVERSATION),
    includedConversations: Math.floor(state.includedTokens / TOKENS_PER_CONVERSATION),
    usedConversations: Math.floor(state.usedTokens / TOKENS_PER_CONVERSATION),
  };
}

/** Saldo de créditos de uma loja (para o painel admin). */
export async function GET(req: Request) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ ok: false, error: "Não autorizado." }, { status: 401 });
  }
  const db = createAdminSupabase();
  if (!db) {
    return NextResponse.json({ ok: false, error: "Service role não configurada." }, { status: 503 });
  }
  const storeId = new URL(req.url).searchParams.get("storeId")?.trim();
  if (!storeId) {
    return NextResponse.json({ ok: false, error: "storeId obrigatório." }, { status: 400 });
  }
  const state = await loadCredits(db, storeId);
  return NextResponse.json({ ok: true, ...shape(state) });
}

type Body = { storeId?: string; conversations?: number };

/** Credita conversas manualmente numa loja (suporte / cortesia). Só admin. */
export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ ok: false, error: "Não autorizado." }, { status: 401 });
  }
  const db = createAdminSupabase();
  if (!db) {
    return NextResponse.json({ ok: false, error: "Service role não configurada." }, { status: 503 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido." }, { status: 400 });
  }

  const storeId = String(body.storeId ?? "").trim();
  if (!storeId) {
    return NextResponse.json({ ok: false, error: "storeId obrigatório." }, { status: 400 });
  }
  const conversations = Math.max(1, Math.min(100_000, Math.round(Number(body.conversations) || 0)));
  if (!Number.isFinite(conversations) || conversations < 1) {
    return NextResponse.json({ ok: false, error: "Quantidade inválida." }, { status: 400 });
  }

  const state = await addCredits(db, storeId, conversations * TOKENS_PER_CONVERSATION);
  revalidatePath(`/admin/clientes/${storeId}`);
  return NextResponse.json({ ok: true, ...shape(state) });
}
