import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { createServerSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";

type Body = { storeId?: string };

/**
 * Entrar no painel de um lojista (suporte do dono do SaaS).
 *
 * Como o painel do lojista roda no BROWSER com o client do Supabase (RLS por
 * `user_id`), não existe "modo admin" possível por dentro: a única forma de ver
 * o painel exatamente como o cliente vê é **estar logado como ele**. Então aqui
 * geramos um magic link do dono (service role, `generateLink` — não envia
 * e-mail nenhum) e **consumimos o token no próprio servidor** (`verifyOtp`), o
 * que troca o cookie de sessão desta resposta pela sessão do lojista. O token
 * nunca chega ao browser.
 *
 * ⚠️ Efeito colateral inevitável: a sessão de ADMIN deste navegador é
 * substituída pela do lojista (é o mesmo cookie do mesmo domínio). Para voltar
 * ao /admin é preciso entrar de novo em /admin/login — por isso a UI recomenda
 * fazer isso numa janela anônima.
 */
export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ ok: false, error: "Não autorizado." }, { status: 401 });
  }
  const db = createAdminSupabase();
  if (!db) {
    return NextResponse.json(
      { ok: false, error: "Service role não configurada." },
      { status: 503 }
    );
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

  const { data: store } = await db
    .from("stores")
    .select("id, user_id, name")
    .eq("id", storeId)
    .maybeSingle();

  if (!store) {
    return NextResponse.json({ ok: false, error: "Loja não encontrada." }, { status: 404 });
  }

  const { data: owner, error: ownerError } = await db.auth.admin.getUserById(
    (store as { user_id: string }).user_id
  );
  const email = owner?.user?.email;
  if (ownerError || !email) {
    return NextResponse.json(
      { ok: false, error: "Não foi possível identificar o e-mail do dono da loja." },
      { status: 400 }
    );
  }

  const { data: link, error: linkError } = await db.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  const tokenHash = link?.properties?.hashed_token;
  if (linkError || !tokenHash) {
    return NextResponse.json(
      { ok: false, error: linkError?.message || "Não foi possível gerar o acesso." },
      { status: 502 }
    );
  }

  // Consome o token aqui mesmo: é esta chamada que grava o cookie de sessão do
  // lojista no navegador do admin (a resposta carrega o Set-Cookie).
  const supabase = await createServerSupabase();
  const { error: verifyError } = await supabase.auth.verifyOtp({
    type: "magiclink",
    token_hash: tokenHash,
  });
  if (verifyError) {
    return NextResponse.json(
      { ok: false, error: verifyError.message || "Falha ao abrir a sessão do lojista." },
      { status: 502 }
    );
  }

  console.log(
    `[admin/impersonate] ${admin.email} entrou no painel da loja ${storeId} (${email})`
  );

  return NextResponse.json({
    ok: true,
    email,
    storeName: (store as { name: string }).name,
  });
}
