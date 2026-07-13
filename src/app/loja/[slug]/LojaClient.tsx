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
  type HeroSlide,
  type ProductCardRatio,
  type StorefrontCategoryItem,
  type StorefrontSettings,
  storefrontRichFooterVisible,
} from "@/lib/storefront";
import { discountPercent } from "@/lib/productCardMeta";
import {
  HeroTemplateSlide,
  type HeroSlideContent,
} from "@/components/storefront/HeroTemplateSlide";
import { StorefrontRichFooter } from "@/components/storefront/StorefrontRichFooter";
import CookieConsent from "@/components/storefront/CookieConsent";
import { BorderBeam } from "@/components/magicui/border-beam";
import { AnimatedGradientText } from "@/components/magicui/animated-gradient-text";
import { ShimmerButton } from "@/components/magicui/shimmer-button";
import { BlurFade } from "@/components/magicui/blur-fade";
import { BlockRenderer } from "@/components/storefront/blocks";
import type { BlockProduct } from "@/components/storefront/blocks";
import { swatchNeedsStrongBorder } from "@/lib/colorSwatch";
import { resolveSwatchFill } from "@/lib/productColorHexes";
import { isCustomerPhoneValid } from "@/lib/customerPhone";
import {
  SHIPPING_MODES,
  shippingModeLabel,
  type ShippingModeId,
} from "@/lib/shippingModes";
import {
  PAYMENT_METHODS,
  paymentMethodLabel,
  type PaymentMethodId,
} from "@/lib/paymentMethods";
import { coverImageStyleAt, type ImageFocusPoint } from "@/lib/productImageFocus";
import {
  type ProductSale,
  quantityStep,
  quantityMin,
  snapQuantity,
  quantityLabel,
} from "@/lib/saleMode";

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
  /** Vídeo do produto (opcional), exibido no detalhe. */
  videoUrl: string | null;
  colors: string[];
  /** Tom #rrggbb da bolinha por nome da cor (vendedor). */
  colorHexes: Record<string, string>;
  sizes: string[];
  /** Estoque por combinação; vazio = usa só `stock` (legado). */
  variantStock: VariantStockRow[];
  /** Palavras-chave para a busca da loja (além de nome/descrição/categoria). */
  tags: string[];
  /** Abreviação do tipo de unidade (ex.: "Kg"); vazio quando é "Unidade" (padrão). */
  unitShort: string;
  /** Código de barras (EAN), se cadastrado. */
  barcode: string | null;
  stock: number;
  createdAt: string;
  isPromotion: boolean;
  compareAtPrice: number | null;
  /** Formato da foto deste produto no card ("1:1"/"3:4"); null = usa o padrão da loja. */
  cardRatio: ProductCardRatio | null;
  /** Enquadramento da 1.ª foto no card (lista); no detalhe as fotos aparecem inteiras. */
  imageObjectPosition: string;
  /** Foco por índice de `images` (arraste no painel); mesmo comprimento que `images`. */
  imageObjectPositions: ImageFocusPoint[];
  /** Modo de venda (avulso / fardo / mínimo) e exibição de preço. */
  sale: ProductSale;
};

function formatPrice(value: number): string {
  return value.toFixed(2).replace(".", ",");
}

/** Conectores que ficam minúsculos no meio de um nome (pt-BR). */
const TITLE_CASE_LOWER = new Set([
  "da",
  "de",
  "do",
  "das",
  "dos",
  "e",
  "di",
  "du",
]);

/**
 * "Primeira letra maiúscula em cada palavra", mantendo conectores (da, de, do,
 * e…) minúsculos — exceto quando são a primeira palavra. Ex.: "felipe da silva"
 * → "Felipe da Silva"; "santa cruz do capibaribe" → "Santa Cruz do Capibaribe".
 */
function titleCasePtBr(raw: string): string {
  const s = raw.trim();
  if (!s) return s;
  return s
    .split(/\s+/)
    .map((word, i) => {
      const lower = word.toLocaleLowerCase("pt");
      if (i > 0 && TITLE_CASE_LOWER.has(lower)) return lower;
      return lower.charAt(0).toLocaleUpperCase("pt") + lower.slice(1);
    })
    .join(" ");
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

/* ── Ícones de linha do cabeçalho (estilo e-commerce) ─────────────────── */
const strokeProps = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};
function IconUser({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" {...strokeProps} aria-hidden>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-3.6 3.6-6 8-6s8 2.4 8 6" />
    </svg>
  );
}
function IconHeart({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" {...strokeProps} aria-hidden>
      <path d="M12 20.5S3.5 15.3 3.5 9.3A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 8.5 1.7c0 6-8.5 11.2-8.5 11.2z" />
    </svg>
  );
}
function IconBag({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" {...strokeProps} aria-hidden>
      <path d="M6 7h12l1 13H5L6 7z" />
      <path d="M9 7V6a3 3 0 0 1 6 0v1" />
    </svg>
  );
}
function IconSearch({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" {...strokeProps} aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </svg>
  );
}
function WhatsAppGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

/** Renderiza um aviso com trechos entre **…** em dourado. */
function AnnouncementText({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("**") && p.endsWith("**") ? (
          <span key={i} className="font-bold" style={{ color: "#FFDA6C" }}>
            {p.slice(2, -2)}
          </span>
        ) : (
          <span key={i}>{p}</span>
        )
      )}
    </>
  );
}

/** Barra preta de avisos no topo (frete grátis, parcelamento, troca…). */
function AnnouncementBar({ items, bg }: { items: string[]; bg: string }) {
  if (items.length === 0) return null;
  return (
    <div
      className="w-full text-white text-center text-[11px] sm:text-xs font-medium tracking-wide py-2 px-4"
      style={{ backgroundColor: bg }}
    >
      <div className="hidden sm:block">
        {items.map((it, i) => (
          <span key={i} className="whitespace-nowrap">
            {i > 0 && <span className="text-white/30 mx-2">|</span>}
            <AnnouncementText text={it} />
          </span>
        ))}
      </div>
      <div className="sm:hidden">
        <AnnouncementText text={items[0]} />
      </div>
    </div>
  );
}

