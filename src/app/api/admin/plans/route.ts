import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { createAdminSupabase } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const VALID_ACCENTS = ["pink", "cyan", "purple"];
const VALID_ICONS = ["bolt", "star", "briefcase"];

type Body = {
  id?: string;
  title?: string;
  description?: string | null;
  monthly?: number | string;
  features?: string[];
  accent?: string;
  icon?: string;
  highlight?: boolean;
  sortOrder?: number;
  active?: boolean;
};

/** Atualiza um plano existente (preço, título, features, etc.). */
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

  const id = String(body.id ?? "").trim();
  if (!id) {
    return NextResponse.json({ ok: false, error: "id do plano obrigatório." }, { status: 400 });
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (body.title !== undefined) update.title = String(body.title).slice(0, 120);
  if (body.description !== undefined) {
    update.description = body.description ? String(body.description).slice(0, 1000) : null;
  }
  if (body.monthly !== undefined) {
    const n = Number(body.monthly);
    if (Number.isNaN(n) || n < 0) {
      return NextResponse.json({ ok: false, error: "Valor inválido." }, { status: 400 });
    }
    update.monthly = n;
  }
  if (body.features !== undefined) {
    update.features = Array.isArray(body.features)
      ? body.features.map((f) => String(f).slice(0, 200)).filter(Boolean)
      : [];
  }
  if (body.accent !== undefined && VALID_ACCENTS.includes(body.accent)) {
    update.accent = body.accent;
  }
  if (body.icon !== undefined && VALID_ICONS.includes(body.icon)) {
    update.icon = body.icon;
  }
  if (body.highlight !== undefined) update.highlight = Boolean(body.highlight);
  if (body.sortOrder !== undefined) update.sort_order = Number(body.sortOrder) || 0;
  if (body.active !== undefined) update.active = Boolean(body.active);

  const { data, error } = await db
    .from("plans")
    .update(update)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    console.error("[api/admin/plans] update", error);
    return NextResponse.json(
      { ok: false, error: "Não foi possível salvar o plano." },
      { status: 500 }
    );
  }

  revalidatePath("/admin/planos");
  revalidatePath("/dashboard/planos");
  revalidatePath("/");

  return NextResponse.json({ ok: true, plan: data });
}
