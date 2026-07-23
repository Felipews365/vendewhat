/**
 * Catálogo da loja em PDF — usado em dois lugares:
 *  - a rota pública [/api/loja/[slug]/catalogo] (o lojista/cliente baixa/abre);
 *  - o atendente de IA no WhatsApp, que anexa o PDF quando o cliente pede o
 *    catálogo (marcador [[ENVIAR_CATALOGO]] em [whatsappRespond.ts]).
 *
 * É um **catálogo comercial de alta conversão**: capa com marca + chamada, seções
 * por categoria (cada categoria começa em página nova), e um bloco por produto
 * (foto de destaque + até 2 fotos menores, preço, cores, tamanhos, descrição
 * reescrita em tom comercial, referência e código). Layout vertical, pensado para
 * ler no celular e compartilhar no WhatsApp. Usa a cor da loja (`themePrimary`)
 * como acento.
 *
 * Gera com @react-pdf/renderer (JS puro, roda no serverless da Vercel — sem
 * Chrome/puppeteer). O @react-pdf só entende JPG/PNG; as fotos são recomprimidas
 * com `sharp` (que também converte WebP→JPEG) antes de embutir — isso mantém o
 * arquivo leve (< 10 MB) sem perder qualidade visual.
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
  renderToBuffer,
} from "@react-pdf/renderer";
import QRCode from "qrcode";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getProductImageUrls } from "@/lib/productImages";
import { optionArrayFromDb } from "@/lib/productOptions";

export type CatalogPdfProduct = {
  name: string;
  category: string | null;
  reference: string | null;
  barcode: string | null;
  price: number;
  description: string | null;
  colors: string[];
  sizes: string[];
  /** Foto de capa (índice 0) + até 2 fotos secundárias, com dimensões. */
  images: CatImg[];
  isPromotion: boolean;
  compareAtPrice: number | null;
};

function brl(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/* ------------------------------------------------------------------ *
 * Cor da loja: acento, contraste e tons derivados
 * ------------------------------------------------------------------ */

const DEFAULT_ACCENT = "#c9a8ac";

function clampByte(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const int = parseInt(m[1], 16);
  return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 };
}
function rgbToHex(c: { r: number; g: number; b: number }): string {
  return (
    "#" +
    [c.r, c.g, c.b].map((v) => clampByte(v).toString(16).padStart(2, "0")).join("")
  );
}
/** Mistura `hex` com `target` (0 = só hex, 1 = só target). */
function mix(hex: string, target: string, amount: number): string {
  const a = hexToRgb(hex) ?? { r: 0, g: 0, b: 0 };
  const b = hexToRgb(target) ?? { r: 0, g: 0, b: 0 };
  return rgbToHex({
    r: a.r + (b.r - a.r) * amount,
    g: a.g + (b.g - a.g) * amount,
    b: a.b + (b.b - a.b) * amount,
  });
}
/** Luminância relativa (0 escuro → 1 claro) para decidir contraste. */
function luminance(hex: string): number {
  const c = hexToRgb(hex) ?? { r: 0, g: 0, b: 0 };
  const f = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
}

type Palette = {
  primary: string; // acento da loja (faixas/CTA)
  onPrimary: string; // texto sobre o acento
  ink: string; // acento legível sobre branco (preço, links, eyebrow)
};
function buildPalette(accent: string | null): Palette {
  const primary = accent && hexToRgb(accent) ? accent : DEFAULT_ACCENT;
  const light = luminance(primary);
  return {
    primary,
    onPrimary: light > 0.55 ? "#0f172a" : "#ffffff",
    // Se o acento é claro demais, escurece para garantir leitura sobre branco.
    ink: light > 0.5 ? mix(primary, "#000000", 0.5) : primary,
  };
}

/* ------------------------------------------------------------------ *
 * Copy comercial (determinística — não inventa preço/cor/tamanho)
 * ------------------------------------------------------------------ */

/** Deixa a descrição real com cara comercial: limpa espaços, corrige CAIXA ALTA,
 * capitaliza e fecha com ponto. Não acrescenta fatos que não estejam no texto. */
function polishDescription(raw: string): string {
  let s = raw.replace(/\s+/g, " ").trim();
  if (!s) return "";
  const letters = (s.match(/[a-zA-ZÀ-ÿ]/g) ?? []).length;
  const uppers = (s.match(/[A-ZÀ-Þ]/g) ?? []).length;
  if (letters > 0 && uppers / letters > 0.6) s = s.toLowerCase(); // texto gritado → normaliza
  s = s.charAt(0).toUpperCase() + s.slice(1);
  if (s.length > 170) {
    s = s.slice(0, 165).replace(/[\s,;.]+\S*$/, "") + "…";
  } else if (!/[.!?…]$/.test(s)) {
    s += ".";
  }
  return s;
}

