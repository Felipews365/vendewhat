"use client";

import { useMemo, useState, useEffect, useRef, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { whatsAppLink } from "@/lib/whatsapp";
import {
  type VariantStockRow,
  getStockForVariant,
  sumVariantStockRows,
} from "@/lib/productVariants";
import {
  type StorefrontCategoryItem,
  type StorefrontSettings,
  storefrontRichFooterVisible,
} from "@/lib/storefront";
import { StorefrontRichFooter } from "@/components/storefront/StorefrontRichFooter";
import { swatchNeedsStrongBorder } from "@/lib/colorSwatch";
import { resolveSwatchFill } from "@/lib/productColorHexes";
import { isCustomerPhoneValid } from "@/lib/customerPhone";
import {
  SHIPPING_MODES,
  shippingModeLabel,
  type ShippingModeId,
} from "@/lib/shippingModes";
import { catalogCardImageObjectStyle } from "@/lib/productImagePosition";

export type CatalogProduct = {
  id: string;
  name: string;
  /** Código/referência opcional (ex.: SKU). */
  productReference: string | null;
  /** Categoria do produto (painel); a faixa na loja só aparece se houver pelo menos uma. */
  category: string | null;
  description: string | null;
  price: number;
  image: string | null;
  images: string[];
  colors: string[];
  /** Tom #rrggbb da bolinha por nome da cor (vendedor). */
  colorHexes: Record<string, string>;
  sizes: string[];
  /** Estoque por combinação; vazio = usa só `stock` (legado). */
  variantStock: VariantStockRow[];
  stock: number;
  createdAt: string;
  isPromotion: boolean;
  compareAtPrice: number | null;
  /** Enquadramento da 1.ª foto no card (lista); no detalhe as fotos aparecem inteiras. */
  imageObjectPosition: string;
};

function formatPrice(value: number): string {
  return value.toFixed(2).replace(".", ",");
}

const CATEGORY_SPLIT_RE = /[,;/|]+/;

function normCategoryLabel(s: string): string {
  return s.trim().toLocaleLowerCase("pt");
}

/**
 * Conjunto de rótulos (normalizados) que contam para o filtro: o nome tocado na faixa
 * mais todas as subcategorias definidas em Aparência (`parentLabel`), em cascata.
 * Assim, tocar em «Bermuda» mostra só produtos com categoria Bermuda; tocar no pai
 * (ex.: «Short») pode incluir Bermuda, se estiver ligada como filha na loja.
 */
function categoryFilterMatchNorms(
  filterLabel: string,
  storefrontCategories: StorefrontCategoryItem[]
): Set<string> {
  const items = storefrontCategories
    .map((c) => ({
      label: c.label.trim(),
      parent: c.parentLabel?.trim() ?? "",
    }))
    .filter((c) => c.label);

  const out = new Set<string>();
  out.add(normCategoryLabel(filterLabel));

  let added = true;
  while (added) {
    added = false;
    for (const c of items) {
      const ln = normCategoryLabel(c.label);
      if (out.has(ln)) continue;
      const pn = c.parent ? normCategoryLabel(c.parent) : "";
      if (pn && out.has(pn)) {
        out.add(ln);
        added = true;
      }
    }
  }
  return out;
}

function productCategoryMatchesNormSet(
  productCategory: string,
  matchNorms: Set<string>
): boolean {
  const full = normCategoryLabel(productCategory);
  if (matchNorms.has(full)) return true;
  for (const part of productCategory.split(CATEGORY_SPLIT_RE)) {
    const t = part.trim();
    if (!t) continue;
    if (matchNorms.has(normCategoryLabel(t))) return true;
  }
  return false;
}

/** Logo Instagram (marca) — use com currentColor */
function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z" />
    </svg>
  );
}

/** Slides do banner (sem indicadores — estes ficam abaixo do banner). */
function HeroSlideshowLayer({
  images,
  activeIndex,
}: {
  images: string[];
  activeIndex: number;
}) {
  const len = images.length;
  const safeIdx = len > 0 ? Math.min(activeIndex, len - 1) : 0;

  if (len === 0) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-stone-200 via-stone-100 to-stone-300 text-6xl opacity-40">
        ✦
      </div>
    );
  }

  return (
    <div className="absolute inset-0 z-0">
      {images.map((url, i) => (
        <div
          key={`${url}-${i}`}
          className={`absolute inset-0 transition-opacity duration-700 ease-in-out ${
            i === safeIdx
              ? "opacity-100 z-[1]"
              : "opacity-0 z-0 pointer-events-none"
          }`}
        >
          <Image
            src={url}
            alt=""
            fill
            className="object-cover object-center"
            sizes="100vw"
            priority={i === 0}
          />
        </div>
      ))}
    </div>
  );
}

/** Banner + setas sobre a foto; bolinhas do carrossel fora do banner (não cobrem o texto). */
function HeroBannerBlock({
  images,
  themePrimary,
  children,
}: {
  images: string[];
  themePrimary: string;
  children: React.ReactNode;
}) {
  const [idx, setIdx] = useState(0);
  const len = images.length;
  const safeIdx = len > 0 ? Math.min(idx, len - 1) : 0;
  const imagesKey = useMemo(() => images.join("|"), [images]);

  useEffect(() => {
    setIdx(0);
  }, [imagesKey]);

  useEffect(() => {
    if (len <= 1) return;
    const t = setInterval(() => {
      setIdx((i) => (i + 1) % len);
    }, 5500);
    return () => clearInterval(t);
  }, [len]);

  return (
    <>
      <section className="relative w-full aspect-[16/9] sm:aspect-[2/1] md:aspect-[21/9] lg:aspect-[1920/600] overflow-hidden">
        <HeroSlideshowLayer images={images} activeIndex={safeIdx} />
        {len > 1 && (
          <>
            <button
              type="button"
              onClick={() => setIdx((i) => (i - 1 + len) % len)}
              className="absolute left-4 md:left-6 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-black/35 text-white text-xl font-light hover:bg-black/50 backdrop-blur-sm"
              aria-label="Foto anterior"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={() => setIdx((i) => (i + 1) % len)}
              className="absolute right-4 md:right-6 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-black/35 text-white text-xl font-light hover:bg-black/50 backdrop-blur-sm"
              aria-label="Próxima foto"
            >
              ›
            </button>
          </>
        )}
        {children}
      </section>
      {len > 1 && (
        <nav
          className="w-full flex justify-center items-center gap-2 py-2.5 sm:py-3 bg-white border-b border-stone-200/90"
          aria-label="Fotos do banner"
        >
          {images.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setIdx(i)}
              className={`h-2 rounded-full transition-all duration-300 ${
                i === safeIdx ? "w-7 shadow-sm" : "w-2 opacity-80"
              }`}
              style={{
                backgroundColor:
                  i === safeIdx ? themePrimary : "rgb(163 163 163)",
              }}
              aria-label={`Ir para foto ${i + 1}`}
              aria-current={i === safeIdx ? "true" : undefined}
            />
          ))}
        </nav>
      )}
    </>
  );
}

function makeCartKey(productId: string, color: string, size: string): string {
  return JSON.stringify([productId, color, size]);
}

function parseCartKey(key: string): {
  productId: string;
  color: string;
  size: string;
} {
  try {
    const [productId, color, size] = JSON.parse(key) as [
      string,
      string,
      string,
    ];
    return { productId, color: color ?? "", size: size ?? "" };
  } catch {
    return { productId: key, color: "", size: "" };
  }
}

/** Soma quantidades no carrinho para o mesmo produto (todas as variações). */
function totalQtyForProduct(
  cart: Record<string, number>,
  productId: string,
  excludeKey?: string
): number {
  let sum = 0;
  for (const [k, q] of Object.entries(cart)) {
    if (q <= 0 || k === excludeKey) continue;
    const { productId: pid } = parseCartKey(k);
    if (pid === productId) sum += q;
  }
  return sum;
}

/** Limite para esta linha do carrinho: por variação ou estoque único compartilhado. */
function maxQtyForCartLine(
  p: CatalogProduct,
  color: string,
  size: string,
  cart: Record<string, number>,
  lineKey: string
): number {
  const hasOpts = p.colors.length > 0 || p.sizes.length > 0;
  if (hasOpts && p.variantStock.length > 0) {
    const c = p.colors.length ? color.trim() : "";
    const s = p.sizes.length ? size.trim() : "";
    return getStockForVariant(p.variantStock, c, s);
  }
  return Math.max(0, p.stock - totalQtyForProduct(cart, p.id, lineKey));
}

function productSoldOut(p: CatalogProduct): boolean {
  const hasOpts = p.colors.length > 0 || p.sizes.length > 0;
  if (hasOpts && p.variantStock.length > 0) {
    return sumVariantStockRows(p.variantStock) <= 0;
  }
  return p.stock <= 0;
}

