import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { VERIFICATION_LIMITS } from "@/lib/storeVerification";

export const runtime = "nodejs";

type Body = { storeId?: string; action?: "approve" | "reject"; notes?: string };

/** Aprova ou recusa a verificação de identidade de uma loja. Só admin. */
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
  if (body.action !== "approve" && body.action !== "reject") {
    return NextResponse.json({ ok: false, error: "Ação inválida." }, { status: 400 });
  }
  const status = body.action === "approve" ? "approved" : "rejected";
  const notes = String(body.notes ?? "").trim().slice(0, VERIFICATION_LIMITS.notes) || null;

  const { error } = await db
    .from("store_verifications")
    .update({
      status,
      review_notes: notes,
      reviewed_at: new Date().toISOString(),
      reviewed_by: admin.email ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("store_id", storeId);

  if (error) {
    return NextResponse.json(
      { ok: false, error: "Não foi possível salvar a revisão." },
      { status: 500 }
    );
  }

  revalidatePath(`/admin/clientes/${storeId}`);
  revalidatePath("/admin");
  return NextResponse.json({ ok: true, status });
}
