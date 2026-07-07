import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { listConversationTags, setConversationTags } from "@/lib/whatsappConfig";

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

// Todas as tags da loja (mapa telefone -> tags).
export async function GET() {
  const ctx = await resolveStore();
  if ("error" in ctx) return ctx.error;
  const { storeId, admin } = ctx;
  try {
    const tags = await listConversationTags(admin, storeId);
    return NextResponse.json({ ok: true, tags });
  } catch {
    // Tabela ainda não criada (migration pendente): devolve vazio sem quebrar.
    return NextResponse.json({ ok: true, tags: {} });
  }
}

type Body = { phone?: string; tags?: string[] };

// Define as tags de uma conversa.
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
    const tags = await setConversationTags(
      admin,
      storeId,
      phone,
      Array.isArray(body.tags) ? body.tags : []
    );
    return NextResponse.json({ ok: true, tags });
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Não foi possível salvar as tags. Rode a migration whatsapp-tags no Supabase.",
      },
      { status: 500 }
    );
  }
}
