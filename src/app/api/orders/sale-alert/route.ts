import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type Body = {
  saleAlertEnabled?: boolean;
  saleAlertPhone?: string;
};

/**
 * Salva o aviso de venda por WhatsApp (liga/desliga + número que recebe). Faz um
 * patch no JSONB `storefront` preservando o resto — mesmo padrão de
 * `/api/whatsapp/config`. Só o dono da loja pode salvar.
 */
export async function POST(req: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });
  }

  const { data: store } = await supabase
    .from("stores")
    .select("id, storefront")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!store?.id) {
    return NextResponse.json({ ok: false, error: "Loja não encontrada." }, { status: 404 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido." }, { status: 400 });
  }

  const admin = createAdminSupabase();
  if (!admin) {
    return NextResponse.json(
      { ok: false, error: "Servidor sem service role." },
      { status: 503 }
    );
  }

  const patch: Record<string, unknown> = {};
  if (typeof body.saleAlertEnabled === "boolean") {
    patch.saleAlertEnabled = body.saleAlertEnabled;
  }
  if (typeof body.saleAlertPhone === "string") {
    patch.saleAlertPhone = body.saleAlertPhone.replace(/\D/g, "").slice(0, 15);
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ ok: false, error: "Nada para salvar." }, { status: 400 });
  }

  const current =
    store.storefront && typeof store.storefront === "object"
      ? (store.storefront as Record<string, unknown>)
      : {};
  const { error } = await admin
    .from("stores")
    .update({ storefront: { ...current, ...patch } })
    .eq("id", store.id as string);

  if (error) {
    return NextResponse.json(
      { ok: false, error: "Não foi possível salvar." },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
