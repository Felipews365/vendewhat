import { notFound } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { getProductImageUrls } from "@/lib/productImages";
import { optionArrayFromDb } from "@/lib/productOptions";
import { colorHexesFromDb } from "@/lib/productColorHexes";
import { variantStockFromDb } from "@/lib/productVariants";
import { normalizeStoreSlug } from "@/lib/storeSlug";
import {
  isMissingColumnError,
  PRODUCTS_SELECT_WITHOUT_PRODUCT_REFERENCE,
} from "@/lib/dbColumnErrors";
import { storefrontFromDb } from "@/lib/storefront";
import { normalizeImageObjectPosition } from "@/lib/productImagePosition";
import { parseImageObjectPositionsDb } from "@/lib/productImageFocus";
import { productSaleFromDb } from "@/lib/saleMode";
import {
  sanitizeTags,
  sanitizeBarcode,
  unitTypeShort,
} from "@/lib/productDetails";
import { StoreTrackingScripts } from "@/components/StoreTrackingScripts";
import { LojaClient, type CatalogProduct } from "./LojaClient";

type Props = { params: { slug: string } };

/** Sempre dados frescos; evita página da loja “vazia” em cache. */
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function generateMetadata({ params }: Props) {
  const slug = normalizeStoreSlug(params.slug);
  const supabase = await createServerSupabase();
  const { data: store } = await supabase
    .from("stores")
    .select("name, description, logo")
    .eq("slug", slug)
    .maybeSingle();

  if (!store) {
    return { title: "Loja não encontrada | VendeWhat" };
  }

  const logo = typeof store.logo === "string" ? store.logo.trim() : "";

  /* O favicon é a logo da loja, mas o lojista às vezes sobe um PNG de >1 MB — e o
     navegador baixa esse arquivo INTEIRO só pra desenhar o ícone da aba (peso puro
     no PageSpeed/payload). Servimos a logo pelo next/image (redimensionada +
     AVIF/WebP conforme o Accept do navegador), então o favicon vira poucos KB em
     qualquer loja. Larguras precisam estar na lista do next.config (64 e 256 estão
     em imageSizes). Só otimiza URL http(s) do nosso storage; data:/vazio passa direto. */
  const optimizedIcon = (w: number) =>
    logo.startsWith("http")
      ? `/_next/image?url=${encodeURIComponent(logo)}&w=${w}&q=75`
      : logo;

  return {
    title: `${store.name} | Catálogo VendeWhat`,
    description:
      store.description ||
      `Confira os produtos de ${store.name}. Compre pelo WhatsApp.`,
    /* Sem logo, cai no ícone padrão do VendeWhat (o do layout raiz). */
    ...(logo
      ? {
          icons: {
            icon: optimizedIcon(64),
            shortcut: optimizedIcon(64),
            apple: optimizedIcon(256),
          },
        }
      : null),
  };
}