function ProductGallery({
  urls,
  alt,
}: {
  urls: string[];
  alt: string;
}) {
  const [idx, setIdx] = useState(0);
  const len = urls.length;
  const safeIdx = len > 0 ? Math.min(idx, len - 1) : 0;
  const urlsKey = useMemo(() => urls.join("|"), [urls]);

  useEffect(() => {
    setIdx(0);
  }, [urlsKey]);

  if (len === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center text-5xl text-slate-300">
        📷
      </div>
    );
  }

  if (len === 1) {
    return (
      <Image
        src={urls[0]}
        alt={alt}
        fill
        className="object-cover"
        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
      />
    );
  }

  /* Várias fotos: miniaturas à esquerda, principal à direita (estilo vitrine) */
  return (
    <div className="absolute inset-0 flex gap-1.5 p-1.5 sm:gap-2 sm:p-2">
      <div
        className="flex w-[22%] min-w-[44px] max-w-[76px] shrink-0 flex-col gap-1.5 overflow-y-auto overflow-x-hidden pr-0.5 [scrollbar-width:thin]"
        role="tablist"
        aria-label="Miniaturas do produto"
      >
        {urls.map((url, i) => (
          <button
            key={`${url}-${i}`}
            type="button"
            role="tab"
            aria-selected={i === safeIdx}
            aria-label={`Ver foto ${i + 1} de ${len}`}
            onClick={(e) => {
              e.stopPropagation();
              setIdx(i);
            }}
            className={`relative aspect-square w-full shrink-0 overflow-hidden rounded-md ring-2 transition-all ${
              i === safeIdx
                ? "ring-stone-800 opacity-100 shadow-md"
                : "ring-transparent opacity-75 hover:opacity-100 hover:ring-stone-300"
            }`}
          >
            <Image
              src={url}
              alt=""
              fill
              className="object-cover"
              sizes="80px"
            />
          </button>
        ))}
      </div>
      <div className="relative min-h-0 min-w-0 flex-1">
        <Image
          src={urls[safeIdx]}
          alt={alt}
          fill
          className="object-cover"
          sizes="(max-width: 640px) 70vw, (max-width: 1024px) 35vw, 28vw"
          priority={safeIdx === 0}
        />
      </div>
    </div>
  );
}

/** Card simplificado: imagem uniforme + nome + preço + botão "Comprar". Clique abre detalhe. */
function ProductCatalogCard({
  product,
  cardMode,
  onOpen,
}: {
  product: CatalogProduct;
  cardMode: "promotion" | "catalog";
  onOpen: (product: CatalogProduct) => void;
}) {
  const btnBg =
    cardMode === "promotion"
      ? "var(--store-secondary)"
      : "var(--store-primary)";

  const imgSrc = product.images[0] ?? product.image;

  return (
    <div className="flex flex-col cursor-pointer" onClick={() => onOpen(product)}>
      {/* 1:1 na grelha + object-cover; foco via imageObjectPosition no painel */}
      <div className="aspect-square relative overflow-hidden rounded-2xl shadow-sm bg-stone-200">
        {imgSrc ? (
          <Image
            src={imgSrc}
            alt={product.name}
            fill
            className="object-cover w-full h-full"
            style={catalogCardImageObjectStyle(product.imageObjectPosition)}
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-5xl text-stone-300">
            📷
          </div>
        )}
        {productSoldOut(product) && (
          <span className="absolute top-3 right-3 z-10 bg-boutique-wine/95 text-white text-[11px] font-semibold uppercase tracking-wide px-2.5 py-1 rounded-sm">
            Esgotado
          </span>
        )}
      </div>
      {/* Info fora do card */}
      <div className="pt-3 px-1">
        <h3 className="font-serif italic text-stone-800 line-clamp-2 text-sm md:text-base leading-snug">
          {product.name}
        </h3>
        {product.category?.trim() && (
          <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-stone-500">
            {product.category.trim()}
          </p>
        )}
        <p className="font-bold text-stone-900 text-lg md:text-xl leading-tight mt-1">
          R${formatPrice(product.price)}
        </p>
        {product.isPromotion &&
          product.compareAtPrice != null &&
          product.compareAtPrice > product.price && (
            <p className="text-xs text-stone-400 line-through">
              R${formatPrice(product.compareAtPrice)}
            </p>
          )}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpen(product);
          }}
          className="mt-2 px-6 py-2 rounded-full text-white text-sm font-semibold transition-opacity hover:opacity-90 shadow-sm"
          style={{ backgroundColor: btnBg }}
        >
          Comprar
        </button>
      </div>
    </div>
  );
}