/** Ícone-ação do cabeçalho (ícone + rótulo em pilha, estilo e-commerce). */
function HeaderAction({
  icon,
  label,
  dark,
  onClick,
  badge,
}: {
  icon: React.ReactNode;
  label: string;
  dark: boolean;
  onClick?: () => void;
  badge?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative flex flex-col items-center gap-0.5 px-2.5 py-1.5 rounded-lg min-w-[52px] transition-colors ${
        dark ? "text-white/90 hover:bg-white/10" : "text-stone-700 hover:bg-stone-100"
      }`}
      aria-label={label}
    >
      <span className="relative">
        {icon}
        {badge != null && badge > 0 && (
          <span
            className="absolute -top-1.5 -right-2.5 text-white text-[10px] font-bold min-w-[1.05rem] h-4 px-1 rounded-full flex items-center justify-center"
            style={{ backgroundColor: EC.accent }}
          >
            {badge > 99 ? "99+" : badge}
          </span>
        )}
      </span>
      <span className="text-[0.62rem] font-medium leading-none">{label}</span>
    </button>
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
            className={`object-cover object-center ${
              i === safeIdx ? "vw-ken-burns" : ""
            }`}
            sizes="100vw"
            priority={i === 0}
          />
        </div>
      ))}
    </div>
  );
}

/**
 * Banner: carrossel onde CADA foto tem seu próprio formato (`overlay`/`split`)
 * E seu próprio texto. Renderiza só o slide ativo (a altura acompanha o formato).
 * Campo de texto vazio no slide → usa o `fallback` (texto geral do banner).
 */
type HeroFallbackContent = {
  badge: string;
  title: string;
  subtitle: string;
  couponCode: string;
  ctaLabel: string;
  ctaHref: string;
};

function HeroBannerBlock({
  slides,
  themePrimary,
  fallback,
  onCta,
}: {
  slides: HeroSlide[];
  themePrimary: string;
  fallback: HeroFallbackContent;
  onCta: (e: React.MouseEvent, href: string) => void;
}) {
  const [idx, setIdx] = useState(0);
  const len = slides.length;
  const safeIdx = len > 0 ? Math.min(idx, len - 1) : 0;
  const slide = slides[safeIdx];
  const slidesKey = useMemo(() => slides.map((s) => s.url).join("|"), [slides]);

  useEffect(() => {
    setIdx(0);
  }, [slidesKey]);

  useEffect(() => {
    if (len <= 1) return;
    const t = setInterval(() => {
      setIdx((i) => (i + 1) % len);
    }, 5500);
    return () => clearInterval(t);
  }, [len]);

  if (!slide) return null;

  // Conteúdo do slide ativo: usa o texto próprio da foto ou cai no texto geral.
  const badge = slide.badge?.trim() || fallback.badge;
  const title = slide.title?.trim() || fallback.title;
  const highlight = slide.highlight?.trim() || "";
  const subtitle = slide.subtitle?.trim() || fallback.subtitle;
  const couponCode = slide.couponCode?.trim() || fallback.couponCode;
  const ctaLabel = slide.ctaLabel?.trim() || fallback.ctaLabel;
  const ctaHref = slide.ctaHref?.trim() || fallback.ctaHref || "#catalogo";

  const textContent = (
    <>
      {badge && (
        <p className="text-sm sm:text-base text-white/90 font-medium tracking-widest uppercase">
          {badge}
        </p>
      )}
      <h2 className="font-serif text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold text-white leading-[1.1] mt-2 drop-shadow-lg">
        {title}
      </h2>
      {highlight && (
        <p className="leading-none mt-1">
          {/* Destaque cursivo em degradê animado (estilo do outro projeto). */}
          <span
            className="vw-anim-gradient font-script font-bold text-4xl sm:text-5xl md:text-6xl"
            style={{
              backgroundImage:
                "linear-gradient(to right, var(--store-primary), #ffffff, var(--store-primary))",
            }}
          >
            {highlight}
          </span>
        </p>
      )}
      {subtitle && (
        <p className="mt-3 text-white/85 text-sm md:text-base max-w-md leading-relaxed drop-shadow">
          {subtitle}
        </p>
      )}
      {couponCode && (
        <div className="mt-5 inline-flex items-center gap-2 self-start">
          <span className="text-xs sm:text-sm font-semibold uppercase tracking-widest text-white/80">
            Use o código
          </span>
          <span className="px-3 py-1 rounded bg-white/15 border border-white/30 text-white text-sm font-bold tracking-wider backdrop-blur-sm">
            {couponCode}
          </span>
        </div>
      )}
      {ctaLabel && (
        <a
          href={ctaHref}
          onClick={(e) => onCta(e, ctaHref)}
          className="mt-6 inline-flex items-center justify-center px-8 py-3 rounded-md text-white text-sm font-bold uppercase tracking-widest shadow-lg hover:opacity-90 transition-opacity self-start"
          style={{ backgroundColor: "var(--store-primary)" }}
        >
          {ctaLabel}
        </a>
      )}
    </>
  );

  const arrows = len > 1 && (
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
  );

  // Bolinhas por DENTRO do card (embaixo, ao centro) — mesmo modelo em todos.
  const internalDots = len > 1 && (
    <nav
      className="absolute inset-x-0 bottom-3 z-30 flex justify-center gap-2"
      aria-label="Fotos do banner"
    >
      {slides.map((_, i) => (
        <button
          key={i}
          type="button"
          onClick={() => setIdx(i)}
          className={`h-2 rounded-full shadow transition-all duration-300 ${
            i === safeIdx ? "w-6 bg-white" : "w-2 bg-white/60"
          }`}
          aria-label={`Ir para foto ${i + 1}`}
          aria-current={i === safeIdx ? "true" : undefined}
        />
      ))}
    </nav>
  );

  // TODOS os banners no MESMO modelo: card contido (max-w-[1260px]), arredondado, com
  // margem (não cola nas bordas) e proporção fixa (cabe na tela sem rolar).
  // Bolinhas por dentro. Os cards promocionais ficam FORA, abaixo, na mesma
  // largura (seção logo após o <HeroBannerBlock/> na página).
  const template = slide.template ?? "overlay";
  const content: HeroSlideContent = {
    badge,
    title,
    highlight,
    subtitle,
    ctaLabel,
    ctaHref,
  };

  let inner: React.ReactNode;
  if (slide.noText) {
    // "Só a foto": ignora estilo/texto/painel e mostra só a imagem no card
    // (para fotos que já vêm com os dizeres embutidos).
    inner = <HeroSlideshowLayer images={[slide.url]} activeIndex={0} />;
  } else if (template !== "overlay" && template !== "split") {
    // strips/duo/gráficos: layout completo (texto + fotos lado a lado) também no
    // celular, igual à referência — o HeroTemplateSlide preenche (absolute inset-0).
    inner = (
      <HeroTemplateSlide
        slide={slide}
        content={content}
        primary={themePrimary}
        onCta={onCta}
      />
    );
  } else if (template === "split" || slide.layout === "split") {
    const photo = (
      <div className="relative h-1/2 w-full overflow-hidden md:h-full md:w-1/2">
        <HeroSlideshowLayer images={[slide.url]} activeIndex={0} />
      </div>
    );
    const text = (
      <div
        className="vw-reveal-stagger flex h-1/2 w-full flex-col justify-center px-6 py-4 sm:px-10 md:h-full md:w-1/2 md:py-12"
        style={{ backgroundColor: "var(--store-secondary)" }}
      >
        {textContent}
      </div>
    );
    inner = (
      <div className="absolute inset-0 flex flex-col md:flex-row">
        {slide.photoSide === "left" ? (
          <>
            {photo}
            {text}
          </>
        ) : (
          <>
            {text}
            {photo}
          </>
        )}
      </div>
    );
  } else {
    // Overlay: foto de fundo + texto por cima.
    inner = (
      <>
        <HeroSlideshowLayer images={[slide.url]} activeIndex={0} />
        <div className="pointer-events-none absolute inset-0 z-10 bg-gradient-to-r from-black/40 via-black/20 to-transparent" />
        <div className="vw-reveal-stagger absolute inset-0 z-20 flex max-w-3xl flex-col justify-end px-6 pb-8 sm:px-10 md:px-14 md:pb-12">
          {textContent}
        </div>
      </>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1260px] px-4 pt-3 sm:pt-4">
      {/* Altura FLUIDA (técnica da referência): acompanha a largura (55vw),
          nunca passa de 460px e no celular tem mínimo de 420px pra o layout
          completo (texto + fotos) caber sem cortar. */}
      <section
        style={{ height: "clamp(240px, 55vw, 460px)" }}
        className="relative min-h-[420px] w-full overflow-hidden rounded-2xl shadow-sm sm:min-h-0 sm:rounded-3xl"
      >
        {/* key = índice do slide: ao trocar, o React remonta e a animação
            (vw-banner-in) toca de novo, dando a transição do carrossel. */}
        <div key={safeIdx} className="vw-banner-in absolute inset-0">
          {inner}
        </div>
        {arrows}
        {internalDots}
      </section>
    </div>
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

/* ── Paleta do estilo "e-commerce" (referência sitederoupa) ─────────────
   Fixa de propósito para os cards ficarem idênticos à referência em toda
   loja (azul primário, laranja no preço, vermelho no desconto, dourado nas
   estrelas), independente do tema por loja. */
const EC = {
  primary: "#0062B8",
  primaryDark: "#002962",
  primaryHl: "#A1CCF7",
  accent: "#FF6B00", // preço
  sale: "#E63946", // selo de desconto
  gold: "#F5A623", // estrelas
  border: "#DCE3EC",
  foreground: "#1A1A2E",
  muted: "#4A5E78",
  imgBg: "#E8ECF2",
} as const;

/** 5 estrelas cheias + nota — decorativo, igual à referência (não são reviews reais). */
function StarRating() {
  return (
    <div className="flex items-center gap-1">
      <span className="leading-none tracking-tight text-[13px]" style={{ color: EC.gold }} aria-hidden>
        ★★★★★
      </span>
      <span className="text-[0.65rem]" style={{ color: EC.muted }}>
        (4.9)
      </span>
    </div>
  );
}

/**
 * Contador regressivo "Ofertas Relâmpago" (pílula azul-escura, igual à
 * referência). Só renderiza quando a data-fim está no futuro; some quando
 * expira. Monta só no cliente para evitar divergência de hidratação.
 */
function FlashSaleCountdown({ endsAt }: { endsAt: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);
  if (now == null) return null;
  const end = new Date(endsAt).getTime();
  if (!Number.isFinite(end)) return null;
  const diff = end - now;
  if (diff <= 0) return null;
  const totalSec = Math.floor(diff / 1000);
  const days = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-white"
      style={{ backgroundColor: EC.primaryDark }}
    >
      <span aria-hidden>⏱</span>
      Termina em:&nbsp;
      <span className="font-mono tabular-nums">
        {days > 0 ? `${days}d ` : ""}
        {pad(h)}:{pad(m)}:{pad(s)}
      </span>
    </span>
  );
}

/** Produto criado nos últimos N dias? (para o selo "Novo", igual à referência). */
function isRecent(createdAt: string, days = 21): boolean {
  const t = new Date(createdAt).getTime();
  if (!Number.isFinite(t)) return false;
  return Date.now() - t <= days * 86400 * 1000;
}

function ProductCatalogCard({
  product,
  imageRatio,
  installmentsMax,
  freeShippingLabel,
  showRatings,
  revealDelayMs = 0,
  featured = false,
  onOpen,
}: {
  product: CatalogProduct;
  /** Formato da foto do card: "1:1" (quadrado) ou "3:4" (retrato). */
  imageRatio: ProductCardRatio;
  /** Máx. de parcelas "sem juros" (estimativa); 0/1 = não mostra. */
  installmentsMax: number;
  /** Texto do selo de frete grátis (vazio = usa o padrão da referência: preço ≥ R$79). */
  freeShippingLabel: string;
  /** Mostra estrelas (decorativas). */
  showRatings: boolean;
  /** Atraso da animação de entrada (efeito escalonado na grade). */
  revealDelayMs?: number;
  /** Card em destaque: ganha o feixe de luz na borda (BorderBeam). */
  featured?: boolean;
  onOpen: (product: CatalogProduct) => void;
}) {
  const imgSrc = product.images[0] ?? product.image;
  const soldOut = productSoldOut(product);

  // Animação de entrada (fade-up ao aparecer na tela), como o BlurFade da referência.
  const rootRef = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -40px 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Prévia do vídeo no card: toca ao passar o mouse (desktop) ou o dedo (celular).
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoPlaying, setVideoPlaying] = useState(false);
  const playPreview = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    setVideoPlaying(true);
    v.play().catch(() => {});
  }, []);
  const stopPreview = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    v.pause();
    try {
      v.currentTime = 0;
    } catch {}
    setVideoPlaying(false);
  }, []);

  // Pausa a prévia quando o card sai da tela (evita vários vídeos tocando ao rolar).
  useEffect(() => {
    if (!product.videoUrl) return;
    const el = rootRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) stopPreview();
      },
      { threshold: 0 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [product.videoUrl, stopPreview]);

  // Preço exibido (fardo mostra o preço do fardo quando configurado).
  const shownPrice =
    product.sale.saleMode === "pack" && product.sale.priceDisplay === "pack"
      ? product.price * product.sale.packSize
      : product.price;

  const hasCompare =
    product.isPromotion &&
    product.compareAtPrice != null &&
    product.compareAtPrice > product.price;
  const discount = hasCompare
    ? discountPercent(product.price, product.compareAtPrice)
    : null;

  // Parcelamento estimado (mesma fórmula da referência: ~R$20/parcela, teto 10).
  const maxN = installmentsMax > 0 ? installmentsMax : 0;
  const installN = maxN >= 2 ? Math.min(Math.floor(shownPrice / 20), maxN) : 0;
  const showInstall = shownPrice >= 40 && installN >= 2;

  // Frete grátis (badge): rótulo do lojista OU regra padrão da referência (≥ R$79).
  const freeShip = freeShippingLabel.trim();
  const showFrete = !soldOut && (freeShip.length > 0 || shownPrice >= 79);

  const isNew = discount == null && isRecent(product.createdAt);

  return (
    <div
      ref={rootRef}
      className={`group relative flex h-full cursor-pointer flex-col ${
        shown ? "vw-blur-fade" : "opacity-0"
      }`}
      style={{ animationDelay: `${revealDelayMs}ms` }}
      onClick={() => onOpen(product)}
      onMouseEnter={product.videoUrl ? playPreview : undefined}
      onMouseLeave={product.videoUrl ? stopPreview : undefined}
      onTouchStart={product.videoUrl ? playPreview : undefined}
    >
      <div
        className="relative flex h-full flex-col overflow-hidden rounded-xl border bg-white transition-all duration-200 hover:-translate-y-0.5 hover:border-[#A1CCF7] hover:shadow-[0_4px_12px_rgba(0,40,100,0.14)]"
        style={{ borderColor: EC.border }}
      >
        {featured && (
          <BorderBeam
            size={150}
            duration={12}
            colorFrom={EC.primary}
            colorTo={EC.accent}
          />
        )}
        {/* Foto */}
        <div
          className={`${
            imageRatio === "1:1" ? "aspect-square" : "aspect-[3/4]"
          } relative overflow-hidden`}
          style={{ backgroundColor: EC.imgBg }}
        >
          {imgSrc ? (
            <Image
              src={imgSrc}
              alt={product.name}
              fill
              className="object-cover transition-transform duration-500 group-hover:scale-[1.06]"
              style={coverImageStyleAt(
                0,
                product.imageObjectPositions,
                product.imageObjectPosition
              )}
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-5xl text-stone-300">
              📷
            </div>
          )}

          {/* Prévia do vídeo: aparece por cima da foto ao passar o mouse/dedo */}
          {product.videoUrl && (
            <video
              ref={videoRef}
              src={product.videoUrl}
              muted
              loop
              playsInline
              preload="metadata"
              className={`absolute inset-0 z-[5] h-full w-full object-cover transition-opacity duration-300 ${
                videoPlaying ? "opacity-100" : "opacity-0"
              }`}
            />
          )}

          {/* Selo de vídeo: indica que o produto tem vídeo (canto inferior direito) */}
          {product.videoUrl && !soldOut && !videoPlaying && (
            <span
              className="absolute bottom-2 right-2 z-10 flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-[0.6rem] font-semibold text-white backdrop-blur-sm"
              aria-hidden
            >
              <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-white/90 text-[0.5rem] text-black">
                ▶
              </span>
              Vídeo
            </span>
          )}

          {/* Selo desconto (vermelho) OU "Novo" (azul), canto superior esquerdo */}
          {discount != null ? (
            <span
              className="absolute left-3 top-3 z-10 rounded px-2 py-0.5 text-xs font-bold text-white"
              style={{ backgroundColor: EC.sale }}
            >
              -{discount}%
            </span>
          ) : isNew ? (
            <span
              className="absolute left-3 top-3 z-10 rounded px-2 py-0.5 text-xs font-bold text-white"
              style={{ backgroundColor: EC.primary }}
            >
              Novo
            </span>
          ) : null}

          {/* Selo frete grátis (azul), canto superior direito */}
          {showFrete && (
            <span
              className="absolute right-3 top-3 z-10 rounded px-2 py-0.5 text-[0.6rem] font-bold text-white"
              style={{ backgroundColor: EC.primary }}
            >
              Frete grátis
            </span>
          )}

          {/* Esgotado */}
          {soldOut && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/40">
              <span
                className="rounded-full bg-white px-3 py-1.5 text-xs font-bold shadow"
                style={{ color: EC.foreground }}
              >
                Esgotado
              </span>
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex flex-1 flex-col gap-1.5 p-3">
          {product.category?.trim() && (
            <p
              className="text-[0.65rem] uppercase tracking-wider"
              style={{ color: EC.muted }}
            >
              {product.category.trim()}
            </p>
          )}

          <h3
            className="line-clamp-2 min-h-[2.4em] text-sm font-medium leading-snug"
            style={{ color: EC.foreground }}
          >
            {product.name}
          </h3>

          {/* Preço: atual (laranja) + "de" riscado + selo -X% */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-base font-bold" style={{ color: EC.accent }}>
              R${formatPrice(shownPrice)}
            </span>
            {hasCompare && (
              <span className="text-xs line-through" style={{ color: EC.muted }}>
                R${formatPrice(product.compareAtPrice as number)}
              </span>
            )}
            {discount != null && (
              <span
                className="rounded-full px-1.5 py-0.5 text-[0.6rem] font-bold text-white"
                style={{ backgroundColor: EC.accent }}
              >
                -{discount}%
              </span>
            )}
          </div>

          {showInstall && (
            <p className="text-[0.65rem]" style={{ color: EC.muted }}>
              ou {installN}x de R${formatPrice(shownPrice / installN)} sem juros
            </p>
          )}

          {product.sale.saleMode === "pack" && (
            <p className="text-[0.65rem]" style={{ color: EC.muted }}>
              {product.sale.priceDisplay === "pack"
                ? `o fardo (${product.sale.packSize} un.)`
                : `fardo de ${product.sale.packSize} un.`}
            </p>
          )}
          {product.sale.saleMode === "min" && (
            <p className="text-[0.65rem]" style={{ color: EC.muted }}>
              mínimo {product.sale.minQuantity} un.
            </p>
          )}

          {showRatings && <StarRating />}

          {/* Botão: aparece no hover (igual à referência); abre o detalhe. */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpen(product);
            }}
            className="mt-auto flex translate-y-1 items-center justify-center gap-1.5 rounded-full py-2 text-xs font-bold text-white opacity-0 transition-all duration-200 hover:opacity-100 group-hover:translate-y-0 group-hover:opacity-100"
            style={{ backgroundColor: EC.primary }}
          >
            🛍️ {soldOut ? "Ver produto" : "Adicionar à sacola"}
          </button>
        </div>
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
  /**
   * Mídias da galeria: o vídeo (se houver) entra como PRIMEIRO item, seguido das
   * fotos — tudo no mesmo carrossel/miniaturas, então clicar nas miniaturas alterna
   * entre o vídeo e as fotos. `imgIndex` guarda a posição original da foto (para o
   * ponto de foco e o zoom, que continuam por foto).
   */
  const media: Array<
    | { type: "video"; url: string }
    | { type: "image"; url: string; imgIndex: number }
  > = [
    ...(product.videoUrl ? [{ type: "video" as const, url: product.videoUrl }] : []),
    ...imgs.map((url, imgIndex) => ({ type: "image" as const, url, imgIndex })),
  ];
  const safeImgIdx = media.length > 0 ? Math.min(imgIdx, media.length - 1) : 0;

  const imgFocusStyle = (i: number) =>
    coverImageStyleAt(i, product.imageObjectPositions, product.imageObjectPosition);

  const scrollCarouselToIndex = useCallback(
    (i: number, behavior: "smooth" | "auto" = "smooth") => {
      const el = carouselRef.current;
      if (!el || media.length <= 1) return;
      const w = el.clientWidth;
      if (w <= 0) return;
      skipCarouselScrollRef.current = true;
      el.scrollTo({
        left: Math.min(i, media.length - 1) * w,
        behavior,
      });
      window.setTimeout(
        () => {
          skipCarouselScrollRef.current = false;
        },
        behavior === "auto" ? 50 : 450
      );
    },
    [media.length]
  );

  const onCarouselScroll = useCallback(() => {
    if (skipCarouselScrollRef.current || media.length <= 1) return;
    const el = carouselRef.current;
    if (!el) return;
    const w = el.clientWidth;
    if (w <= 0) return;
    const i = Math.round(el.scrollLeft / w);
    const clamped = Math.max(0, Math.min(i, media.length - 1));
    setImgIdx((prev) => (clamped !== prev ? clamped : prev));
  }, [media.length]);

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
  const saleStep = quantityStep(product.sale);
  const saleMin = quantityMin(product.sale);
  /** Maior quantidade válida (múltiplo do passo) que ainda cabe no estoque. */
  const lineMaxStepped = Math.floor(lineMax / saleStep) * saleStep;
  const canAdd = !soldOut && lineMaxStepped >= saleMin;
  const hasVariantOptions = product.colors.length > 0 || product.sizes.length > 0;

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  useEffect(() => {
    setQtyDraft(saleMin);
  }, [product.id, colorForCart, sizeForCart, saleMin]);

  useEffect(() => {
    if (lineMaxStepped >= saleMin) {
      setQtyDraft((q) => Math.min(Math.max(saleMin, q), lineMaxStepped));
    }
  }, [lineMaxStepped, saleMin]);

  useEffect(() => {
    if (inCart === 0) setQtyDraft(saleMin);
  }, [inCart, saleMin]);

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
      className="fixed inset-0 z-50 flex items-stretch justify-center overflow-y-auto bg-black/40 md:items-start md:px-10 md:py-20"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="relative bg-white shadow-2xl w-full min-h-full overflow-hidden md:min-h-0 md:my-auto md:max-w-4xl md:rounded-2xl md:ring-1 md:ring-stone-200/60"
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
          {/* Galeria: vídeo (se houver) entra como 1.ª mídia do carrossel; miniaturas à esquerda */}
          <div className="w-full md:w-[55%] flex flex-col bg-stone-50 md:pl-2 md:pr-1 max-md:pt-0">
            <div className="flex flex-col-reverse sm:flex-row min-w-0">
            {media.length > 1 && (
              <div className="flex sm:flex-col gap-2 p-3 sm:w-[80px] sm:min-w-[80px] overflow-x-auto sm:overflow-y-auto sm:overflow-x-hidden sm:max-h-[min(28rem,70vh)] [scrollbar-width:thin] snap-x snap-mandatory sm:snap-none max-sm:pb-1">
                {media.map((item, i) => (
                  <button
                    key={`${item.url}-${i}`}
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
                    {item.type === "video" ? (
                      <>
                        <video
                          src={item.url}
                          muted
                          playsInline
                          preload="metadata"
                          className="absolute inset-0 h-full w-full object-cover bg-stone-900"
                        />
                        <span className="absolute inset-0 flex items-center justify-center bg-black/25">
                          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/90 text-[0.55rem] text-stone-900">
                            ▶
                          </span>
                        </span>
                      </>
                    ) : (
                      <Image
                        src={item.url}
                        alt=""
                        fill
                        className="object-contain bg-stone-200"
                        style={imgFocusStyle(item.imgIndex)}
                        sizes="80px"
                      />
                    )}
                  </button>
                ))}
              </div>
            )}
            {/* Galeria principal: deslize horizontal (snap) no mobile; toque sem arrastar abre zoom */}
            <div
              className={`relative w-full min-w-0 mx-0 shrink-0 max-sm:flex-none sm:flex-1 sm:min-h-0 aspect-auto min-h-[min(52vw,220px)] h-[min(88vh,36rem)] md:h-[min(72vh,34rem)] bg-stone-200 shadow-sm touch-pan-x max-sm:rounded-t-2xl sm:rounded-2xl ${
                media.length > 1 ? "max-sm:rounded-b-none" : "max-sm:rounded-b-2xl"
              }`}
            >
              {media.length > 1 ? (
                <div
                  ref={carouselRef}
                  onScroll={onCarouselScroll}
                  className="flex h-full w-full overflow-x-auto overflow-y-hidden snap-x snap-mandatory overscroll-x-contain rounded-[inherit] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                >
                  {media.map((item, i) => (
                    <div
                      key={`${item.url}-${i}`}
                      className="relative h-full min-w-full w-full shrink-0 snap-center snap-always bg-stone-200"
                    >
                      {item.type === "video" ? (
                        <video
                          src={item.url}
                          controls
                          autoPlay
                          muted
                          loop
                          playsInline
                          preload="metadata"
                          className="absolute inset-0 h-full w-full object-contain bg-black"
                        />
                      ) : (
                        <>
                          <Image
                            src={item.url}
                            alt={
                              item.imgIndex === 0
                                ? product.name
                                : `${product.name} — foto ${item.imgIndex + 1}`
                            }
                            fill
                            className="object-contain object-center select-none pointer-events-none bg-stone-200"
                            style={imgFocusStyle(item.imgIndex)}
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
                              if (dx < 12 && dy < 12) openLightboxAt(item.imgIndex);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                openLightboxAt(item.imgIndex);
                              }
                            }}
                          />
                        </>
                      )}
                      {soldOut && (
                        <span className="absolute top-4 right-4 z-10 bg-boutique-wine/95 text-white text-xs font-semibold uppercase tracking-wide px-3 py-1.5 rounded-sm pointer-events-none">
                          Esgotado
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              ) : media.length === 1 ? (
                media[0].type === "video" ? (
                  <video
                    src={media[0].url}
                    controls
                    autoPlay
                    muted
                    loop
                    playsInline
                    preload="metadata"
                    className="absolute inset-0 h-full w-full object-contain bg-black rounded-[inherit]"
                  />
                ) : (
                  <div className="relative h-full w-full overflow-hidden rounded-[inherit]">
                    <Image
                      src={imgs[0]}
                      alt={product.name}
                      fill
                      className="object-contain object-center select-none pointer-events-none bg-stone-200"
                      style={imgFocusStyle(0)}
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
                )
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-6xl text-stone-300">
                  📷
                </div>
              )}
            </div>
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

            {product.barcode?.trim() && (
              <p className="mt-1 text-xs text-stone-400">
                <span className="font-medium text-stone-500">Cód. de barras</span>{" "}
                {product.barcode.trim()}
              </p>
            )}

            <div className="mt-4 flex items-baseline gap-3 flex-wrap">
              {product.isPromotion &&
                product.compareAtPrice != null &&
                product.compareAtPrice > product.price && (
                  <span className="text-base text-stone-400 line-through">
                    R$ {formatPrice(product.compareAtPrice)}
                  </span>
                )}
              {product.sale.saleMode === "pack" &&
              product.sale.priceDisplay === "pack" ? (
                <>
                  <span className="text-2xl font-bold text-stone-900">
                    R$ {formatPrice(product.price * product.sale.packSize)}
                  </span>
                  <span className="text-sm text-stone-500">
                    o fardo ({product.sale.packSize}× R$ {formatPrice(product.price)})
                  </span>
                </>
              ) : (
                <>
                  <span className="text-2xl font-bold text-stone-900">
                    R$ {formatPrice(product.price)}
                    <span className="text-sm font-normal text-stone-500">
                      {" "}
                      /{product.unitShort || "un."}
                    </span>
                  </span>
                  {product.sale.saleMode === "pack" && (
                    <span className="text-sm text-stone-500">
                      fardo de {product.sale.packSize} = R${" "}
                      {formatPrice(product.price * product.sale.packSize)}
                    </span>
                  )}
                </>
              )}
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
                    {product.sale.saleMode === "pack" && (
                      <span className="ml-1 normal-case font-normal text-stone-400">
                        — vendido em fardo de {product.sale.packSize}
                      </span>
                    )}
                    {product.sale.saleMode === "min" && (
                      <span className="ml-1 normal-case font-normal text-stone-400">
                        — mínimo {product.sale.minQuantity} un.
                      </span>
                    )}
                  </p>
                  <div className="flex items-center justify-between gap-3 bg-stone-50 rounded-lg p-3">
                    <button
                      type="button"
                      onClick={() =>
                        inCart === 0
                          ? setQtyDraft((q) => Math.max(saleMin, q - saleStep))
                          : onSetQty(lineKey, inCart - saleStep)
                      }
                      disabled={inCart === 0 ? qtyDraft <= saleMin : false}
                      className="w-10 h-10 rounded-lg bg-stone-200 font-bold text-stone-700 hover:bg-stone-300 transition-colors disabled:opacity-40"
                    >
                      −
                    </button>
                    <span className="font-semibold text-stone-800">
                      {quantityLabel(product.sale, inCart === 0 ? qtyDraft : inCart)}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        inCart === 0
                          ? setQtyDraft((q) =>
                              Math.min(lineMaxStepped, q + saleStep)
                            )
                          : onSetQty(lineKey, inCart + saleStep)
                      }
                      disabled={
                        inCart === 0
                          ? qtyDraft >= lineMaxStepped
                          : inCart >= lineMaxStepped
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
                      disabled={!canAdd || qtyDraft < saleMin}
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
                        style={imgFocusStyle(i)}
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
                    style={imgFocusStyle(0)}
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

/** Emoji para a categoria (chute por palavra-chave, estilo da referência). */
function categoryEmoji(label: string): string {
  const l = label.toLowerCase();
  const map: [RegExp, string][] = [
    [/camiset|blusa|regata|t-?shirt|polo|top\b/, "👕"],
    [/cal[çc]a|jeans|legging/, "👖"],
    [/short|bermuda/, "🩳"],
    [/vestido/, "👗"],
    [/saia/, "👚"],
    [/moletom|casaco|jaqueta|blazer|su[ée]ter|inverno|frio/, "🧥"],
    [/t[êe]nis|sapat|cal[çc]ad|sand[áa]lia|bota|chinelo/, "👟"],
    [/bolsa|mochila|carteira|acess[óo]ri/, "👜"],
    [/[óo]culos/, "🕶️"],
    [/rel[óo]gio/, "⌚"],
    [/eletr[ôo]nic|celular|fone|smart|tech/, "📱"],
    [/biqu[íi]ni|praia|mai[ôo]|sunga/, "👙"],
    [/infantil|beb[êe]|kids|crian[çc]/, "🧸"],
    [/joia|bijou|colar|brinco|an[eé]l|pulseira/, "💍"],
    [/perfume|beleza|cosm[ée]tic|maquiagem/, "💄"],
  ];
  for (const [re, emoji] of map) if (re.test(l)) return emoji;
  return "🛍️";
}

/** Parse "#rgb"/"#rrggbb" → [r,g,b] ou null (para derivar a cor da barra). */
function parseHexRgb(v: string): [number, number, number] | null {
  const m = v.trim().replace("#", "");
  if (/^[0-9a-fA-F]{3}$/.test(m)) {
    return [
      parseInt(m[0] + m[0], 16),
      parseInt(m[1] + m[1], 16),
      parseInt(m[2] + m[2], 16),
    ];
  }
  if (/^[0-9a-fA-F]{6}$/.test(m)) {
    return [
      parseInt(m.slice(0, 2), 16),
      parseInt(m.slice(2, 4), 16),
      parseInt(m.slice(4, 6), 16),
    ];
  }
  return null;
}

/** Clareia uma cor rumo ao branco (amount 0..1). */
function lightenRgb([r, g, b]: [number, number, number], amount: number): string {
  const f = (c: number) => Math.round(c + (255 - c) * amount);
  return `rgb(${f(r)}, ${f(g)}, ${f(b)})`;
}

/** Cor escura? (brilho percebido). */
function isDarkRgb([r, g, b]: [number, number, number]): boolean {
  return 0.299 * r + 0.587 * g + 0.114 * b < 140;
}

/** Menu de categorias no topo (barra horizontal, rola no celular). */
function CategoryNavBar({
  items,
  selectedLabel,
  onSelect,
  barBg,
  barDark,
  promoActive,
  onSelectPromo,
}: {
  items: StorefrontCategoryItem[];
  selectedLabel: string | null;
  onSelect: (label: string | null) => void;
  /** Cor de fundo da barra (derivada do topo, mais clara). */
  barBg?: string;
  /** Fundo escuro? define a cor do texto dos itens (e o dourado no ativo). */
  barDark: boolean;
  /** "🔥 Promoções" selecionado. */
  promoActive: boolean;
  /** Alterna o filtro de promoções. */
  onSelectPromo: () => void;
}) {
  const [allOpen, setAllOpen] = useState(false);
  // Barra = cor do topo (mais clara). Ativo em DOURADO no fundo escuro (igual à
  // referência) ou na cor primária no fundo claro; inativos seguem o contraste.
  const base =
    "flex items-center gap-1.5 shrink-0 whitespace-nowrap px-4 py-3 text-xs sm:text-[13px] font-medium border-b-2 transition-colors";
  const inactive = barDark
    ? "border-transparent text-white/75 hover:text-white hover:border-white/40"
    : "border-transparent text-stone-600 hover:text-stone-900 hover:border-stone-300";
  const activeStyle: React.CSSProperties = barDark
    ? { color: "#FFD600", borderColor: "#FFD600" }
    : { color: "var(--store-primary)", borderColor: "var(--store-primary)" };
  const novidadesActive = selectedLabel == null && !promoActive;
  return (
    <nav
      className="w-full"
      style={{
        backgroundColor: barBg ?? "var(--store-secondary)",
        borderTop: barDark
          ? "1px solid rgba(255,255,255,0.08)"
          : "1px solid rgba(0,0,0,0.06)",
      }}
      aria-label="Categorias"
    >
      <div className="max-w-[1260px] mx-auto px-3 sm:px-6 flex items-center overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <button
          type="button"
          onClick={() => onSelect(null)}
          className={`${base} ${novidadesActive ? "" : inactive}`}
          style={novidadesActive ? activeStyle : undefined}
        >
          <span aria-hidden>✨</span> Novidades
        </button>
        {items.map((it) => {
          const active =
            !promoActive &&
            selectedLabel != null &&
            it.label.localeCompare(selectedLabel, "pt", {
              sensitivity: "base",
            }) === 0;
          return (
            <button
              key={it.label}
              type="button"
              onClick={() => onSelect(it.label)}
              className={`${base} ${active ? "" : inactive}`}
              style={active ? activeStyle : undefined}
            >
              <span aria-hidden>{categoryEmoji(it.label)}</span> {it.label}
            </button>
          );
        })}

        {/* Ver todas ▾ — menu com todas as categorias (acesso rápido) */}
        {items.length > 0 && (
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => setAllOpen((v) => !v)}
              className={`${base} ${inactive}`}
              aria-haspopup="menu"
              aria-expanded={allOpen}
            >
              Ver todas <span aria-hidden>▾</span>
            </button>
            {allOpen && (
              <>
                <div
                  className="fixed inset-0 z-20"
                  onClick={() => setAllOpen(false)}
                  aria-hidden
                />
                <div
                  className="absolute left-0 top-full z-30 mt-1 max-h-72 w-56 overflow-y-auto rounded-xl border border-black/10 bg-white py-2 shadow-xl"
                  role="menu"
                >
                  <button
                    type="button"
                    onClick={() => {
                      onSelect(null);
                      setAllOpen(false);
                    }}
                    className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-stone-700 hover:bg-stone-100"
                    role="menuitem"
                  >
                    <span aria-hidden>✨</span> Novidades
                  </button>
                  {items.map((it) => (
                    <button
                      key={it.label}
                      type="button"
                      onClick={() => {
                        onSelect(it.label);
                        setAllOpen(false);
                      }}
                      className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-stone-700 hover:bg-stone-100"
                      role="menuitem"
                    >
                      <span aria-hidden>{categoryEmoji(it.label)}</span>{" "}
                      {it.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* 🔥 Promoções — sempre por último */}
        <button
          type="button"
          onClick={onSelectPromo}
          className={`${base} ${promoActive ? "" : inactive}`}
          style={promoActive ? activeStyle : undefined}
        >
          <span aria-hidden>🔥</span> Promoções
        </button>
      </div>
    </nav>
  );
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
  /** Tile de categoria (card branco com emoji/foto + rótulo), estilo e-commerce. */
  const tileBase =
    "group flex flex-col items-center justify-center gap-2 p-3 sm:p-4 rounded-xl border bg-white transition shrink-0 w-[5.5rem] sm:w-auto snap-start cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-[#0062B8]";
  const tileActive = "border-[#0062B8] bg-[#F0F6FC] shadow-sm";
  const tileIdle =
    "border-[#DCE3EC] hover:border-[#0062B8] hover:shadow-md hover:bg-[#F0F6FC]/40";

  return (
    <section
      id="faixa-categorias"
      className="w-full pt-5 pb-2 scroll-mt-28"
      aria-label="Categorias"
    >
      <div className="max-w-[1260px] mx-auto px-4">
        <h2 className="flex items-center gap-3 text-lg sm:text-xl font-bold text-stone-900 tracking-tight mb-4">
          <span className="whitespace-nowrap">Categorias</span>
          <span className="flex-1 h-px bg-[#DCE3EC]" aria-hidden />
        </h2>
        <div
          className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden snap-x sm:grid sm:grid-cols-4 md:grid-cols-8 sm:overflow-visible sm:mx-0 sm:px-0"
          role="list"
        >
          <button
            type="button"
            role="listitem"
            onClick={() => {
              onSelectCategory(null);
              scrollToCatalogo();
            }}
            className={`${tileBase} ${selectedLabel == null ? tileActive : tileIdle}`}
          >
            <span className="text-3xl leading-none select-none transition-transform group-hover:scale-110">
              🛍️
            </span>
            <span className="text-xs font-medium text-stone-700 text-center leading-tight line-clamp-1">
              Todos
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
                className={`${tileBase} ${active ? tileActive : tileIdle}`}
              >
                {cat.imageUrl ? (
                  <span className="w-12 h-12 rounded-full overflow-hidden ring-1 ring-[#DCE3EC] flex items-center justify-center bg-stone-100">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={cat.imageUrl}
                      alt=""
                      className="h-full w-full object-cover object-center transition-transform group-hover:scale-110"
                    />
                  </span>
                ) : (
                  <span className="text-3xl leading-none select-none transition-transform group-hover:scale-110">
                    {categoryEmoji(cat.label)}
                  </span>
                )}
                <span className="text-xs font-medium text-stone-700 text-center leading-tight line-clamp-1">
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
  products: rawProducts,
  paymentEnabled = false,
}: {
  store: StoreInfo;
  storefront: StorefrontSettings;
  products: CatalogProduct[];
  paymentEnabled?: boolean;
}) {
  // Sem controle de estoque: a loja nunca mostra "Esgotado" nem limita a
  // quantidade. Normalizamos aqui (estoque "infinito", sem estoque por variação)
  // para que toda a tela — cards, detalhe, carrinho — trate os produtos como
  // sempre disponíveis, sem espalhar a flag por dezenas de componentes.
  const products = useMemo(() => {
    if (storefront.stockControlEnabled) return rawProducts;
    return rawProducts.map((p) => ({
      ...p,
      stock: 999999,
      variantStock: [],
    }));
  }, [rawProducts, storefront.stockControlEnabled]);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [cartOpen, setCartOpen] = useState(false);
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState("");
  const [notes, setNotes] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [shippingMode, setShippingMode] = useState<ShippingModeId | null>(null);
  const [address, setAddress] = useState({
    cep: "",
    street: "",
    number: "",
    district: "",
    city: "",
    state: "",
    complement: "",
  });
  const [excursionName, setExcursionName] = useState("");
  const [carrierName, setCarrierName] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodId | null>(null);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("new");
  const [selectedProduct, setSelectedProduct] = useState<CatalogProduct | null>(null);
  /** Filtro da faixa de categorias (null = todos) */
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  /** Filtro "🔥 Promoções" da barra do topo (só produtos em promoção). */
  const [promoOnly, setPromoOnly] = useState(false);

  /** Registra uma visita ao abrir a loja (uma vez por carregamento). */
  const visitPinged = useRef(false);
  useEffect(() => {
    if (visitPinged.current || !store.slug) return;
    visitPinged.current = true;
    fetch("/api/loja/visit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug: store.slug }),
      keepalive: true,
    }).catch(() => {
      /* contar visita nunca pode atrapalhar a loja */
    });
  }, [store.slug]);

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
    if (promoOnly) list = list.filter((p) => p.isPromotion);
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.description?.toLowerCase().includes(q) ?? false) ||
        (p.category?.toLowerCase().includes(q) ?? false) ||
        p.tags.some((t) => t.toLowerCase().includes(q))
    );
  }, [products, search, categoryFilter, promoOnly, storefront.categories]);

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

  /** Produtos no formato mínimo que os blocos (grade) esperam. */
  const blockProducts = useMemo<BlockProduct[]>(
    () =>
      catalogProducts.map((p) => ({
        id: p.id,
        name: p.name,
        price: p.price,
        image: p.image,
        compareAtPrice: p.compareAtPrice,
        badge: p.isPromotion ? "Promoção" : null,
      })),
    [catalogProducts]
  );

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

  // Recuperação de carrinho abandonado: assim que o cliente tem itens + nome +
  // telefone válido, salvamos (com debounce) um rascunho no servidor. Se ele não
  // finalizar, a IA cutuca depois pelo WhatsApp. O endpoint só grava se a loja
  // ativou o recurso; aqui é fire-and-forget e nunca atrapalha o checkout.
  const lastCartDraftRef = useRef("");
  useEffect(() => {
    const name = customerName.trim();
    if (items.length === 0 || name.length < 2 || !isCustomerPhoneValid(customerPhone)) {
      return;
    }
    const payload = {
      slug: store.slug,
      name,
      phone: customerPhone.trim(),
      items: items.map((i) => ({
        name: i.name,
        quantity: i.quantity,
        price: i.price,
      })),
    };
    const signature = JSON.stringify(payload);
    if (signature === lastCartDraftRef.current) return; // nada mudou
    const timer = setTimeout(() => {
      lastCartDraftRef.current = signature;
      fetch("/api/loja/abandoned-cart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: signature,
        keepalive: true,
      }).catch(() => {});
    }, 2500);
    return () => clearTimeout(timer);
  }, [items, customerName, customerPhone, store.slug]);

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
      // Respeita fardo (múltiplos) e quantidade mínima; 0 = remover a linha.
      const nextQty = snapQuantity(p.sale, qty, maxAllowed);
      if (nextQty <= 0) {
        const n = { ...c };
        delete n[cartKey];
        return n;
      }
      return { ...c, [cartKey]: nextQty };
    });
  }

  /** Excursão, Correios e Transportadora pedem o endereço do cliente; Retirada mostra o da loja. */
  const needsAddress =
    shippingMode === "excursao" ||
    shippingMode === "correios" ||
    shippingMode === "transportadora";
  const pickupAddress = storefront.pickupAddress.trim();
  const pickupInstructions = storefront.pickupInstructions.trim();

  // Correios e Transportadora precisam de CEP válido (8 dígitos); excursão não exige.
  const cepRequired =
    shippingMode === "correios" || shippingMode === "transportadora";
  const cepValid = address.cep.replace(/\D/g, "").length === 8;

  const addressComplete =
    address.street.trim().length > 1 &&
    address.number.trim().length > 0 &&
    address.district.trim().length > 0 &&
    address.city.trim().length > 1 &&
    address.state.trim().length >= 2 &&
    (!cepRequired || cepValid);

  // Excursão exige o nome da excursão.
  const excursionComplete =
    shippingMode !== "excursao" || excursionName.trim().length > 0;
  // Transportadora exige o nome da transportadora.
  const carrierComplete =
    shippingMode !== "transportadora" || carrierName.trim().length > 0;

  // Mercado Pago só entra se o gateway está conectado E a loja ativou no painel.
  const mpAvailable = paymentEnabled && storefront.checkoutMercadoPagoEnabled;
  // Formas de pagamento que a loja habilitou para aparecer no checkout.
  const enabledPayMethods = useMemo<PaymentMethodId[]>(() => {
    const list: PaymentMethodId[] = [];
    if (storefront.checkoutPixEnabled && storefront.pixKey.trim())
      list.push("pix");
    if (storefront.checkoutCashEnabled) list.push("dinheiro");
    if (storefront.checkoutCardEnabled) list.push("cartao");
    if (mpAvailable) list.push("mercadopago");
    return list;
  }, [
    storefront.checkoutPixEnabled,
    storefront.checkoutCashEnabled,
    storefront.checkoutCardEnabled,
    storefront.pixKey,
    mpAvailable,
  ]);
  const paymentComplete =
    enabledPayMethods.length === 0 ||
    (paymentMethod != null && enabledPayMethods.includes(paymentMethod));

  // Condição única para liberar o envio/pagamento do pedido.
  const checkoutReady =
    customerName.trim().length >= 2 &&
    isCustomerPhoneValid(customerPhone) &&
    !!shippingMode &&
    (!needsAddress || addressComplete) &&
    excursionComplete &&
    carrierComplete &&
    paymentComplete;

  function setAddressField(field: keyof typeof address, value: string) {
    setAddress((a) => ({ ...a, [field]: value }));
  }

  function formatCustomerAddress(): string {
    const a = address;
    const parts: string[] = [];
    const line1 = [a.street.trim(), a.number.trim()].filter(Boolean).join(", ");
    if (line1) parts.push(line1);
    if (a.complement.trim()) parts.push(a.complement.trim());
    if (a.district.trim()) parts.push(a.district.trim());
    const cityUf = [a.city.trim(), a.state.trim()].filter(Boolean).join("/");
    if (cityUf) parts.push(cityUf);
    if (a.cep.trim()) parts.push(`CEP ${a.cep.trim()}`);
    return parts.join(" — ");
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
      `*Cliente:* ${titleCasePtBr(customerName) || "—"}`,
      `*Telefone / WhatsApp:* ${customerPhone.trim() || "—"}`,
    );
    if (shippingMode) {
      const lab = shippingModeLabel(shippingMode);
      if (lab) lines.push(`*Forma de envio:* ${lab}`);
    }
    if (shippingMode === "excursao" && excursionName.trim()) {
      lines.push(`*Excursão:* ${excursionName.trim()}`);
    }
    if (shippingMode === "transportadora" && carrierName.trim()) {
      lines.push(`*Transportadora:* ${carrierName.trim()}`);
    }
    if (needsAddress) {
      const addr = formatCustomerAddress();
      if (addr) lines.push(`*Endereço de entrega:* ${addr}`);
    } else if (shippingMode === "retirada") {
      if (pickupAddress) lines.push(`*Retirada em:* ${pickupAddress}`);
      if (pickupInstructions)
        lines.push(`*Como retirar:* ${pickupInstructions}`);
    }
    if (paymentMethod) {
      const payLabel = paymentMethodLabel(paymentMethod);
      if (payLabel) lines.push(`*Forma de pagamento:* ${payLabel}`);
    }
    const money = (v: number) =>
      v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    const itemLines = items.map((i) => {
      const ref = i.productReference?.trim();
      const displayName = titleCasePtBr(i.name);
      const namePart = ref ? `${displayName} (Ref. ${ref})` : displayName;
      const seg: string[] = [`${i.quantity}x ${namePart}`];
      if (i.color) seg.push(i.color);
      if (i.size) seg.push(`Tam. ${i.size}`);
      if (i.sale.saleMode === "pack" && i.sale.packSize > 1) {
        seg.push(quantityLabel(i.sale, i.quantity));
      }
      seg.push(money(i.lineTotal));
      return seg.join(" — ");
    });
    lines.push(
      "",
      "*Itens do pedido:*",
      "",
      itemLines.join("\n\n"),
      "",
      `*Total parcial: ${money(subtotal)}*`
    );
    if (notes.trim()) {
      lines.push("", `Obs: ${notes.trim()}`);
    }
    // A chave Pix só entra quando o cliente escolheu Pix (ou quando a loja não
    // configurou um seletor de pagamento — mantém o comportamento anterior).
    const pixSelected =
      enabledPayMethods.length === 0 || paymentMethod === "pix";
    const pixKey = storefront.pixKey.trim();
    if (pixKey && pixSelected) {
      lines.push("", "*Pagamento via Pix:*", `Chave: ${pixKey}`);
      const pixName = storefront.pixName.trim();
      if (pixName) lines.push(`Titular: ${pixName}`);
      lines.push("Faça o Pix e envie o comprovante aqui, por favor. 🙏");
    }
    return lines.join("\n");
  }

  /** WhatsApp da loja válido para montar o link do pedido (mensagem é montada no clique, com código). */
  const orderWhatsAppReady = useMemo(
    () => whatsAppLink(store.phone, ".") !== null,
    [store.phone]
  );

  /** Devolve o pedido gravado no painel (número + id), para o WhatsApp e o pagamento online. */
  async function persistOrderSnapshot(): Promise<{
    orderNumber: number | null;
    orderId: string | null;
  }> {
    const empty = { orderNumber: null, orderId: null };
    if (items.length === 0 || !store.slug) return empty;
    const name = customerName.trim();
    if (name.length < 2) return empty;
    if (!isCustomerPhoneValid(customerPhone)) return empty;
    if (!shippingMode) return empty;
    if (needsAddress && !addressComplete) return empty;
    if (!excursionComplete) return empty;
    if (!carrierComplete) return empty;
    if (!paymentComplete) return empty;
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeSlug: store.slug,
          customerName: name,
          customerPhone: customerPhone.trim(),
          shippingMode,
          excursionName:
            shippingMode === "excursao" ? excursionName.trim() : "",
          carrierName:
            shippingMode === "transportadora" ? carrierName.trim() : "",
          paymentMethod: paymentMethod ?? "",
          customerAddress: needsAddress ? formatCustomerAddress() : "",
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
        id?: string;
        orderNumber?: number;
        error?: string;
      };
      if (!res.ok) {
        console.warn(
          "[VendeWhat] Pedido não salvo no painel:",
          j?.error ?? res.status
        );
        return empty;
      }
      return {
        orderNumber:
          typeof j.orderNumber === "number" && Number.isFinite(j.orderNumber)
            ? j.orderNumber
            : null,
        orderId: typeof j.id === "string" ? j.id : null,
      };
    } catch (e) {
      console.warn("[VendeWhat] Pedido não salvo no painel:", e);
      return empty;
    }
  }

  /** Cria o checkout do Mercado Pago para o pedido e redireciona o cliente. */
  async function handlePayOnline() {
    setPayError("");
    setPaying(true);
    try {
      const snap = await persistOrderSnapshot();
      if (!snap.orderId) {
        setPayError("Não foi possível registrar o pedido. Confira os dados.");
        return;
      }
      const res = await fetch("/api/pay/preference", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: snap.orderId }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        initPoint?: string;
        error?: string;
      };
      if (!res.ok || !j.ok || !j.initPoint) {
        setPayError(j.error ?? "Não foi possível iniciar o pagamento.");
        return;
      }
      window.location.assign(j.initPoint);
    } catch {
      setPayError("Falha de rede ao iniciar o pagamento.");
    } finally {
      setPaying(false);
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

  function goToStoreHome() {
    setSelectedProduct(null);
    setCategoryFilter(null);
    setSearch("");
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  const themeStyle = {
    "--store-primary": storefront.themePrimary,
    "--store-secondary": storefront.themeSecondary,
    backgroundColor: storefront.pageBackground,
  } as React.CSSProperties;

  // Barra de categorias = cor do topo, porém MAIS CLARA (ex.: topo escuro →
  // barra um tom acima). Texto claro/escuro conforme o brilho do fundo.
  const headerRgb = parseHexRgb(storefront.headerBackground);
  const categoryBarBg = headerRgb ? lightenRgb(headerRgb, 0.12) : undefined;
  const categoryBarDark = headerRgb ? isDarkRgb(headerRgb) : true;
  const headerDark = headerRgb ? isDarkRgb(headerRgb) : true;

  return (
    <div
      className="min-h-screen pb-28 md:pb-8 text-stone-800"
      style={themeStyle}
    >
      {/* Barra de avisos preta no topo (frete grátis, parcelamento, troca…) */}
      {storefront.announcementBarEnabled && storefront.announcements.length > 0 && (
        <AnnouncementBar
          items={storefront.announcements}
          bg={storefront.announcementBarBg}
        />
      )}

      {/* Topo — cabeçalho estilo e-commerce (logo, busca, ações) */}
      <header
        className="z-40 shadow-lg md:sticky md:top-0"
        style={{ backgroundColor: storefront.headerBackground }}
      >
        <div className="max-w-[1260px] mx-auto px-4 py-3 md:py-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-6">
            {/* Logo + ações compactas (mobile) */}
            <div className="flex items-center justify-between gap-2 lg:justify-start lg:shrink-0">
              <button
                type="button"
                onClick={goToStoreHome}
                className={`flex items-center gap-3 min-w-0 text-left rounded-lg -m-1 p-1 transition-colors ${
                  headerDark ? "hover:bg-white/5" : "hover:bg-stone-500/5"
                }`}
                aria-label="Ir para a página inicial da loja"
              >
                {store.logo ? (
                  <div className="relative w-10 h-10 md:w-11 md:h-11 rounded-xl overflow-hidden flex-shrink-0 ring-1 ring-white/10">
                    <Image
                      src={store.logo}
                      alt=""
                      fill
                      className="object-cover"
                      sizes="44px"
                    />
                  </div>
                ) : (
                  <div
                    className="w-10 h-10 md:w-11 md:h-11 rounded-xl flex items-center justify-center text-lg flex-shrink-0"
                    style={{
                      backgroundColor: headerDark
                        ? "#253745"
                        : "var(--store-secondary)",
                      color: "#FFDA6C",
                    }}
                  >
                    ✦
                  </div>
                )}
                <div className="min-w-0">
                  <p
                    className={`text-lg md:text-xl font-bold tracking-tight truncate ${
                      headerDark ? "text-white" : "text-stone-900"
                    }`}
                  >
                    {store.name}
                  </p>
                  {storefront.headerTagline && (
                    <p
                      className={`text-[10px] font-medium uppercase tracking-[0.22em] ${
                        headerDark ? "text-white/55" : "text-stone-500"
                      }`}
                    >
                      {storefront.headerTagline}
                    </p>
                  )}
                </div>
              </button>
              {/* Ações compactas (mobile/tablet) */}
              <nav
                className="flex lg:hidden items-center gap-1 shrink-0"
                aria-label="Atalhos da loja"
              >
                <button
                  type="button"
                  className={`p-2 rounded-lg transition-colors shrink-0 ${
                    headerDark
                      ? "text-white/90 hover:bg-white/10"
                      : "text-stone-700 hover:bg-stone-100"
                  }`}
                  aria-label="Favoritos"
                >
                  <IconHeart className="w-5 h-5" />
                </button>
                <button
                  type="button"
                  onClick={() => setCartOpen(true)}
                  className={`relative p-2 rounded-lg transition-colors shrink-0 ${
                    headerDark
                      ? "text-white/90 hover:bg-white/10"
                      : "text-stone-700 hover:bg-stone-100"
                  }`}
                  aria-label="Sacola"
                >
                  <IconBag className="w-5 h-5" />
                  {totalItems > 0 && (
                    <span
                      className="absolute -top-0.5 -right-0.5 text-white text-[10px] font-bold min-w-[1.05rem] h-4 px-1 rounded-full flex items-center justify-center"
                      style={{ backgroundColor: EC.accent }}
                    >
                      {totalItems > 99 ? "99+" : totalItems}
                    </span>
                  )}
                </button>
                {contactHref && (
                  <a
                    href={contactHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-0.5 inline-flex items-center gap-1 bg-whatsapp text-white text-xs font-semibold px-2.5 py-2 rounded-full hover:bg-whatsapp-dark transition-colors shadow-sm shrink-0 whitespace-nowrap"
                  >
                    <WhatsAppGlyph className="w-3.5 h-3.5 shrink-0" />
                    <span className="hidden min-[380px]:inline">WhatsApp</span>
                  </a>
                )}
              </nav>
            </div>

            {/* Busca (pílula branca + botão laranja "Buscar") */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                scrollToCatalogo();
              }}
              className="w-full flex-1 min-w-0 lg:max-w-2xl lg:mx-auto"
            >
              <div className="flex items-stretch rounded-full overflow-hidden bg-white border-2 border-transparent focus-within:border-[#FFDA6C] shadow-sm">
                <input
                  id="loja-busca"
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={storefront.searchPlaceholder}
                  className="flex-1 min-w-0 pl-4 pr-2 py-2.5 text-sm text-stone-800 placeholder:text-stone-400 bg-transparent outline-none scroll-mt-32"
                  aria-label="Buscar produtos"
                />
                <button
                  type="submit"
                  className="flex items-center gap-1.5 px-4 sm:px-5 text-white text-sm font-semibold hover:brightness-95 transition"
                  style={{ backgroundColor: EC.accent }}
                >
                  <IconSearch className="w-4 h-4" />
                  <span className="hidden sm:inline">Buscar</span>
                </button>
              </div>
            </form>

            {/* Ações (desktop): Entrar · Favoritos · Sacola · WhatsApp */}
            <nav
              className="hidden lg:flex items-center gap-1 shrink-0"
              aria-label="Atalhos da loja"
            >
              <HeaderAction
                icon={<IconUser className="w-5 h-5" />}
                label="Entrar"
                dark={headerDark}
              />
              <HeaderAction
                icon={<IconHeart className="w-5 h-5" />}
                label="Favoritos"
                dark={headerDark}
              />
              <HeaderAction
                icon={<IconBag className="w-5 h-5" />}
                label="Sacola"
                dark={headerDark}
                onClick={() => setCartOpen(true)}
                badge={totalItems}
              />
              {storefront.instagramUrl && (
                <a
                  href={storefront.instagramUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`p-2.5 rounded-lg transition-colors shrink-0 flex items-center justify-center ${
                    headerDark
                      ? "text-white/90 hover:bg-white/10"
                      : "text-stone-700 hover:bg-stone-100"
                  }`}
                  aria-label="Instagram da loja"
                  title="Instagram"
                >
                  <InstagramIcon className="w-5 h-5" />
                </a>
              )}
              {contactHref && (
                <a
                  href={contactHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-1 inline-flex items-center gap-1.5 bg-whatsapp text-white text-sm font-semibold px-4 py-2.5 rounded-full hover:bg-whatsapp-dark transition-colors shadow-sm whitespace-nowrap shrink-0"
                >
                  <WhatsAppGlyph className="w-4 h-4 shrink-0" />
                  WhatsApp
                </a>
              )}
            </nav>
          </div>

          {/* Frases abaixo do logo (opcional, se o lojista configurar) */}
          {storefront.infoBullets.length > 0 && (
            <ul
              className={`mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs ${
                headerDark ? "text-white/70" : "text-stone-600"
              }`}
            >
              {storefront.infoBullets.map((line, i) => (
                <li key={i} className="flex gap-1.5 items-center">
                  <span className="font-bold" style={{ color: "#FFDA6C" }}>
                    •
                  </span>
                  <span className="leading-snug">{line}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </header>

      {/* Menu de categorias no topo (abaixo do cabeçalho). */}
      {storefront.showCategoryNav && categoryStripItems.length > 0 && (
        <CategoryNavBar
          items={categoryStripItems}
          selectedLabel={categoryFilter}
          onSelect={(label) => {
            setCategoryFilter(label);
            setPromoOnly(false);
          }}
          barBg={categoryBarBg}
          barDark={categoryBarDark}
          promoActive={promoOnly}
          onSelectPromo={() => {
            setPromoOnly((v) => !v);
            setCategoryFilter(null);
            scrollToCatalogo();
          }}
        />
      )}

      {/* Banner: um carrossel só; cada foto tem seu formato E seu texto.
          Texto vazio na foto → usa o texto geral (fallback). A página toda tem o
          fundo cinza (pageBackground), que separa os cards brancos. */}
      {storefront.heroSlides.length > 0 && (
        <HeroBannerBlock
          slides={storefront.heroSlides}
          themePrimary={storefront.themePrimary}
          fallback={{
            badge: storefront.heroSubtitle,
            title: heroDisplayTitle,
            subtitle: store.description ?? "",
            couponCode: storefront.heroCouponCode,
            ctaLabel: storefront.heroCtaLabel,
            ctaHref: storefront.heroCtaHref,
          }}
          onCta={handleHeroCta}
        />
      )}

      {/* Cards promocionais coloridos — FORA do banner, faixa própria abaixo, na
          mesma largura. 3 colunas em TODAS as telas (igual à referência). */}
      {storefront.promoCards.length > 0 && (
        <section className="max-w-[1260px] mx-auto w-full px-4 mt-4">
          <div className="grid grid-cols-3 gap-2 sm:gap-4">
            {storefront.promoCards.map((c, i) => (
              <BlurFade key={i} delay={i * 0.08} yOffset={20} className="h-full">
              <a
                href={c.href || "#catalogo"}
                onClick={(e) => handleHeroCta(e, c.href || "#catalogo")}
                className="group relative flex h-full flex-col justify-end p-3 sm:p-5 rounded-2xl overflow-hidden min-h-[90px] sm:min-h-[110px] transition-all duration-300 hover:shadow-lg hover:-translate-y-1"
                style={{
                  backgroundImage: `linear-gradient(135deg, ${c.from}, ${c.to})`,
                }}
              >
                <BorderBeam
                  colorFrom="#ffffff"
                  colorTo="rgba(255,255,255,0.25)"
                  duration={8}
                />
                {/* brilho radial no canto superior */}
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(255,255,255,0.15)_0%,transparent_50%)]" />
                <div className="relative z-10">
                  {c.eyebrow && (
                    <p className="text-[0.55rem] sm:text-[0.65rem] font-bold uppercase tracking-widest text-white/75 mb-0.5">
                      {c.eyebrow}
                    </p>
                  )}
                  <h3 className="text-xs sm:text-base font-bold text-white leading-snug">
                    {c.title}
                    {c.subtitle && (
                      <>
                        <br />
                        <span className="text-white/90 font-medium text-[0.65rem] sm:text-sm">
                          {c.subtitle}
                        </span>
                      </>
                    )}
                  </h3>
                  {c.ctaLabel && (
                    <span className="text-[0.6rem] sm:text-xs text-white/70 mt-1 flex items-center gap-1 group-hover:gap-2 transition-all">
                      {c.ctaLabel} <span aria-hidden>→</span>
                    </span>
                  )}
                </div>
              </a>
              </BlurFade>
            ))}
          </div>
        </section>
      )}

      {categoryStripItems.length > 0 && (
        <BlurFade inView delay={0.1} className="w-full">
        <StorefrontCategoriesStrip
          items={categoryStripItems}
          selectedLabel={categoryFilter}
          onSelectCategory={(label) => {
            setCategoryFilter(label);
            setPromoOnly(false);
          }}
        />
        </BlurFade>
      )}

      <main className="max-w-[1260px] mx-auto px-4">
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
                <div className="mb-4 flex flex-wrap items-center gap-4">
                  <h3
                    className="flex items-center gap-2 text-xl font-bold tracking-tight"
                    style={{ color: EC.foreground }}
                  >
                    <span aria-hidden style={{ color: EC.accent }}>
                      ⚡
                    </span>{" "}
                    <AnimatedGradientText
                      colorFrom={EC.accent}
                      colorMid={EC.primary}
                      colorTo={EC.accent}
                      speed={5}
                    >
                      Ofertas Relâmpago
                    </AnimatedGradientText>
                  </h3>
                  {storefront.flashSaleEndsAt && (
                    <FlashSaleCountdown endsAt={storefront.flashSaleEndsAt} />
                  )}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  {promoProducts.map((product, i) => (
                    <ProductCatalogCard
                      key={product.id}
                      product={product}
                      imageRatio={product.cardRatio ?? storefront.productCardRatio}
                      installmentsMax={storefront.cardInstallmentsMax}
                      freeShippingLabel={storefront.cardFreeShipping}
                      showRatings={storefront.cardShowRatings}
                      revealDelayMs={Math.min(i, 8) * 50}
                      featured={i === 0}
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
                <div className="mb-4 md:mb-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <h3
                    className="flex flex-1 items-center gap-3 text-xl font-bold tracking-tight after:h-px after:flex-1 after:bg-[#DCE3EC] after:content-['']"
                    style={{ color: EC.foreground }}
                  >
                    <AnimatedGradientText
                      colorFrom={EC.foreground}
                      colorMid={EC.primary}
                      colorTo={EC.foreground}
                      speed={6}
                    >
                      Mais Produtos
                    </AnimatedGradientText>
                  </h3>
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
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                  {catalogSorted.map((product, i) => (
                    <ProductCatalogCard
                      key={product.id}
                      product={product}
                      imageRatio={product.cardRatio ?? storefront.productCardRatio}
                      installmentsMax={storefront.cardInstallmentsMax}
                      freeShippingLabel={storefront.cardFreeShipping}
                      showRatings={storefront.cardShowRatings}
                      revealDelayMs={Math.min(i % 5, 4) * 50}
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

      {/* Blocos de conteúdo do builder (Destaques etc.), abaixo do catálogo.
          Cada bloco revela com blur-fade ao rolar (padrão do projeto de referência). */}
      {storefront.contentBlocks.map((block, i) => (
        <BlurFade key={block.id} inView delay={i * 0.05}>
          <BlockRenderer block={block} products={blockProducts} />
        </BlurFade>
      ))}

      <footer className="bg-stone-100/90 border-t border-stone-200/80 mt-4">
        <div className="max-w-[1260px] mx-auto px-4 py-10 md:py-12 grid grid-cols-1 sm:grid-cols-3 gap-8 text-sm">
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

      {/* Barra de navegação no rodapé (celular) — Início · Conta · Carrinho · Menu */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-40 grid grid-cols-4 border-t border-stone-200 bg-white/98 backdrop-blur shadow-[0_-6px_24px_rgba(0,0,0,0.08)] md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        aria-label="Navegação da loja"
      >
        <button
          type="button"
          onClick={goToStoreHome}
          className="flex flex-col items-center justify-center gap-1 py-2.5 text-stone-600 active:bg-stone-100"
        >
          <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M4 10.5 12 4l8 6.5" />
            <path d="M6 9.5V20h4v-5h4v5h4V9.5" />
          </svg>
          <span className="text-[10px] font-medium">Início</span>
        </button>

        {contactHref ? (
          <a
            href={contactHref}
            target="_blank"
            rel="noopener noreferrer"
            className="flex flex-col items-center justify-center gap-1 py-2.5 text-stone-600 active:bg-stone-100"
          >
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <circle cx="12" cy="8" r="3.4" />
              <path d="M5.5 20a6.5 6.5 0 0 1 13 0" />
            </svg>
            <span className="text-[10px] font-medium">Conta</span>
          </a>
        ) : (
          <button
            type="button"
            onClick={goToStoreHome}
            className="flex flex-col items-center justify-center gap-1 py-2.5 text-stone-600 active:bg-stone-100"
          >
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <circle cx="12" cy="8" r="3.4" />
              <path d="M5.5 20a6.5 6.5 0 0 1 13 0" />
            </svg>
            <span className="text-[10px] font-medium">Conta</span>
          </button>
        )}

        <button
          type="button"
          onClick={() => setCartOpen(true)}
          className="flex flex-col items-center justify-center gap-1 py-2.5 text-stone-600 active:bg-stone-100"
        >
          <span className="relative">
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M6.5 8h11l-1 11.5a1 1 0 0 1-1 .9h-7a1 1 0 0 1-1-.9L6.5 8Z" />
              <path d="M9.2 8V7a2.8 2.8 0 0 1 5.6 0v1" />
            </svg>
            {totalItems > 0 && (
              <span
                className="absolute -top-1.5 -right-2 flex h-[1.05rem] min-w-[1.05rem] items-center justify-center rounded-full px-1 text-[10px] font-bold text-white"
                style={{ backgroundColor: "var(--store-primary)" }}
              >
                {totalItems}
              </span>
            )}
          </span>
          <span className="text-[10px] font-medium">Carrinho</span>
        </button>

        <button
          type="button"
          onClick={() =>
            document
              .getElementById("catalogo")
              ?.scrollIntoView({ behavior: "smooth", block: "start" })
          }
          className="flex flex-col items-center justify-center gap-1 py-2.5 text-stone-600 active:bg-stone-100"
        >
          <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
          <span className="text-[10px] font-medium">Menu</span>
        </button>
      </nav>

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
                          style={coverImageStyleAt(
                            0,
                            i.imageObjectPositions,
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
                        {i.sale.saleMode === "pack" && i.sale.packSize > 1
                          ? ` (${quantityLabel(i.sale, i.quantity).replace(
                              /^\d+ un\. /,
                              ""
                            )})`
                          : ""}
                      </p>
                      <div className="flex items-center gap-2 mt-2">
                        <button
                          type="button"
                          onClick={() =>
                            setQty(
                              i.cartKey,
                              i.quantity - quantityStep(i.sale)
                            )
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
                            setQty(
                              i.cartKey,
                              i.quantity + quantityStep(i.sale)
                            )
                          }
                          disabled={
                            i.quantity + quantityStep(i.sale) >
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
                    {shippingMode === "excursao" && (
                      <div className="space-y-1.5 min-w-0">
                        <label className="text-sm font-medium text-boutique-wine">
                          Nome da excursão <span className="text-red-600">*</span>
                        </label>
                        <input
                          type="text"
                          value={excursionName}
                          onChange={(e) => setExcursionName(e.target.value)}
                          placeholder="Ex.: Excursão da Dona Maria"
                          maxLength={120}
                          className="w-full px-3 py-2 rounded-lg border border-stone-200 text-sm focus:ring-2 focus:ring-boutique focus:border-boutique-dark outline-none"
                        />
                      </div>
                    )}
                    {shippingMode === "transportadora" && (
                      <div className="space-y-1.5 min-w-0">
                        <label className="text-sm font-medium text-boutique-wine">
                          Nome da transportadora{" "}
                          <span className="text-red-600">*</span>
                        </label>
                        <input
                          type="text"
                          value={carrierName}
                          onChange={(e) => setCarrierName(e.target.value)}
                          placeholder="Ex.: Jadlog, Braspress, Correios…"
                          maxLength={120}
                          className="w-full px-3 py-2 rounded-lg border border-stone-200 text-sm focus:ring-2 focus:ring-boutique focus:border-boutique-dark outline-none"
                        />
                      </div>
                    )}
                    {needsAddress && (
                      <div className="space-y-2 min-w-0">
                        <p className="text-sm font-medium text-boutique-wine">
                          Endereço de entrega <span className="text-red-600">*</span>
                        </p>
                        <p className="text-xs text-stone-500 -mt-1">
                          Onde você quer receber o pedido.
                        </p>
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            type="text"
                            inputMode="numeric"
                            autoComplete="postal-code"
                            value={address.cep}
                            onChange={(e) => setAddressField("cep", e.target.value)}
                            placeholder={cepRequired ? "CEP *" : "CEP"}
                            aria-invalid={
                              cepRequired && address.cep.trim().length > 0 && !cepValid
                            }
                            className={`w-full px-3 py-2 rounded-lg border text-sm focus:ring-2 focus:ring-boutique focus:border-boutique-dark outline-none ${
                              cepRequired && address.cep.trim().length > 0 && !cepValid
                                ? "border-red-400"
                                : "border-stone-200"
                            }`}
                          />
                          <input
                            type="text"
                            inputMode="numeric"
                            value={address.number}
                            onChange={(e) => setAddressField("number", e.target.value)}
                            placeholder="Número"
                            className="w-full px-3 py-2 rounded-lg border border-stone-200 text-sm focus:ring-2 focus:ring-boutique focus:border-boutique-dark outline-none"
                          />
                          <input
                            type="text"
                            autoComplete="address-line1"
                            value={address.street}
                            onChange={(e) => setAddressField("street", e.target.value)}
                            placeholder="Rua / logradouro"
                            className="col-span-2 w-full px-3 py-2 rounded-lg border border-stone-200 text-sm focus:ring-2 focus:ring-boutique focus:border-boutique-dark outline-none"
                          />
                          <input
                            type="text"
                            value={address.district}
                            onChange={(e) => setAddressField("district", e.target.value)}
                            placeholder="Bairro"
                            className="w-full px-3 py-2 rounded-lg border border-stone-200 text-sm focus:ring-2 focus:ring-boutique focus:border-boutique-dark outline-none"
                          />
                          <input
                            type="text"
                            autoComplete="address-level2"
                            value={address.city}
                            onChange={(e) => setAddressField("city", e.target.value)}
                            placeholder="Cidade"
                            className="w-full px-3 py-2 rounded-lg border border-stone-200 text-sm focus:ring-2 focus:ring-boutique focus:border-boutique-dark outline-none"
                          />
                          <input
                            type="text"
                            autoComplete="address-level1"
                            maxLength={2}
                            value={address.state}
                            onChange={(e) =>
                              setAddressField("state", e.target.value.toUpperCase())
                            }
                            placeholder="UF"
                            className="w-full px-3 py-2 rounded-lg border border-stone-200 text-sm uppercase focus:ring-2 focus:ring-boutique focus:border-boutique-dark outline-none"
                          />
                          <input
                            type="text"
                            value={address.complement}
                            onChange={(e) =>
                              setAddressField("complement", e.target.value)
                            }
                            placeholder="Complemento (opcional)"
                            className="w-full px-3 py-2 rounded-lg border border-stone-200 text-sm focus:ring-2 focus:ring-boutique focus:border-boutique-dark outline-none"
                          />
                        </div>
                      </div>
                    )}
                    {shippingMode === "retirada" && (
                      <div className="rounded-xl border border-boutique-muted/60 bg-boutique-light/50 px-3 py-3 text-sm min-w-0">
                        <p className="font-medium text-boutique-wine mb-1">
                          Endereço para retirada
                        </p>
                        {pickupAddress ? (
                          <p className="text-stone-700 whitespace-pre-line break-words">
                            {pickupAddress}
                          </p>
                        ) : (
                          <p className="text-stone-500">
                            A loja vai combinar o local de retirada pelo WhatsApp.
                          </p>
                        )}
                        {pickupInstructions && (
                          <>
                            <p className="font-medium text-boutique-wine mt-2 mb-1">
                              Como retirar
                            </p>
                            <p className="text-stone-700 whitespace-pre-line break-words">
                              {pickupInstructions}
                            </p>
                          </>
                        )}
                      </div>
                    )}
                    {enabledPayMethods.length > 0 && (
                      <fieldset className="space-y-2 min-w-0">
                        <legend className="text-sm font-medium text-boutique-wine">
                          Forma de pagamento{" "}
                          <span className="text-red-600">*</span>
                        </legend>
                        <div className="flex flex-col gap-2">
                          {PAYMENT_METHODS.filter((m) =>
                            enabledPayMethods.includes(m.id)
                          ).map((m) => {
                            const sel = paymentMethod === m.id;
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
                                  name="vw-payment-method"
                                  value={m.id}
                                  checked={sel}
                                  onChange={() => setPaymentMethod(m.id)}
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
                    )}
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
                <ShimmerButton
                  onClick={async () => {
                    const snap = await persistOrderSnapshot();
                    const href = whatsAppLink(
                      store.phone,
                      buildOrderMessage(snap.orderNumber)
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
                  disabled={!checkoutReady}
                  background="radial-gradient(ellipse 80% 50% at 50% 120%, #25D366, #128C7E)"
                  hoverBackground="radial-gradient(ellipse 80% 50% at 50% 120%, #2EE06F, #25D366)"
                  shimmerColor="#ffffff"
                  borderRadius="0.75rem"
                  className="w-full py-3.5 text-base disabled:opacity-45 disabled:pointer-events-none"
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                  </svg>
                  Enviar pedido no WhatsApp
                </ShimmerButton>
                {mpAvailable &&
                  (enabledPayMethods.length === 0 ||
                    paymentMethod === "mercadopago") && (
                  <button
                    type="button"
                    onClick={handlePayOnline}
                    disabled={paying || !checkoutReady}
                    className="mt-3 flex items-center justify-center gap-2 w-full py-3.5 rounded-xl bg-[#009ee3] text-white font-semibold hover:bg-[#0089c7] transition-colors disabled:opacity-45 disabled:pointer-events-none"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
                      <rect x="2.5" y="5" width="19" height="14" rx="2.25" />
                      <path d="M2.5 9.5h19" strokeLinecap="round" />
                    </svg>
                    {paying ? "Abrindo pagamento…" : "Pagar com Mercado Pago"}
                  </button>
                )}
                {payError && (
                  <p className="text-xs text-rose-600 text-center mt-2">{payError}</p>
                )}
                <p className="text-xs text-slate-400 text-center mt-2">
                  Registramos no painel com código do pedido e abrimos o WhatsApp com a
                  mesma mensagem
                </p>
                {!checkoutReady ? (
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
                    ) : !shippingMode ? (
                      <>
                        Selecione a <strong>forma de envio</strong> (excursão,
                        Correios, transportadora ou retirada).
                      </>
                    ) : !excursionComplete ? (
                      <>
                        Informe o <strong>nome da excursão</strong>.
                      </>
                    ) : !carrierComplete ? (
                      <>
                        Informe o <strong>nome da transportadora</strong>.
                      </>
                    ) : needsAddress && cepRequired && !cepValid ? (
                      <>
                        Informe um <strong>CEP válido</strong> (8 dígitos) e o
                        endereço completo.
                      </>
                    ) : needsAddress && !addressComplete ? (
                      <>
                        Informe o <strong>endereço de entrega</strong> (rua, número,
                        bairro, cidade e UF).
                      </>
                    ) : (
                      <>
                        Escolha a <strong>forma de pagamento</strong>.
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

      <CookieConsent />
    </div>
  );
}
