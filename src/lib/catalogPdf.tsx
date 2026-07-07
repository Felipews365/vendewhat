/**
 * Catálogo da loja em PDF — usado em dois lugares:
 *  - a rota pública [/api/loja/[slug]/catalogo] (o lojista/cliente baixa/abre);
 *  - o atendente de IA no WhatsApp, que anexa o PDF quando o cliente pede o
 *    catálogo (marcador [[ENVIAR_CATALOGO]] em [whatsappRespond.ts]).
 *
 * Gera com @react-pdf/renderer (JS puro, roda no serverless da Vercel — sem
 * Chrome/puppeteer). O @react-pdf só entende JPG/PNG; como as fotos de produto
 * passam pelo crop que exporta JPEG, dá para embutir direto. Fotos em formato
 * não suportado (ex.: WebP no logo) são simplesmente ignoradas.
 *
 * O resultado é cacheado no bucket `product-images` (pasta `catalogos/`) por um
 * tempo curto para não regerar a cada pedido no WhatsApp.
 */
import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import QRCode from "qrcode";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getProductImageUrls } from "@/lib/productImages";
import { optionArrayFromDb } from "@/lib/productOptions";

export type CatalogPdfProduct = {
  name: string;
  price: number;
  description: string | null;
  colors: string[];
  sizes: string[];
  imageDataUri: string | null;
  isPromotion: boolean;
  compareAtPrice: number | null;
};

function brl(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/**
 * Recomprime uma imagem para o PDF: redimensiona para no máx. `IMG_MAX_PX` de
 * largura e reencoda como JPEG (~`IMG_QUALITY`%). Isso derruba o tamanho do PDF
 * (fotos de produto full-res deixavam o catálogo com vários MB). Como o
 * @react-pdf embute os bytes crus da imagem, encolher os bytes = PDF leve.
 * Se o sharp falhar (formato exótico etc.), devolve o buffer original.
 */
const IMG_MAX_PX = 640;
const IMG_QUALITY = 70;
async function compressForPdf(buf: Buffer): Promise<{ buf: Buffer; mime: string }> {
  try {
    const sharp = (await import("sharp")).default;
    const out = await sharp(buf)
      .rotate() // respeita orientação EXIF
      .resize({ width: IMG_MAX_PX, height: IMG_MAX_PX, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: IMG_QUALITY, mozjpeg: true })
      .toBuffer();
    // Só usa se realmente ficou menor (imagens já pequenas podem crescer).
    if (out.length > 0 && out.length < buf.length) {
      return { buf: out, mime: "image/jpeg" };
    }
  } catch {
    /* segue com o original */
  }
  return { buf, mime: buf[0] === 0x89 && buf[1] === 0x50 ? "image/png" : "image/jpeg" };
}

/** Baixa uma imagem e devolve como data URI leve (JPG/PNG; null caso contrário). */
async function fetchImageDataUri(
  url: string,
  timeoutMs = 8000
): Promise<string | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    let mime = (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    if (mime !== "image/jpeg" && mime !== "image/png") {
      // Descobre pelos bytes mágicos (o header pode vir errado/genérico).
      if (buf[0] === 0xff && buf[1] === 0xd8) mime = "image/jpeg";
      else if (buf[0] === 0x89 && buf[1] === 0x50) mime = "image/png";
      else {
        // WebP e afins: o @react-pdf não renderiza direto, mas o sharp converte.
        const conv = await compressForPdf(buf);
        if (conv.mime === "image/jpeg" && conv.buf !== buf) {
          return `data:image/jpeg;base64,${conv.buf.toString("base64")}`;
        }
        return null;
      }
    }
    const { buf: outBuf, mime: outMime } = await compressForPdf(buf);
    return `data:${outMime};base64,${outBuf.toString("base64")}`;
  } catch {
    return null;
  }
}

/** Resolve promessas com um limite de concorrência (não abre 60 fetches de uma vez). */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const i = cursor++;
      out[i] = await fn(items[i], i);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker())
  );
  return out;
}