export default async function LojaPublicaPage({ params }: Props) {
  const slug = normalizeStoreSlug(params.slug);
  const supabase = await createServerSupabase();

  /* Tenta buscar com storefront; se a coluna não existir, faz fallback sem ela */
  let store: Record<string, unknown> | null = null;
  let storeError: { message: string; code?: string } | null = null;

  const fullResult = await supabase
    .from("stores")
    .select("id, name, slug, description, logo, phone, storefront")
    .eq("slug", slug)
    .single();

  if (
    fullResult.error &&
    fullResult.error.message?.includes("storefront")
  ) {
    const fallback = await supabase
      .from("stores")
      .select("id, name, slug, description, logo, phone")
      .eq("slug", slug)
      .single();
    store = fallback.data as Record<string, unknown> | null;
    storeError = fallback.error;
  } else {
    store = fullResult.data as Record<string, unknown> | null;
    storeError = fullResult.error;
  }

  if (storeError) {
    console.error(
      "[loja] Loja não encontrada ou sem permissão de leitura:",
      slug,
      storeError.message,
      storeError
    );
  }

  if (storeError || !store) {
    notFound();
  }

  // `select("*")` inclui colunas novas; se o PostgREST ainda não tiver `product_reference` no cache, repetimos sem esse campo.
  let productsQuery = await supabase
    .from("products")
    .select("*")
    .eq("store_id", store.id)
    /* true ou null (legado sem coluna default) */
    .or("active.eq.true,active.is.null")
    .order("created_at", { ascending: false });

  if (
    productsQuery.error &&
    isMissingColumnError(
      productsQuery.error.message,
      "product_reference",
      productsQuery.error.code
    )
  ) {
    productsQuery = await supabase
      .from("products")
      .select(PRODUCTS_SELECT_WITHOUT_PRODUCT_REFERENCE)
      .eq("store_id", store.id)
      .or("active.eq.true,active.is.null")
      .order("created_at", { ascending: false });
  }

  const { data: products, error: productsError } = productsQuery;

  if (productsError) {
    console.error("[loja] Erro ao buscar produtos:", productsError.message, productsError);
  }

  // Pagamento online: a tabela store_payment_gateway só é lida via service role
  // (o token nunca vai pro browser). Aqui derivamos apenas um booleano.
  let paymentEnabled = false;
  // Contato real da loja = o WhatsApp CONECTADO (onde a IA/lojista atende), não o
  // telefone do cadastro (stores.phone, digitado pelo dono no signup). store_whatsapp
  // só é lida via service role. `connected_number` fica nulo quando desconectado.
  let whatsappNumber: string | null = null;
  const admin = createAdminSupabase();
  if (admin) {
    const { data: gw } = await admin
      .from("store_payment_gateway")
      .select("enabled, access_token")
      .eq("store_id", store.id)
      .maybeSingle();
    paymentEnabled = Boolean(gw?.access_token && gw.enabled !== false);

    const { data: wa } = await admin
      .from("store_whatsapp")
      .select("connected_number")
      .eq("store_id", store.id)
      .maybeSingle();
    const n =
      typeof wa?.connected_number === "string" ? wa.connected_number.trim() : "";
    whatsappNumber = n || null;
  }

  const list: CatalogProduct[] = (products ?? []).map((p) => {
    const images = getProductImageUrls({
      image: p.image,
      images: p.images,
    });
    const legacyPos = normalizeImageObjectPosition(
      (p as { image_object_position?: string | null }).image_object_position
    );
    const imageObjectPositions = parseImageObjectPositionsDb(
      (p as { image_object_positions?: unknown }).image_object_positions,
      images.length,
      legacyPos
    );
    return {
      id: p.id,
      name: p.name,
      productReference: (() => {
        const r = (p as { product_reference?: string | null }).product_reference;
        const t = typeof r === "string" ? r.trim() : "";
        return t || null;
      })(),
      category: (() => {
        const c = (p as { category?: string | null }).category;
        const t = typeof c === "string" ? c.trim() : "";
        return t || null;
      })(),
      description: p.description,
      price: Number(p.price),
      image: images[0] ?? null,
      images,
      videoUrl: (() => {
        const v = (p as { video_url?: string | null }).video_url;
        return typeof v === "string" && v.trim() ? v : null;
      })(),
      colors: optionArrayFromDb(p.colors),
      colorHexes: colorHexesFromDb(
        (p as { color_hexes?: unknown }).color_hexes
      ),
      sizes: optionArrayFromDb(p.sizes),
      variantStock: variantStockFromDb(p.variant_stock),
      tags: sanitizeTags((p as { tags?: unknown }).tags),
      unitShort: unitTypeShort((p as { unit_type?: string | null }).unit_type),
      barcode:
        sanitizeBarcode((p as { barcode?: string | null }).barcode) || null,
      stock: Number(p.stock),
      createdAt: String(p.created_at ?? ""),
      isPromotion: Boolean((p as { is_promotion?: boolean }).is_promotion),
      compareAtPrice:
        (p as { compare_at_price?: number | null }).compare_at_price != null
          ? Number((p as { compare_at_price: number }).compare_at_price)
          : null,
      cardRatio: (() => {
        const cr = (p as { card_ratio?: string | null }).card_ratio;
        return cr === "1:1" || cr === "3:4" ? cr : null;
      })(),
      cardRating: (() => {
        // Nº de estrelinhas decorativas no card: 0 = esconder, 1-5 = quantas mostrar,
        // null = padrão da loja (5). Coluna pode não existir em bancos antigos.
        const r = (p as { card_rating?: number | null }).card_rating;
        return typeof r === "number" && r >= 0 && r <= 5 ? Math.round(r) : null;
      })(),
      imageObjectPosition: legacyPos,
      imageObjectPositions,
      sale: productSaleFromDb(p as Record<string, unknown>),
    };
  });

  const storefront = storefrontFromDb(store.storefront);

  return (
    <>
      <StoreTrackingScripts
        facebookPixelId={storefront.facebookPixelId}
        googleAnalyticsId={storefront.googleAnalyticsId}
      />
      <LojaClient
        store={{
          slug: String(store.slug ?? slug),
          name: String(store.name ?? ""),
          description: store.description ? String(store.description) : null,
          logo: store.logo ? String(store.logo) : null,
          phone: store.phone ? String(store.phone) : null,
          whatsappNumber,
        }}
        storefront={storefront}
        products={list}
        paymentEnabled={paymentEnabled}
      />
    </>
  );
}