/** Só a descrição REAL cadastrada pelo lojista (limpa/normalizada). Sem texto
 * inventado: se o produto não tem descrição, volta vazio e o card não mostra nada. */
function commercialCopy(p: CatalogPdfProduct): string {
  return polishDescription(p.description ?? "");
}

function discountPct(price: number, compare: number | null): number | null {
  if (compare == null || compare <= price || compare <= 0) return null;
  return Math.round(((compare - price) / compare) * 100);
}

/* ------------------------------------------------------------------ *
 * Imagens: baixa + recomprime (leve) para embutir no PDF
 * ------------------------------------------------------------------ */

/** Imagem já pronta para o PDF: data URI + dimensões (para dimensionar sem cortar). */
export type CatImg = { uri: string; w: number; h: number };

/**
 * Recomprime uma imagem para o PDF: redimensiona para no máx. `maxPx` de largura
 * e reencoda como JPEG. Isso derruba o tamanho do PDF (fotos full-res deixavam o
 * catálogo com vários MB). O `sharp` também converte WebP→JPEG. Devolve também as
 * dimensões finais (para renderizar respeitando a proporção, sem cortar). Se
 * falhar (formato exótico etc.), devolve o buffer original sem dimensões.
 */
async function compressForPdf(
  buf: Buffer,
  maxPx = 640,
  quality = 70
): Promise<{ buf: Buffer; mime: string; w: number; h: number }> {
  try {
    const sharp = (await import("sharp")).default;
    const { data, info } = await sharp(buf)
      .rotate() // respeita orientação EXIF
      .resize({ width: maxPx, height: maxPx, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality, mozjpeg: true })
      .toBuffer({ resolveWithObject: true });
    const w = info.width ?? 0;
    const h = info.height ?? 0;
    // Usa a versão comprimida quando fica menor; senão mantém os bytes originais,
    // mas aproveita as dimensões (a proporção é a mesma).
    if (data.length > 0 && data.length < buf.length) {
      return { buf: data, mime: "image/jpeg", w, h };
    }
    return {
      buf,
      mime: buf[0] === 0x89 && buf[1] === 0x50 ? "image/png" : "image/jpeg",
      w,
      h,
    };
  } catch {
    return { buf, mime: buf[0] === 0x89 && buf[1] === 0x50 ? "image/png" : "image/jpeg", w: 0, h: 0 };
  }
}

/** Baixa uma imagem e devolve como data URI leve + dimensões (null se não der). */
async function fetchImageDataUri(
  url: string,
  maxPx = 640,
  quality = 70,
  timeoutMs = 8000
): Promise<CatImg | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    let mime = (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    if (mime !== "image/jpeg" && mime !== "image/png") {
      if (buf[0] === 0xff && buf[1] === 0xd8) mime = "image/jpeg";
      else if (buf[0] === 0x89 && buf[1] === 0x50) mime = "image/png";
      else {
        // WebP e afins: o @react-pdf não renderiza direto, mas o sharp converte.
        const conv = await compressForPdf(buf, maxPx, quality);
        if (conv.mime === "image/jpeg" && conv.buf !== buf) {
          return { uri: `data:image/jpeg;base64,${conv.buf.toString("base64")}`, w: conv.w, h: conv.h };
        }
        return null;
      }
    }
    const conv = await compressForPdf(buf, maxPx, quality);
    return { uri: `data:${conv.mime};base64,${conv.buf.toString("base64")}`, w: conv.w, h: conv.h };
  } catch {
    return null;
  }
}

/** Resolve promessas com um limite de concorrência (não abre N fetches de uma vez). */
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

/* ------------------------------------------------------------------ *
 * Documento (react-pdf)
 * ------------------------------------------------------------------ */

type CatalogGroup = { category: string; items: CatalogPdfProduct[] };

// Conectores que ficam minúsculos no meio do título (padronização de nomes).
const LOWER_WORDS = new Set(["de", "da", "do", "das", "dos", "e", "com", "para", "a", "o", "em"]);
/** Padroniza o nome da categoria: colapsa espaços e coloca em Title Case ptBR. */
function titleCaseCategory(raw: string): string {
  return raw
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .split(" ")
    .map((w, i) =>
      i > 0 && LOWER_WORDS.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)
    )
    .join(" ");
}

