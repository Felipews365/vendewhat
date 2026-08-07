/**
 * CRM — "Atualizar base": recadastra os clientes da loja a partir dos pedidos e
 * das conversas. Repara divergência e traz quem entrou antes de a migration ser
 * aplicada. Toda a varredura roda em SQL (`crm_resync_store`), numa chamada só.
 */
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 60;

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

export async function POST() {
  const ctx = await resolveStore();
  if ("error" in ctx) return ctx.error;
  const { storeId, admin } = ctx;

  const { error } = await admin.rpc("crm_resync_store", { p_store_id: storeId });
  if (error) {
    console.error("[api/crm/sync]", error.message);
    return NextResponse.json(
      {
        ok: false,
        error:
          "Não foi possível atualizar a base. Rode a migration crm-customers no Supabase.",
      },
      { status: 500 }
    );
  }

  const { count } = await admin
    .from("crm_customers")
    .select("id", { count: "exact", head: true })
    .eq("store_id", storeId);

  return NextResponse.json({ ok: true, total: count ?? 0 });
}
