import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { createAdminSupabase } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type Body = {
  storeId?: string;
  amount?: number | string;
  method?: string;
  paidAt?: string | null;
  periodEnd?: string | null;
  notes?: string | null;
  /** Se true, estende subscriptions.expires_at para periodEnd. */
  extendSubscription?: boolean;
};

/** Registra um pagamento (hoje manual) e, opcionalmente, estende o vencimento. */
export async function POST(req: Request) {
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

  const amount = Number(body.amount);
  if (Number.isNaN(amount) || amount < 0) {
    return NextResponse.json({ ok: false, error: "Valor inválido." }, { status: 400 });
  }

  const paidAt = body.paidAt ? new Date(body.paidAt).toISOString() : new Date().toISOString();
  const periodEnd = body.periodEnd ? new Date(body.periodEnd).toISOString() : null;

  const { data: payment, error } = await db
    .from("payments")
    .insert({
      store_id: storeId,
      amount,
      method: body.method ? String(body.method).slice(0, 40) : "manual",
      paid_at: paidAt,
      period_end: periodEnd,
      notes: body.notes ? String(body.notes).slice(0, 2000) : null,
    })
    .select("*")
    .single();

  if (error) {
    console.error("[api/admin/payments] insert", error);
    return NextResponse.json(
      { ok: false, error: "Não foi possível registrar o pagamento." },
      { status: 500 }
    );
  }

  // Estende o vencimento da assinatura, se solicitado e houver período.
  if (body.extendSubscription && periodEnd) {
    const { error: subErr } = await db
      .from("subscriptions")
      .upsert(
        {
          store_id: storeId,
          expires_at: periodEnd,
          status: "active",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "store_id" }
      );
    if (subErr) {
      console.error("[api/admin/payments] extend subscription", subErr);
    }
  }

  revalidatePath("/admin");
  revalidatePath(`/admin/clientes/${storeId}`);

  return NextResponse.json({ ok: true, payment });
}