/** Agrupa por categoria (case-insensitive, evita seções duplicadas) preservando a
 * ordem de aparição; sem categoria vai por último. O rótulo sai padronizado. */
function groupByCategory(products: CatalogPdfProduct[]): CatalogGroup[] {
  const map = new Map<string, { label: string; items: CatalogPdfProduct[] }>();
  const order: string[] = [];
  const NONE = ""; // sentinel impossível de vir de uma categoria real
  for (const p of products) {
    const clean = (p.category ?? "").replace(/\s+/g, " ").trim();
    const key = clean ? clean.toLowerCase() : NONE;
    if (!map.has(key)) {
      map.set(key, { label: clean ? titleCaseCategory(clean) : "", items: [] });
      order.push(key);
    }
    map.get(key)!.items.push(p);
  }
  const groups: CatalogGroup[] = order
    .filter((k) => k !== NONE)
    .map((k) => ({ category: map.get(k)!.label, items: map.get(k)!.items }));
  if (map.has(NONE)) {
    groups.push({
      category: groups.length ? "Mais produtos" : "Produtos",
      items: map.get(NONE)!.items,
    });
  }
  return groups;
}

const IMPACT_PHRASE =
  "Peças selecionadas com estilo, conforto e qualidade para você usar todo dia. Escolha suas favoritas e chame no WhatsApp — rápido, fácil e sem complicação.";

// --- Página no formato de CELULAR (mobile-first) ---------------------------
// A LARGURA fixa (400pt) é o que define o tamanho do texto no celular: a página
// escala para a largura da tela, então texto grande = leitura sem zoom. A ALTURA
// é calculada por produto (a foto respeita a proporção real, sem cortar), então
// cada produto ocupa a sua própria página do tamanho exato do conteúdo.
const PAGE_W = 400;
const PAGE_PAD_X = 22;
const CARD_PAD = 14;
const CARD_INNER_W = PAGE_W - PAGE_PAD_X * 2 - CARD_PAD * 2; // = 328 (largura da foto)
const MAIN_IMG_MAX_H = 460; // teto da foto (a página cresce para acomodá-la)
const MAIN_IMG_MIN_H = 220;
// Miniaturas: meia largura (a única também), altura pela proporção real (sem cortar).
const THUMB_GAP = 10;
const THUMB_COL_W = (CARD_INNER_W - THUMB_GAP) / 2; // = 159 (largura de cada miniatura)
const THUMB_MIN_H = 120;
const THUMB_MAX_H = 230;
const THUMB_MARGIN_TOP = 10;
// Reservas verticais para montar a altura da página (dados + molduras).
const HEADER_BLOCK = 34;
const FOOTER_BLOCK = 30;
const DATA_RESERVE = 244;

/** Dá altura + `fit` de uma imagem numa coluna de largura `colW`, respeitando a
 * proporção real: se cabe no teto, a caixa acompanha a proporção (cover, sem corte);
 * se é um retrato muito alto, usa `contain` para mostrar a foto inteira. */
function fittedBox(
  img: CatImg | undefined,
  colW: number,
  minH: number,
  maxH: number,
  fallbackRatio = 1.25
): { height: number; fit: "cover" | "contain" } {
  const ratio = img && img.w > 0 && img.h > 0 ? img.h / img.w : fallbackRatio;
  const natural = colW * ratio;
  const height = Math.max(minH, Math.min(maxH, Math.round(natural)));
  return { height, fit: natural > maxH + 1 ? "contain" : "cover" };
}

function mainImageLayout(img: CatImg | undefined) {
  return fittedBox(img, CARD_INNER_W, MAIN_IMG_MIN_H, MAIN_IMG_MAX_H);
}
function thumbLayout(img: CatImg | undefined) {
  return fittedBox(img, THUMB_COL_W, THUMB_MIN_H, THUMB_MAX_H);
}
/** Altura ocupada pela faixa de miniaturas (a maior das colunas + margem). */
function thumbsBlockHeight(thumbs: CatImg[]): number {
  if (thumbs.length === 0) return 0;
  const tallest = Math.max(...thumbs.map((t) => thumbLayout(t).height));
  return THUMB_MARGIN_TOP + tallest;
}

