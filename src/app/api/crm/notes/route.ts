/**
 * CRM — anotações internas do cliente. Nunca vão para o cliente.
 */
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";

export const runtime = "nodejs";

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

const MIGRATION_HINT =
  "Não foi possível salvar a anotação. Rode a migration crm-notes-tasks no Supabase.";

export async function GET(req: Request) {
  const ctx = await resolveStore();
  if ("error" in ctx) return ctx.error;
  const { storeId, admin } = ctx;

  const customerId = (new URL(req.url).searchParams.get("customerId") ?? "").trim();
  if (!customerId) {
    return NextResponse.json(
      { ok: false, error: "Informe o cliente." },
      { status: 400 }
    );
  }

  try {
    const { data, error } = await admin
      .from("crm_notes")
      .select("id, body, created_at")
      .eq("store_id", storeId)
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, notes: data ?? [] });
  } catch {
    // Migration pendente: a ficha abre sem a seção, sem quebrar.
    return NextResponse.json({ ok: true, notes: [] });
  }
}

type Body = { customerId?: string; body?: string; id?: string; remove?: boolean };

export async function POST(req: Request) {
  const ctx = await resolveStore();
  if ("error" in ctx) return ctx.error;
  const { storeId, admin } = ctx;

  let payload: Body;
  try {
    payload = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido." }, { status: 400 });
  }

  if (payload.remove && payload.id) {
    try {
      await admin
        .from("crm_notes")
        .delete()
        .eq("store_id", storeId)
        .eq("id", payload.id);
      return NextResponse.json({ ok: true });
    } catch {
      return NextResponse.json({ ok: false, error: MIGRATION_HINT }, { status: 500 });
    }
  }

  const customerId = String(payload.customerId ?? "").trim();
  const text = String(payload.body ?? "").trim().slice(0, 2000);
  if (!customerId || text.length < 2) {
    return NextResponse.json(
      { ok: false, error: "Escreva a anotação." },
      { status: 400 }
    );
  }

  try {
    const { data, error } = await admin
      .from("crm_notes")
      .insert({ store_id: storeId, customer_id: customerId, body: text })
      .select("id, body, created_at")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, note: data });
  } catch (err) {
    console.error("[api/crm/notes]", err);
    return NextResponse.json({ ok: false, error: MIGRATION_HINT }, { status: 500 });
  }
}
