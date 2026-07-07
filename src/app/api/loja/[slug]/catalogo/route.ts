/**
 * Catálogo da loja em PDF (público). Gera/reaproveita o PDF no bucket e redireciona
 * para ele. Mesma lógica que a IA usa no WhatsApp (ver [catalogPdf.ts] e
 * [whatsappRespond.ts]) — aqui é o acesso por link/navegador.
 *
 * Ex.: GET /api/loja/minha-loja/catalogo → 302 para o PDF no Storage.
 */
import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { normalizeStoreSlug } from "@/lib/storeSlug";
import { ensureCatalogPdfUrl } from "@/lib/catalogPdf";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: { slug: string } }
) {
  const slug = normalizeStoreSlug(params.slug);
  const admin = createAdminSupabase();
  if (!admin) {
    return NextResponse.json(
      { error: "Serviço indisponível." },
      { status: 503 }
    );
  }

  const { data: store } = await admin
    .from("stores")
    .select("id, name, slug, logo")
    .eq("slug", slug)
    .maybeSingle();
  if (!store?.id) {
    return NextResponse.json({ error: "Loja não encontrada." }, { status: 404 });
  }

  // Base para o link/QR dentro do PDF: host real da requisição (cai no APP_BASE_URL).
  const url = new URL(req.url);
  const baseUrl =
    process.env.APP_BASE_URL ||
    `${url.protocol}//${req.headers.get("x-forwarded-host") || url.host}`;

  try {
    const pdfUrl = await ensureCatalogPdfUrl(admin, {
      storeId: String(store.id),
      slug: String(store.slug ?? slug),
      storeName: String(store.name ?? "Loja"),
      logoUrl: typeof store.logo === "string" ? store.logo : null,
      baseUrl,
    });
    if (!pdfUrl) {
      return NextResponse.json(
        { error: "A loja ainda não tem produtos no catálogo." },
        { status: 404 }
      );
    }
    return NextResponse.redirect(pdfUrl, 302);
  } catch (e) {
    console.error("[api/loja/catalogo] erro ao gerar PDF", e);
    return NextResponse.json(
      { error: "Não foi possível gerar o catálogo." },
      { status: 500 }
    );
  }
}
