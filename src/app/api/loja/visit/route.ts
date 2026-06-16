import { NextResponse } from "next/server";
import { normalizeStoreSlug } from "@/lib/storeSlug";
import { createAdminSupabase } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type Body = { slug?: string };

/**
 * Registra um acesso à loja pública (uma linha em store_visits). Público:
 * chamado pela página da loja no carregamento. Sempre responde 200 — contar
 * visita nunca pode quebrar a loja. Escreve via service role.
 */
export async function POST(req: Request) {
  const admin = createAdminSupabase();
  if (!admin) return NextResponse.json({ ok: true });

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: true });
  }

  const slug = normalizeStoreSlug(String(body.slug ?? ""));
  if (!slug) return NextResponse.json({ ok: true });

  try {
    const { data: store } = await admin
      .from("stores")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    if (store?.id) {
      await admin.from("store_visits").insert({ store_id: store.id });
    }
  } catch (err) {
    console.error("[loja/visit]", err);
  }

  return NextResponse.json({ ok: true });
}