const styles = StyleSheet.create({
  page: {
    paddingTop: 28,
    paddingBottom: 40,
    paddingHorizontal: 28,
    fontFamily: "Helvetica",
    color: "#0f172a",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
    paddingBottom: 12,
    marginBottom: 16,
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  logo: { width: 44, height: 44, borderRadius: 8, objectFit: "cover" },
  storeName: { fontSize: 18, fontFamily: "Helvetica-Bold" },
  storeSub: { fontSize: 9, color: "#64748b", marginTop: 2 },
  qrBox: { alignItems: "center", width: 92 },
  qr: { width: 72, height: 72 },
  qrCaption: { fontSize: 7, color: "#64748b", marginTop: 3, textAlign: "center" },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  card: {
    width: "50%",
    padding: 6,
  },
  cardInner: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 8,
    overflow: "hidden",
  },
  image: { width: "100%", height: 150, objectFit: "cover" },
  imagePlaceholder: {
    width: "100%",
    height: 150,
    backgroundColor: "#f1f5f9",
    alignItems: "center",
    justifyContent: "center",
  },
  imagePlaceholderText: { fontSize: 8, color: "#94a3b8" },
  cardBody: { padding: 8 },
  name: { fontSize: 11, fontFamily: "Helvetica-Bold", marginBottom: 3 },
  priceRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 3 },
  price: { fontSize: 12, fontFamily: "Helvetica-Bold", color: "#0f172a" },
  priceOld: { fontSize: 8, color: "#94a3b8", textDecoration: "line-through" },
  promoTag: {
    fontSize: 7,
    color: "#ffffff",
    backgroundColor: "#dc2626",
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
  },
  meta: { fontSize: 8, color: "#475569", marginTop: 1 },
  desc: { fontSize: 8, color: "#64748b", marginTop: 3 },
  footer: {
    position: "absolute",
    bottom: 18,
    left: 28,
    right: 28,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 8,
    color: "#94a3b8",
  },
});

