import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { getMpUser, isTestToken } from "@/lib/mercadopago";

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

function maskToken(token: string): string {
  if (token.length <= 10) return "••••";
  return `${token.slice(0, 8)}…${token.slice(-4)}`;
}

/** Status da conexão (nunca devolve o access_token cru). */
export async function GET() {
  const r = await resolveStore();
  if ("error" in r) {
    return NextResponse.json({ ok: false, error: r.error }, { status: r.status });
  }
  const admin = createAdminSupabase();
  if (!admin) {
    return NextResponse.json({ ok: false, error: "Servidor sem service role." }, { status: 503 });
  }

  const { data } = await admin
    .from("store_payment_gateway")
    .select("access_token, mp_user_id, is_test, enabled, connected_at")
    .eq("store_id", r.storeId)
    .maybeSingle();

  if (!data) {
    return NextResponse.json({ ok: true, connected: false });
  }

  return NextResponse.json({
    ok: true,
    connected: true,
    enabled: data.enabled,
    isTest: data.is_test,
    mpUserId: data.mp_user_id,
    maskedToken: maskToken(String(data.access_token)),
    connectedAt: data.connected_at,
  });
}

type PostBody = { accessToken?: string; publicKey?: string };

/** Conecta/atualiza o token do Mercado Pago do lojista (validado antes de salvar). */
export async function POST(req: Request) {
  const r = await resolveStore();
  if ("error" in r) {
    return NextResponse.json({ ok: false, error: r.error }, { status: r.status });
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

  const accessToken = String(body.accessToken ?? "").trim();
  if (!accessToken) {
    return NextResponse.json({ ok: false, error: "Cole o Access Token do Mercado Pago." }, { status: 400 });
  }

  // Valida o token consultando o dono da conta no MP.
  let mpUserId: string | null = null;
  try {
    const me = await getMpUser(accessToken);
    mpUserId = me.id != null ? String(me.id) : null;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Token inválido ou sem permissão. Confira no painel do Mercado Pago." },
      { status: 400 }
    );
  }

  const isTest = isTestToken(accessToken);
  const { error } = await admin.from("store_payment_gateway").upsert(
    {
      store_id: r.storeId,
      provider: "mercadopago",
      access_token: accessToken,
      public_key: body.publicKey ? String(body.publicKey).trim() : null,
      mp_user_id: mpUserId,
      is_test: isTest,
      enabled: true,
      connected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "store_id" }
  );

  if (error) {
    console.error("[store/payment-gateway] upsert", error);
    return NextResponse.json({ ok: false, error: "Não foi possível salvar." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, connected: true, isTest, mpUserId });
}

/** Desconecta o gateway da loja. */
export async function DELETE() {
  const r = await resolveStore();
  if ("error" in r) {
    return NextResponse.json({ ok: false, error: r.error }, { status: r.status });
  }
  const admin = createAdminSupabase();
  if (!admin) {
    return NextResponse.json({ ok: false, error: "Servidor sem service role." }, { status: 503 });
  }

  await admin.from("store_payment_gateway").delete().eq("store_id", r.storeId);
  return NextResponse.json({ ok: true, connected: false });
}
