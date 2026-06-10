import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { createAdminSupabase } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const VALID_STATUS = ["trial", "active", "past_due", "canceled", "expired", "vitalicio"];
const VALID_CYCLE = ["monthly", "annual"];

type Body = {
  storeId?: string;
  planId?: string | null;
  status?: string;
  billingCycle?: string;
  amount?: number | string | null;
  expiresAt?: string | null;
  notes?: string | null;
};

/** Cria/atualiza a assinatura de uma loja (upsert por store_id). */
export async function PATCH(req: Request) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ ok: false, error: "Não autorizado." }, { status: 401 });
  }

  const db = createAdminSupabase();
  if (!db) {
    return NextResponse.json(
      { ok: false, error: "Service role não configurada no servidor." },
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

  const update: Record<string, unknown> = {
    store_id: storeId,
    updated_at: new Date().toISOString(),
  };

  if (body.planId !== undefined) update.plan_id = body.planId || null;

  if (body.status !== undefined) {
    if (!VALID_STATUS.includes(String(body.status))) {
      return NextResponse.json({ ok: false, error: "Status inválido." }, { status: 400 });
    }
    update.status = body.status;
  }

  if (body.billingCycle !== undefined) {
    if (!VALID_CYCLE.includes(String(body.billingCycle))) {
      return NextResponse.json({ ok: false, error: "Ciclo inválido." }, { status: 400 });
    }
    update.billing_cycle = body.billingCycle;
  }

  if (body.amount !== undefined) {
    const n = body.amount === null || body.amount === "" ? null : Number(body.amount);
    if (n !== null && (Number.isNaN(n) || n < 0)) {
      return NextResponse.json({ ok: false, error: "Valor inválido." }, { status: 400 });
    }
    update.amount = n;
  }

  if (body.expiresAt !== undefined) {
    update.expires_at = body.expiresAt ? new Date(body.expiresAt).toISOString() : null;
  }

  if (body.notes !== undefined) {
    update.notes = body.notes ? String(body.notes).slice(0, 2000) : null;
  }

  const { data, error } = await db
    .from("subscriptions")
    .upsert(update, { onConflict: "store_id" })
    .select("*")
    .single();

  if (error) {
    console.error("[api/admin/subscriptions] upsert", error);
    return NextResponse.json(
      { ok: false, error: "Não foi possível salvar a assinatura." },
      { status: 500 }
    );
  }

  revalidatePath("/admin");
  revalidatePath(`/admin/clientes/${storeId}`);

  return NextResponse.json({ ok: true, subscription: data });
}