/** Altura total da página de um produto = molduras + foto + miniaturas + dados. */
function productPageHeight(img: CatImg | undefined, thumbs: CatImg[]): number {
  const imgH = mainImageLayout(img).height;
  return Math.round(
    20 + HEADER_BLOCK + CARD_PAD + imgH + thumbsBlockHeight(thumbs) + DATA_RESERVE + CARD_PAD + FOOTER_BLOCK
  );
}

/** Valor de bookmark do @react-pdf (título + hierarquia). `parent` = ref do
 * bookmark da divisória, para aninhar o produto na "pasta" da categoria. */
type BookmarkValue = { title: string; parent?: number; expanded?: boolean; fit?: boolean };

/** Página divisória (capa) de uma categoria + bookmark de "pasta" no índice do PDF. */
function CategoryDivider({
  category,
  count,
  C,
  bookmark,
}: {
  category: string;
  count: number;
  C: Palette;
  bookmark: BookmarkValue;
}) {
  return (
    <Page
      size={[PAGE_W, 300]}
      bookmark={bookmark}
      style={{ fontFamily: "Helvetica", backgroundColor: C.primary, padding: 0 }}
    >
      <View style={{ flex: 1, justifyContent: "center", paddingHorizontal: 34 }}>
        <Text style={{ color: C.onPrimary, fontSize: 9, letterSpacing: 3, fontFamily: "Helvetica-Bold", opacity: 0.85 }}>
          CATEGORIA
        </Text>
        <Text style={{ color: C.onPrimary, fontSize: 30, fontFamily: "Helvetica-Bold", marginTop: 8, lineHeight: 1.1 }}>
          {category}
        </Text>
        <View style={{ width: 54, height: 3, backgroundColor: C.onPrimary, opacity: 0.8, marginTop: 16, borderRadius: 2 }} />
        <Text style={{ color: C.onPrimary, fontSize: 11, marginTop: 16, opacity: 0.9 }}>
          {count} {count === 1 ? "item" : "itens"}
        </Text>
      </View>
    </Page>
  );
}

