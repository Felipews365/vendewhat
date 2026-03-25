import { notFound } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
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
    .select("name, description")
    .eq("slug", slug)
    .maybeSingle();

  if (!store) {
    return { title: "Loja não encontrada | VendeWhat" };
  }

  return {
    title: `${store.name} | Catálogo VendeWhat`,
    description:
      store.description ||
      `Confira os produtos de ${store.name}. Compre pelo WhatsApp.`,
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
      colors: optionArrayFromDb(p.colors),
      colorHexes: colorHexesFromDb(
        (p as { color_hexes?: unknown }).color_hexes
      ),
      sizes: optionArrayFromDb(p.sizes),
      variantStock: variantStockFromDb(p.variant_stock),
      stock: Number(p.stock),
      createdAt: String(p.created_at ?? ""),
      isPromotion: Boolean((p as { is_promotion?: boolean }).is_promotion),
      compareAtPrice:
        (p as { compare_at_price?: number | null }).compare_at_price != null
          ? Number((p as { compare_at_price: number }).compare_at_price)
          : null,
      imageObjectPosition: legacyPos,
      imageObjectPositions,
    };
  });

  return (
    <LojaClient
      store={{
        slug: String(store.slug ?? slug),
        name: String(store.name ?? ""),
        description: store.description ? String(store.description) : null,
        logo: store.logo ? String(store.logo) : null,
        phone: store.phone ? String(store.phone) : null,
      }}
      storefront={storefrontFromDb(store.storefront)}
      products={list}
    />
  );
}