/** Modal de detalhe do produto (estilo vitrine: foto grande + miniaturas laterais) */
function ProductDetailModal({
  product,
  cart,
  onSetQty,
  onClose,
  contactHref,
}: {
  product: CatalogProduct;
  cart: Record<string, number>;
  onSetQty: (cartKey: string, qty: number) => void;
  onClose: () => void;
  contactHref: string | null;
}) {
  const [imgIdx, setImgIdx] = useState(0);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [color, setColor] = useState(product.colors[0] ?? "");
  const [size, setSize] = useState(product.sizes[0] ?? "");
  const [qtyDraft, setQtyDraft] = useState(1);

  const carouselRef = useRef<HTMLDivElement>(null);
  const lightboxCarouselRef = useRef<HTMLDivElement>(null);
  const skipCarouselScrollRef = useRef(false);
  const skipLightboxScrollRef = useRef(false);
  const lightboxNeedsInitialScrollRef = useRef(false);
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);

  const imgs = product.images.length > 0 ? product.images : product.image ? [product.image] : [];
  const safeImgIdx = imgs.length > 0 ? Math.min(imgIdx, imgs.length - 1) : 0;

  const scrollCarouselToIndex = useCallback(
    (i: number, behavior: "smooth" | "auto" = "smooth") => {
      const el = carouselRef.current;
      if (!el || imgs.length <= 1) return;
      const w = el.clientWidth;
      if (w <= 0) return;
      skipCarouselScrollRef.current = true;
      el.scrollTo({
        left: Math.min(i, imgs.length - 1) * w,
        behavior,
      });
      window.setTimeout(
        () => {
          skipCarouselScrollRef.current = false;
        },
        behavior === "auto" ? 50 : 450
      );
    },
    [imgs.length]
  );

  const onCarouselScroll = useCallback(() => {
    if (skipCarouselScrollRef.current || imgs.length <= 1) return;
    const el = carouselRef.current;
    if (!el) return;
    const w = el.clientWidth;
    if (w <= 0) return;
    const i = Math.round(el.scrollLeft / w);
    const clamped = Math.max(0, Math.min(i, imgs.length - 1));
    setImgIdx((prev) => (clamped !== prev ? clamped : prev));
  }, [imgs.length]);

  useEffect(() => {
    setImgIdx(0);
    const t = window.setTimeout(() => scrollCarouselToIndex(0, "auto"), 0);
    return () => window.clearTimeout(t);
  }, [product.id, scrollCarouselToIndex]);

  const colorForCart = product.colors.length > 0 ? color.trim() : "";
  const sizeForCart = product.sizes.length > 0 ? size.trim() : "";

  const lineKey = makeCartKey(product.id, colorForCart, sizeForCart);
  const inCart = cart[lineKey] ?? 0;
  const lineMax = maxQtyForCartLine(product, colorForCart, sizeForCart, cart, lineKey);
  const soldOut = productSoldOut(product);
  const canAdd = !soldOut && lineMax > 0;
  const hasVariantOptions = product.colors.length > 0 || product.sizes.length > 0;

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  useEffect(() => {
    setQtyDraft(1);
  }, [product.id, colorForCart, sizeForCart]);

  useEffect(() => {
    if (lineMax > 0) {
      setQtyDraft((q) => Math.min(Math.max(1, q), lineMax));
    }
  }, [lineMax]);

  useEffect(() => {
    if (inCart === 0) setQtyDraft(1);
  }, [inCart]);

  useEffect(() => {
    if (lightboxIndex === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightboxIndex(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightboxIndex]);

  useEffect(() => {
    if (lightboxIndex === null) return;
    if (imgs.length <= 1) {
      lightboxNeedsInitialScrollRef.current = false;
      return;
    }
    if (!lightboxNeedsInitialScrollRef.current) return;
    lightboxNeedsInitialScrollRef.current = false;
    const el = lightboxCarouselRef.current;
    if (!el) return;
    const run = () => {
      const w = el.clientWidth;
      if (w <= 0) return;
      const i = Math.max(0, Math.min(lightboxIndex, imgs.length - 1));
      skipLightboxScrollRef.current = true;
      el.scrollTo({ left: i * w, behavior: "auto" });
      window.setTimeout(() => {
        skipLightboxScrollRef.current = false;
      }, 80);
    };
    const id = requestAnimationFrame(() => requestAnimationFrame(run));
    return () => cancelAnimationFrame(id);
  }, [lightboxIndex, imgs.length]);

  const onLightboxScroll = useCallback(() => {
    if (skipLightboxScrollRef.current || imgs.length <= 1) return;
    const el = lightboxCarouselRef.current;
    if (!el) return;
    const w = el.clientWidth;
    if (w <= 0) return;
    const i = Math.round(el.scrollLeft / w);
    const clamped = Math.max(0, Math.min(i, imgs.length - 1));
    setLightboxIndex((prev) => (prev !== null && clamped !== prev ? clamped : prev));
  }, [imgs.length]);

  function openLightboxAt(i: number) {
    lightboxNeedsInitialScrollRef.current = true;
    setLightboxIndex(i);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 px-4 py-10 sm:px-6 sm:py-14 md:px-10 md:py-20"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="relative bg-white rounded-2xl shadow-2xl max-w-4xl w-full my-auto overflow-hidden ring-1 ring-stone-200/60"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-2 right-2 sm:top-3 sm:right-3 z-30 w-9 h-9 rounded-full bg-black/45 text-white hover:bg-black/55 backdrop-blur-sm text-xl flex items-center justify-center transition-colors shadow-md md:bg-stone-100 md:text-stone-600 md:hover:bg-stone-200 md:backdrop-blur-none md:shadow-none"
          aria-label="Fechar"
        >
          ×
        </button>

        <div className="flex flex-col md:flex-row max-md:pt-0 max-md:pb-3 md:py-5">
          {/* Galeria: miniaturas à esquerda + foto grande */}
          <div className="w-full md:w-[55%] flex flex-col-reverse sm:flex-row bg-stone-50 md:pl-2 md:pr-1 max-md:pt-0">
            {imgs.length > 1 && (
              <div className="flex sm:flex-col gap-2 p-3 sm:w-[80px] sm:min-w-[80px] overflow-x-auto sm:overflow-y-auto sm:overflow-x-hidden sm:max-h-[min(28rem,70vh)] [scrollbar-width:thin] snap-x snap-mandatory sm:snap-none max-sm:pb-1">
                {imgs.map((url, i) => (
                  <button
                    key={`${url}-${i}`}
                    type="button"
                    onClick={() => {
                      setImgIdx(i);
                      scrollCarouselToIndex(i, "smooth");
                    }}
                    className={`relative shrink-0 w-14 aspect-[2/3] sm:w-full sm:max-w-[80px] sm:mx-auto rounded-lg overflow-hidden ring-2 transition-all snap-start ${
                      i === safeImgIdx
                        ? "ring-stone-800 opacity-100 shadow-md"
                        : "ring-transparent opacity-60 hover:opacity-100 hover:ring-stone-300"
                    }`}
                  >
                    <Image
                      src={url}
                      alt=""
                      fill
                      className="object-contain bg-stone-200"
                      sizes="80px"
                    />
                  </button>
                ))}
              </div>
            )}
            {/* Galeria principal: deslize horizontal (snap) no mobile; toque sem arrastar abre zoom */}
            <div
              className={`relative w-full min-w-0 mx-0 shrink-0 max-sm:flex-none sm:flex-1 sm:min-h-0 aspect-auto min-h-[min(52vw,220px)] h-[min(88vh,36rem)] md:h-[min(72vh,34rem)] bg-stone-200 shadow-sm touch-pan-x max-sm:rounded-t-2xl sm:rounded-2xl ${
                imgs.length > 1 ? "max-sm:rounded-b-none" : "max-sm:rounded-b-2xl"
              }`}
            >
              {imgs.length > 1 ? (
                <div
                  ref={carouselRef}
                  onScroll={onCarouselScroll}
                  className="flex h-full w-full overflow-x-auto overflow-y-hidden snap-x snap-mandatory overscroll-x-contain rounded-[inherit] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                >
                  {imgs.map((url, i) => (
                    <div
                      key={`${url}-${i}`}
                      className="relative h-full min-w-full w-full shrink-0 snap-center snap-always bg-stone-200"
                    >
                      <Image
                        src={url}
                        alt={i === 0 ? product.name : `${product.name} — foto ${i + 1}`}
                        fill
                        className="object-contain object-center select-none pointer-events-none bg-stone-200"
                        draggable={false}
                        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 55vw, 480px"
                        priority={i === 0}
                      />
                      <div
                        role="button"
                        tabIndex={0}
                        aria-label="Ampliar foto"
                        className="absolute inset-0 z-[1] cursor-zoom-in touch-pan-x"
                        onPointerDown={(e) => {
                          pointerStartRef.current = { x: e.clientX, y: e.clientY };
                        }}
                        onPointerUp={(e) => {
                          const start = pointerStartRef.current;
                          pointerStartRef.current = null;
                          if (!start) return;
                          const dx = Math.abs(e.clientX - start.x);
                          const dy = Math.abs(e.clientY - start.y);
                          if (dx < 12 && dy < 12) openLightboxAt(i);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            openLightboxAt(i);
                          }
                        }}
                      />
                      {soldOut && (
                        <span className="absolute top-4 right-4 z-10 bg-boutique-wine/95 text-white text-xs font-semibold uppercase tracking-wide px-3 py-1.5 rounded-sm pointer-events-none">
                          Esgotado
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              ) : imgs.length === 1 ? (
                <div className="relative h-full w-full overflow-hidden rounded-[inherit]">
                  <Image
                    src={imgs[0]}
                    alt={product.name}
                    fill
                    className="object-contain object-center select-none pointer-events-none bg-stone-200"
                    draggable={false}
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 55vw, 480px"
                    priority
                  />
                  <div
                    role="button"
                    tabIndex={0}
                    aria-label="Ampliar foto"
                    className="absolute inset-0 z-[1] cursor-zoom-in touch-pan-x"
                    onPointerDown={(e) => {
                      pointerStartRef.current = { x: e.clientX, y: e.clientY };
                    }}
                    onPointerUp={(e) => {
                      const start = pointerStartRef.current;
                      pointerStartRef.current = null;
                      if (!start) return;
                      const dx = Math.abs(e.clientX - start.x);
                      const dy = Math.abs(e.clientY - start.y);
                      if (dx < 12 && dy < 12) openLightboxAt(0);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        openLightboxAt(0);
                      }
                    }}
                  />
                  {soldOut && (
                    <span className="absolute top-4 right-4 z-10 bg-boutique-wine/95 text-white text-xs font-semibold uppercase tracking-wide px-3 py-1.5 rounded-sm pointer-events-none">
                      Esgotado
                    </span>
                  )}
                </div>
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-6xl text-stone-300">
                  📷
                </div>
              )}
            </div>
          </div>

          {/* Info do produto */}
          <div className="md:w-[45%] p-6 pb-8 md:p-8 md:pb-10 md:pl-9 flex flex-col overflow-y-auto max-h-[80vh] md:max-h-[min(640px,85vh)]">
            <h2 className="text-xl md:text-2xl font-semibold text-stone-900 tracking-tight">
              {product.name}
            </h2>

            {product.category?.trim() && (
              <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-stone-500">
                {product.category.trim()}
              </p>
            )}

            {product.productReference?.trim() && (
              <p className="mt-2 text-sm text-stone-500">
                <span className="font-medium text-stone-600">Ref.</span>{" "}
                {product.productReference.trim()}
              </p>
            )}

            <div className="mt-4 flex items-baseline gap-3">
              {product.isPromotion &&
                product.compareAtPrice != null &&
                product.compareAtPrice > product.price && (
                  <span className="text-base text-stone-400 line-through">
                    R$ {formatPrice(product.compareAtPrice)}
                  </span>
                )}
              <span className="text-2xl font-bold text-stone-900">
                R$ {formatPrice(product.price)}
              </span>
            </div>

            {product.description && (
              <p className="mt-4 text-sm text-stone-600 leading-relaxed whitespace-pre-line">
                {product.description}
              </p>
            )}

            {/* Cores */}
            {product.colors.length > 0 && (
              <div className="mt-6">
                <p className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-2">
                  Cores:
                </p>
                <div className="flex flex-col gap-2">
                  {product.colors.map((c) => {
                    const fill = resolveSwatchFill(c, product.colorHexes);
                    const light = swatchNeedsStrongBorder(fill);
                    const selected = color === c;
                    return (
                      <button
                        key={c}
                        type="button"
                        onClick={() => {
                          setColor(c);
                        }}
                        className={`flex items-center gap-3 w-full sm:w-auto min-w-0 px-3 py-2.5 rounded-xl border text-left transition-all ${
                          selected
                            ? "border-stone-800 bg-stone-50 ring-2 ring-stone-800 ring-offset-1"
                            : "border-stone-200 text-stone-800 hover:border-stone-400 bg-white"
                        }`}
                      >
                        <span
                          className={`shrink-0 h-5 w-5 rounded-full border shadow-inner ${
                            light ? "border-stone-400" : "border-stone-200/80"
                          }`}
                          style={{ background: fill }}
                          aria-hidden
                        />
                        <span className="text-sm font-medium truncate">{c}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Tamanhos */}
            {product.sizes.length > 0 && (
              <div className="mt-5">
                <p className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-2">
                  Tamanho:
                </p>
                <div className="flex flex-wrap gap-2">
                  {product.sizes.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => {
                        setSize(s);
                      }}
                      className={`min-w-[44px] px-3 py-2 rounded-lg text-sm border text-center transition-all ${
                        size === s
                          ? "border-stone-800 bg-stone-800 text-white font-semibold"
                          : "border-stone-300 text-stone-700 hover:border-stone-500"
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {hasVariantOptions && product.variantStock.length > 0 && lineMax > 0 && (
              <p className="mt-3 text-xs text-stone-400">
                {lineMax} disponível(is) desta opção
              </p>
            )}

            {hasVariantOptions && product.variantStock.length > 0 && lineMax <= 0 && !soldOut && (
              <p className="mt-3 text-xs text-boutique-deeper">
                Sem estoque nesta combinação — escolha outra cor ou tamanho.
              </p>
            )}

            {/* Ações */}
            <div className="mt-6 space-y-3 pt-4 border-t border-stone-200/80 mt-auto">
              {soldOut ? (
                <button type="button" disabled className="w-full py-3.5 rounded-lg bg-stone-100 text-stone-400 font-semibold cursor-not-allowed">
                  Esgotado
                </button>
              ) : (
                <>
                  <p className="text-xs font-medium text-stone-500 uppercase tracking-wide">
                    Quantidade
                  </p>
                  <div className="flex items-center justify-between gap-3 bg-stone-50 rounded-lg p-3">
                    <button
                      type="button"
                      onClick={() =>
                        inCart === 0
                          ? setQtyDraft((q) => Math.max(1, q - 1))
                          : onSetQty(lineKey, inCart - 1)
                      }
                      disabled={inCart === 0 ? qtyDraft <= 1 : false}
                      className="w-10 h-10 rounded-lg bg-stone-200 font-bold text-stone-700 hover:bg-stone-300 transition-colors disabled:opacity-40"
                    >
                      −
                    </button>
                    <span className="font-semibold text-stone-800">
                      {inCart === 0 ? qtyDraft : inCart} un.
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        inCart === 0
                          ? setQtyDraft((q) => Math.min(lineMax, q + 1))
                          : onSetQty(lineKey, inCart + 1)
                      }
                      disabled={
                        inCart === 0 ? qtyDraft >= lineMax : inCart >= lineMax
                      }
                      className="w-10 h-10 rounded-lg bg-stone-200 font-bold text-stone-700 hover:bg-stone-300 transition-colors disabled:opacity-40"
                    >
                      +
                    </button>
                  </div>
                  {inCart === 0 ? (
                    <button
                      type="button"
                      onClick={() => onSetQty(lineKey, qtyDraft)}
                      disabled={!canAdd || qtyDraft < 1}
                      className="w-full py-3.5 rounded-lg text-white font-semibold tracking-wide transition-opacity hover:opacity-90 disabled:opacity-40 shadow-sm"
                      style={{ backgroundColor: "var(--store-secondary)" }}
                    >
                      Adicionar ao carrinho
                    </button>
                  ) : null}
                </>
              )}

              <button
                type="button"
                onClick={onClose}
                className="w-full py-3 rounded-lg border border-stone-300 text-stone-700 font-medium hover:bg-stone-50 transition-colors"
              >
                Voltar para a loja
              </button>

              {contactHref && (
                <div className="text-center pt-2">
                  <p className="text-xs text-stone-400 mb-1">
                    Ficou com alguma dúvida?
                  </p>
                  <a
                    href={contactHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm font-medium border border-stone-300 rounded-lg px-5 py-2.5 text-stone-700 hover:bg-stone-50 transition-colors"
                  >
                    Falar com o vendedor
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {lightboxIndex !== null && imgs.length > 0 && (
        <div
          className="fixed inset-0 z-[70]"
          onClick={(e) => e.stopPropagation()}
          role="presentation"
        >
          <button
            type="button"
            className="absolute inset-0 z-0 bg-black/95 cursor-default"
            aria-label="Fechar foto ampliada"
            onClick={() => setLightboxIndex(null)}
          />
          <div className="absolute inset-0 z-[10] pointer-events-none flex flex-col">
            <button
              type="button"
              className="pointer-events-auto absolute top-3 right-3 z-20 w-11 h-11 rounded-full bg-white/15 text-white text-2xl leading-none flex items-center justify-center hover:bg-white/25 backdrop-blur-sm border border-white/20"
              aria-label="Fechar"
              onClick={() => setLightboxIndex(null)}
            >
              ×
            </button>
            {imgs.length > 1 ? (
              <div
                ref={lightboxCarouselRef}
                onScroll={onLightboxScroll}
                className="pointer-events-auto mt-12 mb-8 flex min-h-0 flex-1 w-full overflow-x-auto overflow-y-hidden overscroll-x-contain snap-x snap-mandatory touch-pan-x [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >
                {imgs.map((url, i) => (
                  <div
                    key={`lb-${url}-${i}`}
                    className="flex h-full min-w-full w-full shrink-0 snap-center items-center justify-center px-3"
                  >
                    <div className="relative h-full w-full max-h-[min(85vh,calc(100vh-7rem))] max-w-[min(100%,1200px)]">
                      <Image
                        src={url}
                        alt={
                          i === 0
                            ? product.name
                            : `${product.name} — foto ${i + 1}`
                        }
                        fill
                        className="object-contain"
                        sizes="100vw"
                        priority={i === lightboxIndex}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="pointer-events-none flex flex-1 items-center justify-center p-6 pt-14 min-h-0">
                <div className="pointer-events-auto relative h-[min(85vh,calc(100vh-7rem))] w-full max-w-[min(100%,1024px)]">
                  <Image
                    src={imgs[0]}
                    alt={product.name}
                    fill
                    className="object-contain"
                    sizes="100vw"
                    priority
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

type StoreInfo = {
  slug: string;
  name: string;
  description: string | null;
  logo: string | null;
  phone: string | null;
};

function scrollToCatalogo() {
  document.getElementById("catalogo")?.scrollIntoView({
    behavior: "smooth",
    block: "start",
  });
}

function StorefrontCategoriesStrip({
  items,
  selectedLabel,
  onSelectCategory,
}: {
  items: StorefrontCategoryItem[];
  /** null = mostrar todos os produtos */
  selectedLabel: string | null;
  onSelectCategory: (label: string | null) => void;
}) {
  /** Bolinha circular. origin-top: ring/scale não sobem por cima do texto. */
  const ringActive =
    "ring-2 ring-offset-2 ring-stone-600/90 ring-offset-white scale-[1.02] origin-top";
  const thumbFrame =
    "relative w-[4.25rem] h-[4.25rem] sm:w-[4.75rem] sm:h-[4.75rem] shrink-0 rounded-full";
  const stripBtnClass =
    "flex flex-col items-center shrink-0 w-[4.75rem] sm:w-[5.25rem] snap-start group cursor-pointer border-0 bg-transparent p-0 shadow-none outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-300/80 focus-visible:rounded-2xl";

  return (
    <section
      id="faixa-categorias"
      className="w-full bg-white/90 border-b border-stone-200/70 pt-3 pb-2 sm:pt-4 sm:pb-2.5 scroll-mt-28"
      aria-label="Categorias"
    >
      <div className="max-w-6xl mx-auto px-4">
        <h2 className="text-base sm:text-lg font-semibold text-stone-800 tracking-tight mb-1">
          Categorias
        </h2>
        <p className="text-[11px] sm:text-xs leading-snug text-stone-500 mb-1 max-w-md">
          Toque para filtrar. <span className="whitespace-nowrap">«Todas»</span> mostra o
          catálogo completo.
        </p>
        <div
          className="flex gap-5 sm:gap-7 overflow-x-auto pt-3 sm:pt-3.5 pb-1 -mx-1 px-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden snap-x snap-mandatory"
          role="list"
        >
          <button
            type="button"
            role="listitem"
            onClick={() => {
              onSelectCategory(null);
              scrollToCatalogo();
            }}
            className={`${stripBtnClass} text-left`}
          >
            <div
              className={`${thumbFrame} ${
                selectedLabel == null ? ringActive : ""
              }`}
            >
              <div
                className="absolute inset-0 origin-top rounded-full bg-stone-100 border border-dashed border-stone-300/90 flex flex-col items-center justify-center gap-0.5 transition-transform group-hover:scale-[1.03]"
                aria-hidden
              >
                <span className="text-[1.65rem] sm:text-[1.85rem] leading-none select-none">
                  🛍️
                </span>
                <span className="text-[9px] font-semibold text-stone-500 uppercase tracking-wide">
                  Todas
                </span>
              </div>
            </div>
            <span className="mt-1.5 text-center text-xs text-stone-500 font-normal leading-tight max-w-[5.5rem]">
              Ver tudo
            </span>
          </button>
          {items.map((cat, i) => {
            const active =
              selectedLabel != null &&
              cat.label.localeCompare(selectedLabel, "pt", {
                sensitivity: "base",
              }) === 0;
            return (
              <button
                key={`${cat.label}-${i}`}
                type="button"
                role="listitem"
                onClick={() => {
                  onSelectCategory(cat.label);
                  scrollToCatalogo();
                }}
                className={`${stripBtnClass} text-left`}
              >
                <div className={`${thumbFrame} ${active ? ringActive : ""}`}>
                  <div className="absolute inset-0 origin-top rounded-full bg-stone-100 overflow-hidden ring-1 ring-stone-200/80 shadow-sm transition-transform group-hover:scale-[1.03] flex items-center justify-center">
                    {cat.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={cat.imageUrl}
                        alt=""
                        className="max-h-full max-w-full h-full w-full object-contain object-center"
                      />
                    ) : (
                      <span
                        className="text-[1.5rem] sm:text-[1.65rem] leading-none select-none opacity-90"
                        aria-hidden
                      >
                        🏷️
                      </span>
                    )}
                  </div>
                </div>
                <span className="mt-1.5 text-center text-xs text-stone-500 font-normal leading-tight max-w-[5.5rem] line-clamp-2">
                  {cat.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

type SortKey = "new" | "name-asc" | "name-desc" | "price-asc" | "price-desc";

export function LojaClient({
  store,
  storefront,
  products,
}: {
  store: StoreInfo;
  storefront: StorefrontSettings;
  products: CatalogProduct[];
}) {
  const [cart, setCart] = useState<Record<string, number>>({});
  const [cartOpen, setCartOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [shippingMode, setShippingMode] = useState<ShippingModeId | null>(null);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("new");
  const [selectedProduct, setSelectedProduct] = useState<CatalogProduct | null>(null);
  /** Filtro da faixa de categorias (null = todos) */
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);

  const filteredProducts = useMemo(() => {
    let list = products;
    const cf = categoryFilter?.trim();
    if (cf) {
      const useTree =
        storefront.categories.length > 0 &&
        storefront.categories.some((c) => c.label.trim());
      const matchNorms = useTree
        ? categoryFilterMatchNorms(cf, storefront.categories)
        : null;

      list = list.filter((p) => {
        const pc = p.category?.trim();
        if (!pc) return false;
        if (matchNorms) {
          return productCategoryMatchesNormSet(pc, matchNorms);
        }
        return (
          pc.localeCompare(cf, "pt", { sensitivity: "base" }) === 0
        );
      });
    }
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.description?.toLowerCase().includes(q) ?? false) ||
        (p.category?.toLowerCase().includes(q) ?? false)
    );
  }, [products, search, categoryFilter, storefront.categories]);

  const promoProducts = useMemo(
    () => filteredProducts.filter((p) => p.isPromotion),
    [filteredProducts]
  );

  const catalogProducts = useMemo(
    () => filteredProducts.filter((p) => !p.isPromotion),
    [filteredProducts]
  );

  const catalogSorted = useMemo(() => {
    const arr = [...catalogProducts];
    switch (sortBy) {
      case "name-asc":
        return arr.sort((a, b) => a.name.localeCompare(b.name, "pt"));
      case "name-desc":
        return arr.sort((a, b) => b.name.localeCompare(a.name, "pt"));
      case "price-asc":
        return arr.sort((a, b) => a.price - b.price);
      case "price-desc":
        return arr.sort((a, b) => b.price - a.price);
      case "new":
      default:
        return arr.sort(
          (a, b) =>
            new Date(b.createdAt || 0).getTime() -
            new Date(a.createdAt || 0).getTime()
        );
    }
  }, [catalogProducts, sortBy]);

  const heroDisplayTitle =
    storefront.heroTitle.trim() || store.name;

  /**
   * Faixa abaixo do banner:
   * - Se existirem categorias em Aparência da loja (`storefront.categories`), mostramos
   *   essas bolinhas sempre que houver produtos na loja (o cliente vê o que o vendedor configurou).
   * - Senão, comportamento antigo: só nomes que aparecem no campo categoria dos produtos.
   * Imagens vêm da configuração da loja quando o nome coincide.
   */
  const categoryStripItems = useMemo(() => {
    if (products.length === 0) return [];

    const configured = storefront.categories
      .map((sc) => ({
        label: sc.label.trim(),
        imageUrl: sc.imageUrl?.trim() ?? "",
      }))
      .filter((c) => c.label);

    if (configured.length > 0) {
      return [...configured].sort((a, b) =>
        a.label.localeCompare(b.label, "pt", { sensitivity: "base" })
      );
    }

    const fromProducts = new Set<string>();
    for (const p of products) {
      const c = p.category?.trim();
      if (c) fromProducts.add(c);
    }
    if (fromProducts.size === 0) return [];
    const sorted = Array.from(fromProducts).sort((a, b) =>
      a.localeCompare(b, "pt", { sensitivity: "base" })
    );
    return sorted.map((label) => {
      const match = storefront.categories.find(
        (sc) =>
          sc.label.trim().toLowerCase() === label.toLowerCase()
      );
      return {
        label,
        imageUrl: match?.imageUrl?.trim() ?? "",
      };
    });
  }, [products, storefront.categories]);

  const items = useMemo(() => {
    const list: Array<
      CatalogProduct & {
        cartKey: string;
        color: string;
        size: string;
        quantity: number;
        lineTotal: number;
      }
    > = [];

    for (const [key, quantity] of Object.entries(cart)) {
      if (quantity <= 0) continue;
      const { productId, color, size } = parseCartKey(key);
      const p = products.find((x) => x.id === productId);
      if (!p) continue;
      list.push({
        ...p,
        cartKey: key,
        color,
        size,
        quantity,
        lineTotal: p.price * quantity,
      });
    }
    return list;
  }, [products, cart]);

  const totalItems = useMemo(
    () => Object.values(cart).reduce((a, b) => a + b, 0),
    [cart]
  );

  const subtotal = useMemo(
    () => items.reduce((s, i) => s + i.lineTotal, 0),
    [items]
  );

  function setQty(cartKey: string, qty: number) {
    if (qty <= 0) {
      setCart((c) => {
        const next = { ...c };
        delete next[cartKey];
        return next;
      });
      return;
    }
    setCart((c) => {
      const parsed = parseCartKey(cartKey);
      const p = products.find((x) => x.id === parsed.productId);
      if (!p) return c;
      const maxAllowed = maxQtyForCartLine(
        p,
        parsed.color,
        parsed.size,
        c,
        cartKey
      );
      const nextQty = Math.min(qty, maxAllowed);
      if (nextQty <= 0) {
        const n = { ...c };
        delete n[cartKey];
        return n;
      }
      return { ...c, [cartKey]: nextQty };
    });
  }

  function buildOrderMessage(orderCode?: number | null): string {
    const lines = [
      `*Pedido — ${store.name}*`,
      "",
    ];
    if (orderCode != null && Number.isFinite(orderCode)) {
      lines.push(`*Código do pedido:* #${orderCode}`, "");
    }
    lines.push(
      `*Cliente:* ${customerName.trim() || "—"}`,
      `*Telefone / WhatsApp:* ${customerPhone.trim() || "—"}`,
    );
    if (shippingMode) {
      const lab = shippingModeLabel(shippingMode);
      if (lab) lines.push(`*Forma de envio:* ${lab}`);
    }
    lines.push(
      "",
      ...items.map((i) => {
        const bits: string[] = [];
        if (i.color) bits.push(`Cor: ${i.color}`);
        if (i.size) bits.push(`Tam: ${i.size}`);
        const opt = bits.length ? ` (${bits.join(", ")})` : "";
        const ref = i.productReference?.trim();
        const namePart = ref ? `${i.name} (Ref. ${ref})` : i.name;
        return `${i.quantity}x ${namePart}${opt} — R$ ${i.lineTotal.toFixed(2)} (un. R$ ${i.price.toFixed(2)})`;
      }),
      "",
      `*Subtotal: R$ ${subtotal.toFixed(2)}*`
    );
    if (notes.trim()) {
      lines.push("", `Obs: ${notes.trim()}`);
    }
    return lines.join("\n");
  }

  /** WhatsApp da loja válido para montar o link do pedido (mensagem é montada no clique, com código). */
  const orderWhatsAppReady = useMemo(
    () => whatsAppLink(store.phone, ".") !== null,
    [store.phone]
  );

  /** Devolve o `order_number` gravado no painel, para incluir na mensagem ao vendedor. */
  async function persistOrderSnapshot(): Promise<number | null> {
    if (items.length === 0 || !store.slug) return null;
    const name = customerName.trim();
    if (name.length < 2) return null;
    if (!isCustomerPhoneValid(customerPhone)) return null;
    if (!shippingMode) return null;
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeSlug: store.slug,
          customerName: name,
          customerPhone: customerPhone.trim(),
          shippingMode,
          notes: notes.trim(),
          lines: items.map((i) => ({
            productId: i.id,
            color: i.color,
            size: i.size,
            quantity: i.quantity,
          })),
        }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        orderNumber?: number;
        error?: string;
      };
      if (!res.ok) {
        console.warn(
          "[VendeWhat] Pedido não salvo no painel:",
          j?.error ?? res.status
        );
        return null;
      }
      if (typeof j.orderNumber === "number" && Number.isFinite(j.orderNumber)) {
        return j.orderNumber;
      }
      return null;
    } catch (e) {
      console.warn("[VendeWhat] Pedido não salvo no painel:", e);
      return null;
    }
  }

  const contactHref = whatsAppLink(
    store.phone,
    `Olá! Vim pelo catálogo da ${store.name} no VendeWhat.`
  );

  function handleHeroCta(e: React.MouseEvent, href: string) {
    if (href.startsWith("#")) {
      e.preventDefault();
      const id = href.slice(1);
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
    }
  }

  const themeStyle = {
    "--store-primary": storefront.themePrimary,
    "--store-secondary": storefront.themeSecondary,
  } as React.CSSProperties;

  return (
    <div
      className="min-h-screen bg-boutique-cream pb-28 md:pb-8 text-stone-800"
      style={themeStyle}
    >
      {/* Topo — logo, bullets, busca (estilo vitrine) */}
      <header
        className="z-40 border-b border-stone-200/80 shadow-[0_1px_0_rgba(92,46,54,0.04)] backdrop-blur-md md:sticky md:top-0"
        style={{ backgroundColor: storefront.headerBackground }}
      >
        <div className="max-w-6xl mx-auto px-4 py-3 md:py-4">
          <div className="flex flex-col gap-3 lg:gap-4">
            {/* Linha superior: logo | atalhos (mobile) — no desktop: logo | busca + atalhos na mesma linha */}
            <div className="flex flex-col gap-3 min-w-0 lg:flex-row lg:items-center lg:gap-6">
              <div className="flex min-w-0 flex-1 flex-col gap-2 lg:max-w-sm xl:max-w-xs shrink-0">
                <div className="flex items-center justify-between gap-2 min-w-0">
                  <div className="flex items-center gap-3 min-w-0">
                    {store.logo ? (
                      <div className="relative w-11 h-11 md:w-12 md:h-12 rounded-lg overflow-hidden bg-stone-100 flex-shrink-0 ring-1 ring-stone-200/80">
                        <Image
                          src={store.logo}
                          alt=""
                          fill
                          className="object-cover"
                          sizes="48px"
                        />
                      </div>
                    ) : (
                      <div
                        className="w-11 h-11 md:w-12 md:h-12 rounded-lg flex items-center justify-center text-lg flex-shrink-0 text-white"
                        style={{ backgroundColor: "var(--store-secondary)" }}
                      >
                        🛍
                      </div>
                    )}
                    <div className="min-w-0">
                      <p
                        className="font-serif text-lg md:text-xl font-semibold tracking-tight truncate"
                        style={{ color: "var(--store-secondary)" }}
                      >
                        {store.name}
                      </p>
                      <p className="text-[10px] uppercase tracking-[0.2em] text-stone-500">
                        Loja online
                      </p>
                    </div>
                  </div>
                  {/* Mobile/tablet: ♡ · carrinho · Instagram · WhatsApp — uma linha, sem quebra */}
                  <nav
                    className="flex lg:hidden items-center justify-end gap-0 flex-nowrap shrink-0"
                    style={{ color: "var(--store-primary)" }}
                    aria-label="Atalhos da loja"
                  >
                    <button
                      type="button"
                      className="p-2 rounded-full text-stone-400 hover:bg-stone-100 transition-colors shrink-0"
                      aria-label="Favoritos"
                    >
                      ♡
                    </button>
                    <button
                      type="button"
                      onClick={() => setCartOpen(true)}
                      className="relative p-2 rounded-full hover:bg-stone-100 transition-colors shrink-0"
                      aria-label="Carrinho"
                    >
                      <span className="text-xl leading-none">🛒</span>
                      {totalItems > 0 && (
                        <span
                          className="absolute top-0 right-0 text-white text-[10px] font-bold min-w-[1.1rem] h-4 px-1 rounded-full flex items-center justify-center"
                          style={{ backgroundColor: "var(--store-secondary)" }}
                        >
                          {totalItems}
                        </span>
                      )}
                    </button>
                    {storefront.instagramUrl && (
                      <a
                        href={storefront.instagramUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 rounded-full hover:bg-stone-100 transition-colors shrink-0 flex items-center justify-center"
                        style={{ color: "var(--store-primary)" }}
                        aria-label="Instagram da loja"
                        title="Instagram"
                      >
                        <InstagramIcon className="w-[22px] h-[22px]" />
                      </a>
                    )}
                    {contactHref && (
                      <a
                        href={contactHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-0.5 inline-flex items-center gap-1 bg-whatsapp text-white text-xs font-semibold px-2.5 py-2 rounded-full hover:bg-whatsapp-dark transition-colors shadow-sm shrink-0 whitespace-nowrap"
                      >
                        <svg
                          className="w-3.5 h-3.5 shrink-0"
                          fill="currentColor"
                          viewBox="0 0 24 24"
                          aria-hidden
                        >
                          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                        </svg>
                        <span className="hidden min-[380px]:inline">WhatsApp</span>
                      </a>
                    )}
                  </nav>
                </div>
                {storefront.infoBullets.length > 0 && (
                  <ul className="space-y-1 text-xs text-stone-600 max-w-md">
                    {storefront.infoBullets.map((line, i) => (
                      <li key={i} className="flex gap-2 items-start">
                        <span
                          className="font-bold leading-snug shrink-0"
                          style={{ color: "var(--store-primary)" }}
                        >
                          •
                        </span>
                        <span className="leading-snug">{line}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Busca + atalhos desktop na mesma linha */}
              <div className="flex w-full flex-1 min-w-0 flex-col gap-2 lg:flex-row lg:items-center lg:gap-3">
                <div className="relative w-full flex-1 min-w-0 lg:max-w-2xl">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400 text-sm pointer-events-none">
                    ⌕
                  </span>
                  <input
                    id="loja-busca"
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={storefront.searchPlaceholder}
                    className="w-full pl-10 pr-4 py-2.5 rounded-full border-2 border-stone-300 bg-white text-sm text-stone-800 placeholder:text-stone-400 shadow-sm focus:ring-2 focus:ring-boutique focus:border-boutique-dark outline-none transition-shadow scroll-mt-32"
                    aria-label="Buscar produtos"
                  />
                </div>
                <nav
                  className="hidden lg:flex items-center justify-end gap-1 flex-nowrap shrink-0"
                  style={{ color: "var(--store-primary)" }}
                  aria-label="Atalhos da loja"
                >
                  <button
                    type="button"
                    className="p-2.5 rounded-full text-stone-400 hover:bg-stone-100 transition-colors shrink-0"
                    aria-label="Favoritos"
                  >
                    ♡
                  </button>
                  <button
                    type="button"
                    onClick={() => setCartOpen(true)}
                    className="relative p-2.5 rounded-full hover:bg-stone-100 transition-colors shrink-0"
                    aria-label="Carrinho"
                  >
                    <span className="text-xl leading-none">🛒</span>
                    {totalItems > 0 && (
                      <span
                        className="absolute top-0.5 right-0.5 text-white text-[10px] font-bold min-w-[1.15rem] h-4 px-1 rounded-full flex items-center justify-center"
                        style={{ backgroundColor: "var(--store-secondary)" }}
                      >
                        {totalItems}
                      </span>
                    )}
                  </button>
                  {storefront.instagramUrl && (
                    <a
                      href={storefront.instagramUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2.5 rounded-full hover:bg-stone-100 transition-colors shrink-0 flex items-center justify-center"
                      style={{ color: "var(--store-primary)" }}
                      aria-label="Instagram da loja"
                      title="Instagram"
                    >
                      <InstagramIcon className="w-6 h-6" />
                    </a>
                  )}
                  {contactHref && (
                    <a
                      href={contactHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-1 inline-flex items-center gap-1.5 bg-whatsapp text-white text-sm font-semibold px-4 py-2.5 rounded-full hover:bg-whatsapp-dark transition-colors shadow-sm whitespace-nowrap shrink-0"
                    >
                      <svg
                        className="w-4 h-4 shrink-0"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                        aria-hidden
                      >
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                      </svg>
                      WhatsApp
                    </a>
                  )}
                </nav>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Banner só aparece para quem compra se o vendedor enviou ao menos uma foto */}
      {storefront.heroImages.length > 0 && (
        <HeroBannerBlock
          images={storefront.heroImages}
          themePrimary={storefront.themePrimary}
        >
          <div className="absolute inset-0 bg-gradient-to-r from-black/40 via-black/20 to-transparent z-10 pointer-events-none" />
          <div className="absolute inset-0 z-20 flex flex-col justify-end px-6 sm:px-10 md:px-14 pb-6 sm:pb-10 md:pb-12 max-w-3xl">
            {storefront.heroSubtitle && (
              <p className="text-sm sm:text-base text-white/90 font-medium tracking-widest uppercase">
                {storefront.heroSubtitle}
              </p>
            )}
            <h2 className="font-serif text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold text-white leading-[1.1] mt-2 drop-shadow-lg">
              {heroDisplayTitle}
            </h2>
            {store.description && (
              <p className="mt-3 text-white/85 text-sm md:text-base max-w-md leading-relaxed drop-shadow">
                {store.description}
              </p>
            )}
            <a
              href={storefront.heroCtaHref || "#catalogo"}
              onClick={(e) =>
                handleHeroCta(e, storefront.heroCtaHref || "#catalogo")
              }
              className="mt-6 inline-flex items-center justify-center px-8 py-3 rounded-md text-white text-sm font-bold uppercase tracking-widest shadow-lg hover:opacity-90 transition-opacity self-start"
              style={{ backgroundColor: "var(--store-secondary)" }}
            >
              {storefront.heroCtaLabel}
            </a>
          </div>
        </HeroBannerBlock>
      )}

      {categoryStripItems.length > 0 && (
        <StorefrontCategoriesStrip
          items={categoryStripItems}
          selectedLabel={categoryFilter}
          onSelectCategory={setCategoryFilter}
        />
      )}

      <main className="max-w-6xl mx-auto px-4">
        {products.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-lg border border-stone-100 shadow-sm my-10">
            <span className="text-5xl opacity-40">📦</span>
            <p className="mt-4 text-stone-600 font-medium font-serif text-lg">
              Em breve teremos produtos aqui
            </p>
            <p className="text-sm text-stone-400 mt-2">
              Volte em breve para conferir as novidades.
            </p>
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="text-center py-16 my-8">
            <p className="font-serif text-xl text-boutique-wine">
              {categoryFilter?.trim() && !search.trim()
                ? `Nenhum produto na categoria «${categoryFilter.trim()}».`
                : "Nenhum produto encontrado"}
            </p>
            <p className="text-stone-500 text-sm mt-2">
              {categoryFilter?.trim() && !search.trim()
                ? "Toque em «Todas» na faixa acima ou escolha outra categoria."
                : "Tente outro termo na busca ou ajuste o filtro de categoria."}
            </p>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-4">
              {categoryFilter?.trim() ? (
                <button
                  type="button"
                  onClick={() => setCategoryFilter(null)}
                  className="text-sm text-boutique-deeper underline hover:text-boutique-wine"
                >
                  Ver todas as categorias
                </button>
              ) : null}
              {search.trim() ? (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="text-sm text-boutique-deeper underline hover:text-boutique-wine"
                >
                  Limpar busca
                </button>
              ) : null}
            </div>
          </div>
        ) : (
          <div id="catalogo" className="scroll-mt-28">
            {promoProducts.length > 0 && (
              <section className="pt-3 pb-10 md:pt-4 md:pb-12">
                <div className="mb-4 md:mb-6">
                  <h3
                    className="font-serif text-2xl md:text-3xl font-semibold tracking-tight"
                    style={{ color: "var(--store-secondary)" }}
                  >
                    Promoções
                  </h3>
                  <p className="text-sm text-stone-500 mt-1">
                    Ofertas por tempo limitado
                  </p>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-6">
                  {promoProducts.map((product) => (
                    <ProductCatalogCard
                      key={product.id}
                      product={product}
                      cardMode="promotion"
                      onOpen={setSelectedProduct}
                    />
                  ))}
                </div>
              </section>
            )}

            {catalogSorted.length > 0 && (
              <section
                className={`pb-16 ${
                  promoProducts.length > 0
                    ? "pt-6 border-t border-stone-200/80"
                    : "pt-3 md:pt-4"
                }`}
              >
                <div className="mb-6 md:mb-8 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
                  <div>
                    <h3
                      className="font-serif text-2xl md:text-3xl font-semibold tracking-tight"
                      style={{ color: "var(--store-secondary)" }}
                    >
                      Produtos
                    </h3>
                    <p className="text-sm text-stone-500 mt-1">
                      Catálogo completo
                    </p>
                  </div>
                  <label className="inline-flex items-center gap-2 text-sm text-stone-600">
                    <span className="text-base opacity-70" aria-hidden>
                      ✦
                    </span>
                    <span className="sr-only">Ordenar</span>
                    <select
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value as SortKey)}
                      className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-800 focus:ring-2 focus:ring-boutique focus:border-boutique-dark outline-none cursor-pointer"
                    >
                      <option value="new">Mais recentes</option>
                      <option value="name-asc">Nome A–Z</option>
                      <option value="name-desc">Nome Z–A</option>
                      <option value="price-asc">Menor preço</option>
                      <option value="price-desc">Maior preço</option>
                    </select>
                  </label>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-5">
                  {catalogSorted.map((product) => (
                    <ProductCatalogCard
                      key={product.id}
                      product={product}
                      cardMode="catalog"
                      onOpen={setSelectedProduct}
                    />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}

        {storefrontRichFooterVisible(storefront) && (
          <StorefrontRichFooter
            sf={storefront}
            storeSlug={store.slug}
            storeName={store.name}
            whatsappHref={contactHref}
          />
        )}
      </main>

      <footer className="bg-stone-100/90 border-t border-stone-200/80 mt-4">
        <div className="max-w-6xl mx-auto px-4 py-10 md:py-12 grid grid-cols-1 sm:grid-cols-3 gap-8 text-sm">
          <div>
            <h4 className="font-semibold text-boutique-wine mb-3 font-serif">
              Institucional
            </h4>
            <ul className="space-y-2 text-stone-600">
              <li>
                <Link href="/" className="hover:text-boutique-deeper">
                  Sobre o VendeWhat
                </Link>
              </li>
              <li>
                <span className="text-stone-500">
                  Catálogo integrado ao WhatsApp
                </span>
              </li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold text-boutique-wine mb-3 font-serif">
              Dúvidas e contato
            </h4>
            {contactHref ? (
              <a
                href={contactHref}
                target="_blank"
                rel="noopener noreferrer"
                className="text-boutique-deeper hover:underline font-medium"
              >
                Falar no WhatsApp
              </a>
            ) : (
              <p className="text-stone-500">Contato em breve</p>
            )}
          </div>
          <div>
            <h4 className="font-semibold text-boutique-wine mb-3 font-serif">
              Redes sociais
            </h4>
            <p className="text-stone-500 text-xs leading-relaxed">
              {storefront.instagramUrl ||
              storefront.facebookUrl ||
              storefront.tiktokUrl ||
              storefront.youtubeUrl
                ? "Siga a loja nas redes:"
                : "Adicione Instagram e outras redes em Aparência da loja."}
            </p>
            <div className="flex flex-wrap gap-3 mt-3 items-center">
              {storefront.instagramUrl ? (
                <a
                  href={storefront.instagramUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm font-medium hover:opacity-80"
                  style={{ color: "var(--store-primary)" }}
                >
                  <InstagramIcon className="w-5 h-5 shrink-0" /> Instagram
                </a>
              ) : null}
              {storefront.facebookUrl && (
                <a
                  href={storefront.facebookUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-stone-600 hover:underline"
                >
                  Facebook
                </a>
              )}
              {storefront.tiktokUrl && (
                <a
                  href={storefront.tiktokUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-stone-600 hover:underline"
                >
                  TikTok
                </a>
              )}
              {storefront.youtubeUrl && (
                <a
                  href={storefront.youtubeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-stone-600 hover:underline"
                >
                  YouTube
                </a>
              )}
              {contactHref ? (
                <a
                  href={contactHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-lg hover:opacity-80"
                  title="WhatsApp"
                >
                  💬
                </a>
              ) : (
                <span className="text-lg opacity-40" title="WhatsApp">
                  💬
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="border-t border-stone-200/80 py-6 px-4 text-center">
          <p className="text-xs text-stone-500">
            <span className="font-medium text-boutique-wine">{store.name}</span>
            {" · "}
            Loja criada com{" "}
            <Link
              href="/"
              className="text-boutique-dark font-medium hover:underline"
            >
              VendeWhat
            </Link>
          </p>
          <p className="mt-3 flex flex-wrap items-center justify-center gap-4 text-[11px] text-stone-400 uppercase tracking-wide">
            <span>🔒 Ambiente seguro</span>
            <span>💳 Pix e cartão na negociação</span>
          </p>
        </div>
      </footer>

      {/* Carrinho flutuante (mobile) */}
      {totalItems > 0 && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/98 backdrop-blur border-t border-boutique-muted z-30 md:hidden flex items-center justify-between gap-3 shadow-[0_-8px_30px_rgba(92,46,54,0.12)]">
          <div>
            <p className="text-[11px] text-stone-500 uppercase tracking-wide">
              {totalItems} itens
            </p>
            <p className="font-semibold text-boutique-wine text-lg">
              R$ {subtotal.toFixed(2).replace(".", ",")}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setCartOpen(true)}
            className="flex-1 max-w-[200px] py-3 rounded-full text-white text-sm font-semibold uppercase tracking-wider shadow-md"
            style={{ backgroundColor: "var(--store-secondary)" }}
          >
            Carrinho
          </button>
        </div>
      )}

      {/* Detalhe do produto */}
      {selectedProduct && (
        <ProductDetailModal
          product={selectedProduct}
          cart={cart}
          onSetQty={setQty}
          onClose={() => setSelectedProduct(null)}
          contactHref={contactHref}
        />
      )}

      {/* Painel do carrinho */}
      {cartOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Carrinho"
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            onClick={() => setCartOpen(false)}
            aria-label="Fechar"
          />
          <div className="relative w-full sm:max-w-md max-h-[85vh] sm:rounded-xl bg-white shadow-2xl flex flex-col rounded-t-2xl overflow-hidden border border-boutique-muted/40">
            <div className="p-4 border-b border-boutique-muted/50 flex items-center justify-between bg-boutique-cream/50">
              <h3 className="font-serif font-semibold text-lg text-boutique-wine">
                Seu carrinho
              </h3>
              <button
                type="button"
                onClick={() => setCartOpen(false)}
                className="text-stone-400 hover:text-boutique-wine text-2xl leading-none px-2"
              >
                ×
              </button>
            </div>
            <div className="overflow-y-auto flex-1 p-4 space-y-4">
              {items.length === 0 ? (
                <p className="text-slate-500 text-center py-8">
                  Carrinho vazio. Adicione produtos na loja.
                </p>
              ) : (
                items.map((i) => (
                  <div
                    key={i.cartKey}
                    className="flex gap-3 items-center border-b border-boutique-muted/40 pb-4 last:border-0"
                  >
                    <div className="relative w-16 h-16 rounded-md bg-boutique-light overflow-hidden flex-shrink-0 ring-1 ring-boutique-muted/30">
                      {(i.images[0] ?? i.image) ? (
                        <Image
                          src={i.images[0] ?? i.image!}
                          alt=""
                          fill
                          className="object-cover"
                          style={catalogCardImageObjectStyle(
                            i.imageObjectPosition
                          )}
                          sizes="64px"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-xl">
                          📷
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-stone-900 truncate">
                        {i.name}
                      </p>
                      {(i.color || i.size) && (
                        <p className="text-xs text-stone-500 mt-0.5">
                          {[i.color && `Cor: ${i.color}`, i.size && `Tam: ${i.size}`]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      )}
                      <p className="text-sm text-stone-500">
                        R$ {i.price.toFixed(2).replace(".", ",")} × {i.quantity}
                      </p>
                      <div className="flex items-center gap-2 mt-2">
                        <button
                          type="button"
                          onClick={() =>
                            setQty(i.cartKey, i.quantity - 1)
                          }
                          className="w-8 h-8 rounded-md bg-boutique-muted text-sm font-bold text-boutique-wine hover:bg-boutique-dark hover:text-white"
                        >
                          −
                        </button>
                        <span className="w-8 text-center font-medium text-stone-800">
                          {i.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setQty(i.cartKey, i.quantity + 1)
                          }
                          disabled={
                            i.quantity >=
                            maxQtyForCartLine(
                              i,
                              i.color,
                              i.size,
                              cart,
                              i.cartKey
                            )
                          }
                          className="w-8 h-8 rounded-md bg-boutique-muted text-sm font-bold text-boutique-wine hover:bg-boutique-dark hover:text-white disabled:opacity-40"
                        >
                          +
                        </button>
                      </div>
                    </div>
                    <p className="font-semibold text-boutique-deeper text-sm whitespace-nowrap">
                      R$ {i.lineTotal.toFixed(2).replace(".", ",")}
                    </p>
                  </div>
                ))
              )}
              {items.length > 0 && (
                <>
                  <div className="space-y-3">
                    <div>
                      <label
                        htmlFor="vw-customer-name"
                        className="text-sm font-medium text-boutique-wine"
                      >
                        Seu nome <span className="text-red-600">*</span>
                      </label>
                      <input
                        id="vw-customer-name"
                        type="text"
                        autoComplete="name"
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                        placeholder="Nome para o pedido"
                        className="mt-1 w-full px-3 py-2 rounded-lg border border-stone-200 text-sm focus:ring-2 focus:ring-boutique focus:border-boutique-dark outline-none"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="vw-customer-phone"
                        className="text-sm font-medium text-boutique-wine"
                      >
                        Telefone / WhatsApp <span className="text-red-600">*</span>
                      </label>
                      <input
                        id="vw-customer-phone"
                        type="tel"
                        autoComplete="tel"
                        inputMode="tel"
                        required
                        value={customerPhone}
                        onChange={(e) => setCustomerPhone(e.target.value)}
                        placeholder="DDD + número (ex: 11 99999-9999)"
                        className="mt-1 w-full px-3 py-2 rounded-lg border border-stone-200 text-sm focus:ring-2 focus:ring-boutique focus:border-boutique-dark outline-none"
                      />
                      <p className="mt-1 text-xs text-stone-500">
                        Obrigatório: pelo menos 10 dígitos (com DDD).
                      </p>
                    </div>
                    <fieldset className="space-y-2 min-w-0">
                      <legend className="text-sm font-medium text-boutique-wine">
                        Forma de envio <span className="text-red-600">*</span>
                      </legend>
                      <p className="text-xs text-stone-500 -mt-0.5 mb-1">
                        Excursão, Correios ou retirada — selecione uma opção.
                      </p>
                      <div className="flex flex-col gap-2">
                        {SHIPPING_MODES.map((m) => {
                          const sel = shippingMode === m.id;
                          return (
                            <label
                              key={m.id}
                              className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 text-sm transition-colors ${
                                sel
                                  ? "border-boutique-dark bg-boutique-light/80 ring-2 ring-boutique/30"
                                  : "border-stone-200 bg-white hover:border-stone-300"
                              }`}
                            >
                              <input
                                type="radio"
                                name="vw-shipping-mode"
                                value={m.id}
                                checked={sel}
                                onChange={() => setShippingMode(m.id)}
                                className="h-4 w-4 shrink-0 accent-boutique-dark"
                              />
                              <span className="font-medium text-stone-800">
                                {m.label}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </fieldset>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-boutique-wine">
                      Observações (opcional)
                    </label>
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Ex: entrega à tarde, troco para R$ 100..."
                      rows={3}
                      className="mt-1 w-full px-3 py-2 rounded-lg border border-stone-200 text-sm focus:ring-2 focus:ring-boutique focus:border-boutique-dark resize-none outline-none"
                    />
                  </div>
                  <div className="flex justify-between items-center pt-2 text-lg font-bold text-stone-900">
                    <span>Total</span>
                    <span className="text-boutique-deeper font-serif">
                      R$ {subtotal.toFixed(2).replace(".", ",")}
                    </span>
                  </div>
                </>
              )}
            </div>
            {items.length > 0 && orderWhatsAppReady && (
              <div className="p-4 border-t border-boutique-muted/50 bg-boutique-cream/60">
                <button
                  type="button"
                  onClick={async () => {
                    const orderCode = await persistOrderSnapshot();
                    const href = whatsAppLink(
                      store.phone,
                      buildOrderMessage(orderCode)
                    );
                    if (!href) return;
                    setCartOpen(false);
                    /**
                     * Depois do `await`, o browser já não trata o clique como “gesto direto”:
                     * em mobile o `window.open` costuma ser bloqueado. Navegar na mesma aba
                     * abre o WhatsApp de forma fiável; no desktop mantemos novo separador.
                     */
                    const narrow =
                      typeof window !== "undefined" &&
                      window.matchMedia("(max-width: 767px)").matches;
                    const touchPrimary =
                      typeof window !== "undefined" &&
                      window.matchMedia("(pointer: coarse)").matches;
                    if (narrow || touchPrimary) {
                      window.location.assign(href);
                    } else {
                      window.open(href, "_blank", "noopener,noreferrer");
                    }
                  }}
                  disabled={
                    customerName.trim().length < 2 ||
                    !isCustomerPhoneValid(customerPhone) ||
                    !shippingMode
                  }
                  className="flex items-center justify-center gap-2 w-full py-3.5 rounded-xl bg-whatsapp text-white font-semibold hover:bg-whatsapp-dark transition-colors disabled:opacity-45 disabled:pointer-events-none"
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                  </svg>
                  Enviar pedido no WhatsApp
                </button>
                <p className="text-xs text-slate-400 text-center mt-2">
                  Registramos no painel com código do pedido e abrimos o WhatsApp com a
                  mesma mensagem
                </p>
                {customerName.trim().length < 2 ||
                !isCustomerPhoneValid(customerPhone) ||
                !shippingMode ? (
                  <p className="text-xs text-amber-700 text-center mt-2">
                    {customerName.trim().length < 2 ? (
                      <>
                        Preencha <strong>seu nome</strong>, <strong>telefone</strong> e{" "}
                        <strong>forma de envio</strong>.
                      </>
                    ) : !isCustomerPhoneValid(customerPhone) ? (
                      <>
                        Informe um <strong>telefone válido</strong> com DDD (10 a 15
                        dígitos).
                      </>
                    ) : (
                      <>
                        Selecione a <strong>forma de envio</strong> (excursão,
                        Correios ou retirada).
                      </>
                    )}
                  </p>
                ) : null}
              </div>
            )}
            {items.length > 0 && !orderWhatsAppReady && (
              <div className="p-4 border-t bg-amber-50 text-amber-800 text-sm text-center">
                A loja ainda não configurou o WhatsApp. Entre em contato por
                outro canal.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