/** Uma página inteira dedicada a um produto (formato celular, leitura sem zoom). */
function ProductPage({
  p,
  category,
  C,
  logoDataUri,
  storeName,
  storeUrl,
  bookmark,
}: {
  p: CatalogPdfProduct;
  category: string;
  C: Palette;
  logoDataUri: string | null;
  storeName: string;
  storeUrl: string;
  bookmark?: BookmarkValue;
}) {
  const pct = discountPct(p.price, p.compareAtPrice);
  const hasPromo = p.isPromotion && pct != null;
  const main = p.images[0];
  const thumbs = p.images.slice(1, 3);
  const mainBox = mainImageLayout(main);
  const pageH = productPageHeight(main, thumbs);
  return (
    <Page
      size={[PAGE_W, pageH]}
      bookmark={bookmark}
      style={{
        fontFamily: "Helvetica",
        color: "#111827",
        backgroundColor: "#ffffff",
        paddingHorizontal: PAGE_PAD_X,
        paddingTop: 20,
        paddingBottom: FOOTER_BLOCK,
      }}
    >
      {/* Cabeçalho de marca — discreto */}
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
          {logoDataUri ? (
            <Image src={logoDataUri} style={{ width: 20, height: 20, borderRadius: 5, objectFit: "cover" }} />
          ) : null}
          <Text style={{ fontSize: 11, fontFamily: "Helvetica-Bold" }}>{storeName}</Text>
        </View>
        <Text style={{ fontSize: 7.5, letterSpacing: 2, color: C.ink, fontFamily: "Helvetica-Bold" }}>
          CATÁLOGO
        </Text>
      </View>

      {/* Card do produto */}
      <View
        style={{
          borderWidth: 1,
          borderColor: "#eceef1",
          borderRadius: 18,
          padding: CARD_PAD,
          backgroundColor: "#ffffff",
        }}
      >
        {/* Foto principal grande — respeita a proporção (não corta) */}
        <View
          style={{
            width: "100%",
            height: mainBox.height,
            borderRadius: 12,
            overflow: "hidden",
            backgroundColor: "#f4f5f7",
            position: "relative",
          }}
        >
          {main ? (
            <Image src={main.uri} style={{ width: "100%", height: "100%", objectFit: mainBox.fit }} />
          ) : (
            <View style={{ width: "100%", height: "100%", alignItems: "center", justifyContent: "center" }}>
              <Text style={{ fontSize: 10, color: "#9ca3af" }}>Sem foto</Text>
            </View>
          )}
          {hasPromo ? (
            <View
              style={{
                position: "absolute",
                top: 10,
                left: 10,
                backgroundColor: "#dc2626",
                borderRadius: 6,
                paddingHorizontal: 8,
                paddingVertical: 3,
              }}
            >
              <Text style={{ color: "#ffffff", fontSize: 11, fontFamily: "Helvetica-Bold" }}>-{pct}%</Text>
            </View>
          ) : null}
        </View>

        {/* Até 2 miniaturas — meia largura, altura pela proporção real (sem cortar);
            só aparecem se existirem (sem espaço vazio). A única também fica em meia
            largura, para não virar um "segundo banner". */}
        {thumbs.length > 0 ? (
          <View style={{ flexDirection: "row", gap: THUMB_GAP, marginTop: THUMB_MARGIN_TOP }}>
            {thumbs.map((t, ti) => {
              const tb = thumbLayout(t);
              return (
                <View
                  key={ti}
                  style={{
                    width: THUMB_COL_W,
                    height: tb.height,
                    borderRadius: 10,
                    overflow: "hidden",
                    backgroundColor: "#f4f5f7",
                  }}
                >
                  <Image src={t.uri} style={{ width: "100%", height: "100%", objectFit: tb.fit }} />
                </View>
              );
            })}
          </View>
        ) : null}

        {/* Dados: categoria › nome › preço › cores › tamanhos › descrição › ref */}
        <View style={{ marginTop: 16 }}>
          <Text
            style={{
              fontSize: 8.5,
              letterSpacing: 1.5,
              color: C.ink,
              fontFamily: "Helvetica-Bold",
              textTransform: "uppercase",
            }}
          >
            {category}
          </Text>
          <Text style={{ fontSize: 19, fontFamily: "Helvetica-Bold", marginTop: 4, lineHeight: 1.15 }}>
            {p.name}
          </Text>

          <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8, marginTop: 8 }}>
            <Text style={{ fontSize: 25, fontFamily: "Helvetica-Bold", color: C.ink }}>{brl(p.price)}</Text>
            {hasPromo ? (
              <Text style={{ fontSize: 12, color: "#9ca3af", textDecoration: "line-through" }}>
                {brl(p.compareAtPrice as number)}
              </Text>
            ) : null}
            {hasPromo ? (
              <View style={{ backgroundColor: "#fee2e2", borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 }}>
                <Text style={{ fontSize: 9, color: "#b91c1c", fontFamily: "Helvetica-Bold" }}>-{pct}%</Text>
              </View>
            ) : null}
          </View>

          <View style={{ height: 1, backgroundColor: "#f0f1f3", marginTop: 12, marginBottom: 12 }} />

          {p.colors.length > 0 ? (
            <Text style={{ fontSize: 10.5, color: "#374151", marginBottom: 5 }}>
              <Text style={{ fontFamily: "Helvetica-Bold" }}>Cores: </Text>
              {p.colors.join(", ")}
            </Text>
          ) : null}
          {p.sizes.length > 0 ? (
            <Text style={{ fontSize: 10.5, color: "#374151", marginBottom: 5 }}>
              <Text style={{ fontFamily: "Helvetica-Bold" }}>Tamanhos: </Text>
              {p.sizes.join(" · ")}
            </Text>
          ) : null}

          {commercialCopy(p) ? (
            <Text style={{ fontSize: 10.5, color: "#6b7280", marginTop: 3, lineHeight: 1.45 }}>
              {commercialCopy(p)}
            </Text>
          ) : null}

          {p.reference || p.barcode ? (
            <View style={{ flexDirection: "row", gap: 14, marginTop: 12 }}>
              {p.reference ? (
                <Text style={{ fontSize: 8.5, color: "#9ca3af" }}>Ref. {p.reference}</Text>
              ) : null}
              {p.barcode ? (
                <Text style={{ fontSize: 8.5, color: "#9ca3af" }}>Cód. {p.barcode}</Text>
              ) : null}
            </View>
          ) : null}
        </View>
      </View>

      {/* Rodapé */}
      <View
        fixed
        style={{
          position: "absolute",
          bottom: 12,
          left: PAGE_PAD_X,
          right: PAGE_PAD_X,
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <Text style={{ fontSize: 7.5, color: C.ink, fontFamily: "Helvetica-Bold" }}>
          {storeUrl.replace(/^https?:\/\//, "")}
        </Text>
        <Text
          style={{ fontSize: 7.5, color: "#9ca3af" }}
          render={({ pageNumber, totalPages }) => `${pageNumber}/${totalPages}`}
        />
      </View>
    </Page>
  );
}

/** Capa no mesmo formato celular. */
function CoverPage({
  storeName,
  storeUrl,
  logoDataUri,
  qrDataUri,
  hero,
  C,
  productCount,
  categoryCount,
}: {
  storeName: string;
  storeUrl: string;
  logoDataUri: string | null;
  qrDataUri: string | null;
  hero: string | null;
  C: Palette;
  productCount: number;
  categoryCount: number;
}) {
  return (
    <Page size={[PAGE_W, 720]} style={{ fontFamily: "Helvetica", color: "#111827", padding: 0 }}>
      <View
        style={{
          backgroundColor: C.primary,
          paddingVertical: 20,
          paddingHorizontal: PAGE_PAD_X,
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
        }}
      >
        {logoDataUri ? (
          <Image src={logoDataUri} style={{ width: 40, height: 40, borderRadius: 9, objectFit: "cover" }} />
        ) : null}
        <View style={{ flex: 1 }}>
          <Text style={{ color: C.onPrimary, fontSize: 8, letterSpacing: 2, fontFamily: "Helvetica-Bold" }}>
            CATÁLOGO OFICIAL
          </Text>
          <Text style={{ color: C.onPrimary, fontSize: 20, fontFamily: "Helvetica-Bold", marginTop: 2 }}>
            {storeName}
          </Text>
        </View>
      </View>

      <View style={{ paddingHorizontal: PAGE_PAD_X, paddingTop: 24 }}>
        <Text style={{ fontSize: 26, fontFamily: "Helvetica-Bold", lineHeight: 1.12 }}>
          Novidades selecionadas pra você
        </Text>
        <Text style={{ fontSize: 11, color: "#6b7280", marginTop: 10, lineHeight: 1.45 }}>
          {IMPACT_PHRASE}
        </Text>
      </View>

      {hero ? (
        <View
          style={{
            marginTop: 18,
            marginHorizontal: PAGE_PAD_X,
            height: 300,
            borderRadius: 16,
            overflow: "hidden",
            backgroundColor: "#f4f5f7",
          }}
        >
          <Image src={hero} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </View>
      ) : null}

      <View style={{ marginTop: 20, marginHorizontal: PAGE_PAD_X, flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" }}>
        <View style={{ flex: 1, paddingRight: 12 }}>
          <View style={{ backgroundColor: C.primary, borderRadius: 999, paddingVertical: 11, paddingHorizontal: 18, alignSelf: "flex-start" }}>
            <Text style={{ color: C.onPrimary, fontSize: 12, fontFamily: "Helvetica-Bold" }}>
              Escolha seu modelo e peça agora →
            </Text>
          </View>
          <Text style={{ fontSize: 9.5, color: "#6b7280", marginTop: 12 }}>
            {`${productCount} ${productCount === 1 ? "produto" : "produtos"} • ${categoryCount} ${categoryCount === 1 ? "categoria" : "categorias"}`}
          </Text>
          <Text style={{ fontSize: 9.5, color: C.ink, marginTop: 2, fontFamily: "Helvetica-Bold" }}>
            {storeUrl.replace(/^https?:\/\//, "")}
          </Text>
        </View>
        {qrDataUri ? (
          <View style={{ alignItems: "center" }}>
            <Image src={qrDataUri} style={{ width: 84, height: 84 }} />
            <Text style={{ fontSize: 7.5, color: "#6b7280", marginTop: 4 }}>Aponte a câmera</Text>
          </View>
        ) : null}
      </View>
    </Page>
  );
}

type DividerEntry = { kind: "divider"; category: string; count: number; bookmark: BookmarkValue };
type ProductEntry = { kind: "product"; p: CatalogPdfProduct; category: string; bookmark: BookmarkValue };

/**
 * Monta a sequência de páginas na ordem por categoria, com os **marcadores**
 * (índice lateral do PDF) aninhados: a divisória de cada categoria é uma "pasta"
 * e cada produto pendura nela (`parent`).
 *
 * O `ref` de cada bookmark é atribuído pelo @react-pdf na **ordem das páginas**
 * (BFS a partir de Document.children); como a capa não tem bookmark, o 1º bookmark
 * é a 1ª divisória (ref 0). Reproduzimos essa contagem aqui para saber o ref da
 * divisória e passá-lo como `parent` dos produtos — o resolvedor da lib respeita o
 * `parent` do objeto (`{ ref, parent, ...bookmark }`, spread por último).
 */
function buildEntries(groups: CatalogGroup[]): (DividerEntry | ProductEntry)[] {
  const entries: (DividerEntry | ProductEntry)[] = [];
  let ref = 0;
  for (const g of groups) {
    const dividerRef = ref++;
    entries.push({
      kind: "divider",
      category: g.category,
      count: g.items.length,
      bookmark: { title: g.category, expanded: true },
    });
    for (const p of g.items) {
      ref++; // consome o ref deste produto (mantém a contagem alinhada à lib)
      entries.push({
        kind: "product",
        p,
        category: g.category,
        bookmark: { title: p.name, parent: dividerRef },
      });
    }
  }
  return entries;
}

function CatalogDocument(props: {
  storeName: string;
  storeUrl: string;
  logoDataUri: string | null;
  qrDataUri: string | null;
  accent: string | null;
  products: CatalogPdfProduct[];
}) {
  const { storeName, storeUrl, logoDataUri, qrDataUri, products } = props;
  const C = buildPalette(props.accent);
  const groups = groupByCategory(products);
  const hero = products.find((p) => p.images[0])?.images[0]?.uri ?? logoDataUri ?? null;
  const entries = buildEntries(groups);

  return (
    <Document title={`Catálogo - ${storeName}`} author={storeName}>
      <CoverPage
        storeName={storeName}
        storeUrl={storeUrl}
        logoDataUri={logoDataUri}
        qrDataUri={qrDataUri}
        hero={hero}
        C={C}
        productCount={products.length}
        categoryCount={groups.length}
      />
      {entries.map((e, i) =>
        e.kind === "divider" ? (
          <CategoryDivider key={i} category={e.category} count={e.count} C={C} bookmark={e.bookmark} />
        ) : (
          <ProductPage
            key={i}
            p={e.p}
            category={e.category}
            C={C}
            logoDataUri={logoDataUri}
            storeName={storeName}
            storeUrl={storeUrl}
            bookmark={e.bookmark}
          />
        )
      )}
    </Document>
  );
}

/** Monta o PDF do catálogo (buffer). As fotos já devem vir como data URI. */
export async function buildCatalogPdfBuffer(args: {
  storeName: string;
  storeUrl: string;
  logoUrl: string | null;
  accent?: string | null;
  products: CatalogPdfProduct[];
}): Promise<Buffer> {
  const [logo, qrDataUri] = await Promise.all([
    args.logoUrl ? fetchImageDataUri(args.logoUrl, 240, 80) : Promise.resolve(null),
    QRCode.toDataURL(args.storeUrl, { margin: 1, width: 220 }).catch(() => null),
  ]);
  return renderToBuffer(
    <CatalogDocument
      storeName={args.storeName}
      storeUrl={args.storeUrl}
      logoDataUri={logo?.uri ?? null}
      qrDataUri={qrDataUri}
      accent={args.accent ?? null}
      products={args.products}
    />
  );
}

/* ------------------------------------------------------------------ *
 * Carregamento a partir do banco
 * ------------------------------------------------------------------ */

type ProductRow = {
  name?: unknown;
  price?: unknown;
  description?: unknown;
  category?: unknown;
  product_reference?: unknown;
  barcode?: unknown;
  colors?: unknown;
  sizes?: unknown;
  image?: string | null;
  images?: unknown;
  is_promotion?: unknown;
  compare_at_price?: unknown;
};

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** Busca os produtos ativos da loja e baixa as fotos (capa + até 2 secundárias). */
async function loadCatalogProducts(
  admin: SupabaseClient,
  storeId: string
): Promise<CatalogPdfProduct[]> {
  // `select("*")` é robusto a colunas ausentes (category/product_reference/barcode
  // podem não existir em bases legadas — simplesmente não vêm no retorno).
  const { data } = await admin
    .from("products")
    .select("*")
    .eq("store_id", storeId)
    .or("active.eq.true,active.is.null")
    .order("created_at", { ascending: false })
    .limit(80);

  const rows = (data ?? []) as ProductRow[];

  // Monta a lista achatada de imagens (máx. 3 por produto) para baixar com
  // concorrência limitada; a capa vem em 640px e as secundárias menores (220px).
  const perProduct = rows.map((r) =>
    getProductImageUrls({ image: r.image, images: r.images }).slice(0, 3)
  );
  type Slot = { pi: number; idx: number; url: string };
  const flat: Slot[] = [];
  perProduct.forEach((urls, pi) =>
    urls.forEach((url, idx) => flat.push({ pi, idx, url }))
  );
  // Capa maior (nitidez) e secundárias médias; valores moderados para o arquivo
  // ficar leve mesmo numa loja cheia (80 produtos × 3 fotos < 10 MB).
  const flatUris = await mapWithConcurrency(flat, 10, (s) =>
    s.idx === 0 ? fetchImageDataUri(s.url, 680, 70) : fetchImageDataUri(s.url, 380, 68)
  );
  const grouped: (CatImg | null)[][] = perProduct.map((u) => u.map(() => null));
  flat.forEach((s, i) => {
    grouped[s.pi][s.idx] = flatUris[i];
  });

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
      name: str(r.name) || "Produto",
      category: str(r.category) || null,
      reference: str(r.product_reference) || null,
      barcode: str(r.barcode) || null,
      price,
      description: typeof r.description === "string" ? r.description : null,
      colors: optionArrayFromDb(r.colors),
      sizes: optionArrayFromDb(r.sizes),
      images: grouped[i].filter((x): x is CatImg => !!x),
      isPromotion: r.is_promotion === true,
      compareAtPrice: compare,
    };
  });
}

/** Lê a cor de acento da loja (`storefront.themePrimary`), se houver. */
async function loadStoreAccent(
  admin: SupabaseClient,
  storeId: string
): Promise<string | null> {
  try {
    const { data } = await admin
      .from("stores")
      .select("storefront")
      .eq("id", storeId)
      .maybeSingle();
    const sf = data?.storefront as { themePrimary?: unknown } | null;
    const hex = str(sf?.themePrimary);
    return hexToRgb(hex) ? hex : null;
  } catch {
    return null;
  }
}

const CATALOG_BUCKET = "product-images";
const CATALOG_DIR = "catalogos";
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 min: edições aparecem em até meia hora.

function catalogPath(slug: string): string {
  return `${CATALOG_DIR}/${slug}.pdf`;
}

/**
 * Momento (ms) da última mudança que afeta o catálogo: o produto mais
 * recentemente editado/criado (`products.updated_at`, que já cobre inserções —
 * default `now()`) e a própria loja (`stores.updated_at`, muda ao salvar
 * logo/nome/tema). Serve para invalidar o cache do PDF na hora que o lojista
 * mexe em algo, em vez de esperar o TTL. Falha/sem dado → 0 (deixa o TTL mandar).
 */
async function latestCatalogChange(
  admin: SupabaseClient,
  storeId: string
): Promise<number> {
  try {
    const [prod, store] = await Promise.all([
      admin
        .from("products")
        .select("updated_at")
        .eq("store_id", storeId)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      admin
        .from("stores")
        .select("updated_at")
        .eq("id", storeId)
        .maybeSingle(),
    ]);
    const stamps = [prod.data?.updated_at, store.data?.updated_at]
      .map((v) => (v ? new Date(v as string).getTime() : 0))
      .filter((n) => Number.isFinite(n));
    return stamps.length ? Math.max(...stamps) : 0;
  } catch {
    return 0;
  }
}

/**
 * Garante um PDF do catálogo no bucket e devolve a URL pública (com `?v=` para
 * furar cache de CDN). Regenera se não existir, se o cache estiver velho (TTL)
 * **ou se algum produto/loja mudou depois do PDF** (`latestCatalogChange`) — daí
 * download/envio já saem com a atualização nova, sem esperar o TTL. Retorna null
 * se a loja não tem produtos (não faz sentido mandar catálogo vazio).
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
        // Dentro do TTL: só reaproveita se NENHUM produto/loja mudou depois do
        // PDF — senão regenera na hora para refletir a edição do lojista.
        const changedAt = await latestCatalogChange(admin, args.storeId);
        if (changedAt <= stamp) {
          return `${publicUrl}?v=${stamp}`;
        }
      }
    }
  } catch {
    // Sem cache utilizável: segue e regenera.
  }

  const [products, accent] = await Promise.all([
    loadCatalogProducts(admin, args.storeId),
    loadStoreAccent(admin, args.storeId),
  ]);
  if (products.length === 0) return null;

  const buffer = await buildCatalogPdfBuffer({
    storeName: args.storeName,
    storeUrl,
    logoUrl: args.logoUrl,
    accent,
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