function CatalogDocument(props: {
  storeName: string;
  storeUrl: string;
  logoDataUri: string | null;
  qrDataUri: string | null;
  products: CatalogPdfProduct[];
}) {
  const { storeName, storeUrl, logoDataUri, qrDataUri, products } = props;
  return (
    <Document title={`Catálogo - ${storeName}`} author={storeName}>
      <Page size="A4" style={styles.page} wrap>
        <View style={styles.header} fixed>
          <View style={styles.headerLeft}>
            {logoDataUri ? <Image style={styles.logo} src={logoDataUri} /> : null}
            <View>
              <Text style={styles.storeName}>{storeName}</Text>
              <Text style={styles.storeSub}>
                Catálogo de produtos • {products.length}{" "}
                {products.length === 1 ? "item" : "itens"}
              </Text>
            </View>
          </View>
          {qrDataUri ? (
            <View style={styles.qrBox}>
              <Image style={styles.qr} src={qrDataUri} />
              <Text style={styles.qrCaption}>Compre pelo site</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.grid}>
          {products.map((p, i) => {
            const hasPromo =
              p.isPromotion && p.compareAtPrice != null && p.compareAtPrice > p.price;
            return (
              <View style={styles.card} key={i} wrap={false}>
                <View style={styles.cardInner}>
                  {p.imageDataUri ? (
                    <Image style={styles.image} src={p.imageDataUri} />
                  ) : (
                    <View style={styles.imagePlaceholder}>
                      <Text style={styles.imagePlaceholderText}>Sem foto</Text>
                    </View>
                  )}
                  <View style={styles.cardBody}>
                    <Text style={styles.name}>{p.name}</Text>
                    <View style={styles.priceRow}>
                      <Text style={styles.price}>{brl(p.price)}</Text>
                      {hasPromo ? (
                        <>
                          <Text style={styles.priceOld}>
                            {brl(p.compareAtPrice as number)}
                          </Text>
                          <Text style={styles.promoTag}>PROMO</Text>
                        </>
                      ) : null}
                    </View>
                    {p.colors.length > 0 ? (
                      <Text style={styles.meta}>Cores: {p.colors.join(", ")}</Text>
                    ) : null}
                    {p.sizes.length > 0 ? (
                      <Text style={styles.meta}>Tamanhos: {p.sizes.join(", ")}</Text>
                    ) : null}
                    {p.description ? (
                      <Text style={styles.desc}>
                        {p.description.replace(/\s+/g, " ").trim().slice(0, 160)}
                      </Text>
                    ) : null}
                  </View>
                </View>
              </View>
            );
          })}
        </View>

        <View style={styles.footer} fixed>
          <Text>{storeUrl}</Text>
          <Text
            render={({ pageNumber, totalPages }) => `${pageNumber}/${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  );
}

/** Monta o PDF do catálogo (buffer). As fotos já devem vir como data URI. */
export async function buildCatalogPdfBuffer(args: {
  storeName: string;
  storeUrl: string;
  logoUrl: string | null;
  products: CatalogPdfProduct[];
}): Promise<Buffer> {
  const [logoDataUri, qrDataUri] = await Promise.all([
    args.logoUrl ? fetchImageDataUri(args.logoUrl) : Promise.resolve(null),
    QRCode.toDataURL(args.storeUrl, { margin: 1, width: 200 }).catch(() => null),
  ]);
  return renderToBuffer(
    <CatalogDocument
      storeName={args.storeName}
      storeUrl={args.storeUrl}
      logoDataUri={logoDataUri}
      qrDataUri={qrDataUri}
      products={args.products}
    />
  );
}

type ProductRow = {
  name?: unknown;
  price?: unknown;
  description?: unknown;
  colors?: unknown;
  sizes?: unknown;
  image?: string | null;
  images?: unknown;
  is_promotion?: unknown;
  compare_at_price?: unknown;
};

/** Busca os produtos ativos da loja e baixa as fotos de capa (como data URI). */
async function loadCatalogProducts(
  admin: SupabaseClient,
  storeId: string
): Promise<CatalogPdfProduct[]> {
  const { data } = await admin
    .from("products")
    .select(
      "name, price, description, colors, sizes, image, images, is_promotion, compare_at_price, active, created_at"
    )
    .eq("store_id", storeId)
    .or("active.eq.true,active.is.null")
    .order("created_at", { ascending: false })
    .limit(80);

  const rows = (data ?? []) as ProductRow[];
  const covers = rows.map(
    (r) => getProductImageUrls({ image: r.image, images: r.images })[0] ?? null
  );
  const dataUris = await mapWithConcurrency(covers, 8, (url) =>
    url ? fetchImageDataUri(url) : Promise.resolve(null)
  );

  return rows.map((r, i) => {
    const price =
      typeof r.price === "number" ? r.price : parseFloat(String(r.price ?? 0)) || 0;
    const compare =
      r.compare_at_price == null
        ? null
        : typeof r.compare_at_price === "number"
        ? r.compare_at_price
        : parseFloat(String(r.compare_at_price)) || null;
    return {
      name: typeof r.name === "string" ? r.name : "Produto",
      price,
      description: typeof r.description === "string" ? r.description : null,
      colors: optionArrayFromDb(r.colors),
      sizes: optionArrayFromDb(r.sizes),
      imageDataUri: dataUris[i],
      isPromotion: r.is_promotion === true,
      compareAtPrice: compare,
    };
  });
}

const CATALOG_BUCKET = "product-images";
const CATALOG_DIR = "catalogos";
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 min: edições aparecem em até meia hora.

function catalogPath(slug: string): string {
  return `${CATALOG_DIR}/${slug}.pdf`;
}

/**
 * Garante um PDF do catálogo no bucket e devolve a URL pública (com `?v=` para
 * furar cache de CDN). Regenera se não existir ou se o cache estiver velho.
 * Retorna null se a loja não tem produtos (não faz sentido mandar catálogo vazio).
 */
export async function ensureCatalogPdfUrl(
  admin: SupabaseClient,
  args: {
    storeId: string;
    slug: string;
    storeName: string;
    logoUrl: string | null;
    baseUrl: string;
  }
): Promise<string | null> {
  const bucket = admin.storage.from(CATALOG_BUCKET);
  const path = catalogPath(args.slug);
  const publicUrl = bucket.getPublicUrl(path).data.publicUrl;
  const storeUrl = `${args.baseUrl.replace(/\/+$/, "")}/loja/${args.slug}`;

  // Cache recente? Reaproveita sem regerar. Um HEAD no arquivo público é imediato
  // e confiável (o endpoint `list` do Storage é eventualmente consistente logo
  // após o upload); `no-store` + `?probe=` furam qualquer cache do Next/CDN.
  try {
    const head = await fetch(`${publicUrl}?probe=${Date.now()}`, {
      method: "HEAD",
      cache: "no-store",
    });
    if (head.ok) {
      const lm = head.headers.get("last-modified");
      const stamp = lm ? new Date(lm).getTime() : 0;
      if (stamp && Date.now() - stamp < CACHE_TTL_MS) {
        return `${publicUrl}?v=${stamp}`;
      }
    }
  } catch {
    // Sem cache utilizável: segue e regenera.
  }

  const products = await loadCatalogProducts(admin, args.storeId);
  if (products.length === 0) return null;

  const buffer = await buildCatalogPdfBuffer({
    storeName: args.storeName,
    storeUrl,
    logoUrl: args.logoUrl,
    products,
  });

  const { error } = await bucket.upload(path, buffer, {
    contentType: "application/pdf",
    upsert: true,
    cacheControl: "60",
  });
  if (error) throw error;

  return `${publicUrl}?v=${Date.now()}`;
}
