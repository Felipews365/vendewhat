import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { setContactName } from "@/lib/whatsappConfig";

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

type Body = { phone?: string; name?: string };

// Renomeia (ou limpa) o nome do contato de uma conversa.
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
  if (!phone) {
    return NextResponse.json(
      { ok: false, error: "Informe o número do cliente." },
      { status: 400 }
    );
  }

  try {
    const name = await setContactName(
      admin,
      storeId,
      phone,
      typeof body.name === "string" ? body.name : ""
    );
    return NextResponse.json({ ok: true, name });
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Não foi possível salvar o nome. Rode a migration whatsapp-contacts no Supabase.",
      },
      { status: 500 }
    );
  }
}
