/**
 * Catálogo da loja em PDF (público). Gera/reaproveita o PDF no bucket e redireciona
 * para ele. Mesma lógica que a IA usa no WhatsApp (ver [catalogPdf.ts] e
 * [whatsappRespond.ts]) — aqui é o acesso por link/navegador.
 *
 * Ex.: GET /api/loja/minha-loja/catalogo → 302 para o PDF no Storage.
 * Com `?download=1` o PDF é servido pelo próprio app com `Content-Disposition:
 * attachment` e um nome amigável ("Catálogo - Loja.pdf"), para baixar de fato
 * (o redirecionamento ao Storage abre no visualizador em vez de baixar).
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

    // ?download=1 → o app baixa o PDF do Storage e o entrega como anexo, com
    // nome amigável. Sem o param, mantém o 302 (usado pela IA/humanos/prévia).
    if (url.searchParams.get("download") === "1") {
      const pdfRes = await fetch(pdfUrl);
      if (!pdfRes.ok) {
        return NextResponse.redirect(pdfUrl, 302);
      }
      const buf = await pdfRes.arrayBuffer();
      const storeName = String(store.name ?? "Loja");
      // Nome ASCII para o `filename=` (fallback) + `filename*` em UTF-8 (acentos).
      const rawName = `Catálogo - ${storeName}.pdf`;
      const asciiName =
        rawName.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\x20-\x7e]/g, "_") ||
        "catalogo.pdf";
      return new NextResponse(buf, {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(
            rawName
          )}`,
          "Cache-Control": "no-store",
        },
      });
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
