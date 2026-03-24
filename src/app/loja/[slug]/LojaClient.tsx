"use client";

import { useMemo, useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { whatsAppLink } from "@/lib/whatsapp";
import {
  type VariantStockRow,
  getStockForVariant,
  sumVariantStockRows,
} from "@/lib/productVariants";
import { type StorefrontSettings } from "@/lib/storefront";
import { swatchNeedsStrongBorder } from "@/lib/colorSwatch";
import { resolveSwatchFill } from "@/lib/productColorHexes";

export type CatalogProduct = {
  id: string;
  name: string;
  /** Código/referência opcional (ex.: SKU). */
  productReference: string | null;
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
};

function formatPrice(value: number): string {
  return value.toFixed(2).replace(".", ",");
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

/** Banner lateral: uma imagem fixa ou carrossel se houver várias. */
function HeroImageCarousel({
  images,
  themePrimary,
}: {
  images: string[];
  themePrimary: string;
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

  if (len === 0) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-stone-200 via-stone-100 to-stone-300 text-6xl opacity-40">
        ✦
      </div>
    );
  }

  return (
    <>
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
            className="absolute right-4 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-black/35 text-white text-xl font-light hover:bg-black/50 backdrop-blur-sm"
            aria-label="Próxima foto"
          >
            ›
          </button>
          <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-2 z-20 px-4">
            {images.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setIdx(i)}
                className={`h-2 rounded-full transition-all duration-300 ${
                  i === safeIdx ? "w-7 shadow-sm" : "w-2 opacity-60"
                }`}
                style={{
                  backgroundColor:
                    i === safeIdx ? themePrimary : "rgba(255,255,255,0.85)",
                }}
                aria-label={`Ir para foto ${i + 1}`}
              />
            ))}
          </div>
        </>
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
      <div className="aspect-square relative overflow-hidden rounded-2xl shadow-sm bg-stone-200">
        {imgSrc ? (
          <Image
            src={imgSrc}
            alt={product.name}
            fill
            className="object-cover object-center w-full h-full"
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
  onAdd,
  onSetQty,
  onClose,
  contactHref,
}: {
  product: CatalogProduct;
  cart: Record<string, number>;
  onAdd: (product: CatalogProduct, color: string, size: string) => void;
  onSetQty: (cartKey: string, qty: number) => void;
  onClose: () => void;
  contactHref: string | null;
}) {
  const [imgIdx, setImgIdx] = useState(0);
  const [color, setColor] = useState(product.colors[0] ?? "");
  const [size, setSize] = useState(product.sizes[0] ?? "");

  const imgs = product.images.length > 0 ? product.images : product.image ? [product.image] : [];
  const safeImgIdx = imgs.length > 0 ? Math.min(imgIdx, imgs.length - 1) : 0;

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

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-6 md:p-10"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="relative bg-white rounded-2xl shadow-2xl max-w-4xl w-full my-auto overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3 right-3 z-20 w-9 h-9 rounded-full bg-stone-100 hover:bg-stone-200 text-stone-600 text-xl flex items-center justify-center transition-colors"
          aria-label="Fechar"
        >
          ×
        </button>

        <div className="flex flex-col md:flex-row">
          {/* Galeria: miniaturas à esquerda + foto grande */}
          <div className="md:w-[55%] flex flex-col-reverse sm:flex-row bg-stone-50">
            {imgs.length > 1 && (
              <div className="flex sm:flex-col gap-2 p-3 sm:w-[80px] sm:min-w-[80px] overflow-x-auto sm:overflow-y-auto sm:overflow-x-hidden sm:max-h-[min(28rem,70vh)] [scrollbar-width:thin]">
                {imgs.map((url, i) => (
                  <button
                    key={`${url}-${i}`}
                    type="button"
                    onClick={() => setImgIdx(i)}
                    className={`relative shrink-0 w-16 h-16 sm:w-full sm:h-auto sm:aspect-square rounded-lg overflow-hidden ring-2 transition-all ${
                      i === safeImgIdx
                        ? "ring-stone-800 opacity-100 shadow-md"
                        : "ring-transparent opacity-60 hover:opacity-100 hover:ring-stone-300"
                    }`}
                  >
                    <Image src={url} alt="" fill className="object-cover" sizes="80px" />
                  </button>
                ))}
              </div>
            )}
            {/* Foto principal: 1:1, cover, centro — preenche o quadrado sem distorcer */}
            <div className="relative flex-1 w-full min-w-0 aspect-[1/1] rounded-2xl overflow-hidden bg-stone-200 shadow-sm">
              {imgs.length > 0 ? (
                <Image
                  src={imgs[safeImgIdx]}
                  alt={product.name}
                  fill
                  className="object-cover object-center"
                  style={{ objectFit: "cover", objectPosition: "center" }}
                  sizes="(max-width: 768px) 100vw, 50vw"
                  priority
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-6xl text-stone-300">
                  📷
                </div>
              )}
              {soldOut && (
                <span className="absolute top-4 right-4 z-10 bg-boutique-wine/95 text-white text-xs font-semibold uppercase tracking-wide px-3 py-1.5 rounded-sm">
                  Esgotado
                </span>
              )}
            </div>
          </div>

          {/* Info do produto */}
          <div className="md:w-[45%] p-6 md:p-8 flex flex-col overflow-y-auto max-h-[80vh] md:max-h-[600px]">
            <h2 className="text-xl md:text-2xl font-semibold text-stone-900 tracking-tight">
              {product.name}
            </h2>

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
                        disabled={inCart > 0}
                        className={`flex items-center gap-3 w-full sm:w-auto min-w-0 px-3 py-2.5 rounded-xl border text-left transition-all disabled:opacity-50 ${
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
                      onClick={() => { setSize(s); }}
                      disabled={inCart > 0}
                      className={`min-w-[44px] px-3 py-2 rounded-lg text-sm border text-center transition-all ${
                        size === s
                          ? "border-stone-800 bg-stone-800 text-white font-semibold"
                          : "border-stone-300 text-stone-700 hover:border-stone-500"
                      } disabled:opacity-50`}
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
              ) : inCart === 0 ? (
                <button
                  type="button"
                  onClick={() => onAdd(product, colorForCart, sizeForCart)}
                  disabled={!canAdd}
                  className="w-full py-3.5 rounded-lg text-white font-semibold tracking-wide transition-opacity hover:opacity-90 disabled:opacity-40 shadow-sm"
                  style={{ backgroundColor: "var(--store-secondary)" }}
                >
                  Selecione
                </button>
              ) : (
                <div className="flex items-center justify-between gap-3 bg-stone-50 rounded-lg p-3">
                  <button
                    type="button"
                    onClick={() => onSetQty(lineKey, inCart - 1)}
                    className="w-10 h-10 rounded-lg bg-stone-200 font-bold text-stone-700 hover:bg-stone-300 transition-colors"
                  >
                    −
                  </button>
                  <span className="font-semibold text-stone-800">{inCart} un.</span>
                  <button
                    type="button"
                    onClick={() => onAdd(product, colorForCart, sizeForCart)}
                    disabled={inCart >= lineMax}
                    className="w-10 h-10 rounded-lg bg-stone-200 font-bold text-stone-700 hover:bg-stone-300 transition-colors disabled:opacity-40"
                  >
                    +
                  </button>
                </div>
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
    </div>
  );
}

type StoreInfo = {
  name: string;
  description: string | null;
  logo: string | null;
  phone: string | null;
};

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
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("new");
  const [selectedProduct, setSelectedProduct] = useState<CatalogProduct | null>(null);

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.description?.toLowerCase().includes(q) ?? false)
    );
  }, [products, search]);

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

  function addToCart(p: CatalogProduct, color: string, size: string) {
    if (productSoldOut(p)) return;
    const c = p.colors.length > 0 ? color.trim() : "";
    const s = p.sizes.length > 0 ? size.trim() : "";
    const key = makeCartKey(p.id, c, s);
    setCart((cart) => {
      const line = cart[key] ?? 0;
      const max = maxQtyForCartLine(p, c, s, cart, key);
      if (line >= max) return cart;
      return { ...cart, [key]: line + 1 };
    });
  }

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

  function buildOrderMessage(): string {
    const lines = [
      `*Pedido — ${store.name}*`,
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
      `*Subtotal: R$ ${subtotal.toFixed(2)}*`,
    ];
    if (notes.trim()) {
      lines.push("", `Obs: ${notes.trim()}`);
    }
    return lines.join("\n");
  }

  const orderHref = whatsAppLink(store.phone, buildOrderMessage());
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
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-stone-200/80 shadow-[0_1px_0_rgba(92,46,54,0.04)]">
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
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={storefront.searchPlaceholder}
                    className="w-full pl-10 pr-4 py-2.5 rounded-full border border-stone-200 bg-stone-50/80 text-sm text-stone-800 placeholder:text-stone-400 focus:ring-2 focus:ring-boutique focus:border-boutique-dark outline-none transition-shadow"
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

      {/* Banner 1920×600 (proporção 16:5) — altura segue a largura da tela */}
      <section className="relative w-full aspect-[1920/600] overflow-hidden">
        {storefront.heroImages.length > 0 ? (
          <HeroImageCarousel
            images={storefront.heroImages}
            themePrimary={storefront.themePrimary}
          />
        ) : (
          <div
            className="absolute inset-0"
            style={{ backgroundColor: "var(--store-primary)" }}
          />
        )}
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
      </section>

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
              Nenhum produto encontrado
            </p>
            <p className="text-stone-500 text-sm mt-2">
              Tente outro termo na busca.
            </p>
            <button
              type="button"
              onClick={() => setSearch("")}
              className="mt-4 text-sm text-boutique-deeper underline hover:text-boutique-wine"
            >
              Limpar busca
            </button>
          </div>
        ) : (
          <div id="catalogo" className="scroll-mt-28">
            {promoProducts.length > 0 && (
              <section className="py-10 md:py-12">
                <div className="mb-6 md:mb-8">
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
                    ? "pt-8 border-t border-stone-200/80"
                    : "pt-10"
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
              storefront.tiktokUrl
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
          onAdd={addToCart}
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
            {items.length > 0 && orderHref && (
              <div className="p-4 border-t border-boutique-muted/50 bg-boutique-cream/60">
                <a
                  href={orderHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setCartOpen(false)}
                  className="flex items-center justify-center gap-2 w-full py-3.5 rounded-xl bg-whatsapp text-white font-semibold hover:bg-whatsapp-dark transition-colors"
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                  </svg>
                  Enviar pedido no WhatsApp
                </a>
                <p className="text-xs text-slate-400 text-center mt-2">
                  Abre o WhatsApp com o pedido já formatado
                </p>
              </div>
            )}
            {items.length > 0 && !orderHref && (
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
