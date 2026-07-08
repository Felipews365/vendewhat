"use client";

/**
 * Página dedicada de edição do BANNER (carrossel) — substitui o modal.
 * Cada banner (slide) tem seu próprio formato E seu próprio texto; há também um
 * "texto geral" usado quando o slide não tem texto próprio. Salva no JSONB
 * `stores.storefront` (heroSlides + textos gerais), sem migration.
 */
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import {
  DEFAULT_STOREFRONT,
  bannerPhotoLimitForPlan,
  heroCropRatioForLayout,
  heroTemplatePhotoCount,
  MAX_PROMO_CARDS,
  PROMO_CARD_COLORS,
  PROMO_CARD_PRESETS,
  type HeroLayout,
  type HeroSlide,
  type HeroSplitPhotoSide,
  type HeroTemplate,
  type PromoCard,
  type StorefrontSettings,
  storefrontFromDb,
  storefrontToDb,
} from "@/lib/storefront";
import {
  HeroTemplateSlide,
  type HeroSlideContent,
} from "@/components/storefront/HeroTemplateSlide";
import { ProductImageCropModal } from "@/components/ProductImageCropModal";
import { useToast } from "@/components/Toast";

type HeroCropSession = {
  files: File[];
  current: number;
  layout: HeroLayout;
  photoSide: HeroSplitPhotoSide;
  /** Quando setado, o recorte SUBSTITUI a foto do banner nesse índice (em vez de adicionar). */
  replaceIndex?: number;
};

/** Prévia fiel de um banner (usa as cores da loja via CSS vars do wrapper). */
function SlidePreview({
  slide,
  fallback,
  primary,
}: {
  slide: HeroSlide;
  fallback: { badge: string; title: string; ctaLabel: string; coupon: string };
  /** Cor primária da loja (para os templates). */
  primary: string;
}) {
  const badge = slide.badge?.trim() || fallback.badge;
  const title = slide.title?.trim() || fallback.title;
  const highlight = slide.highlight?.trim() || "";
  const subtitle = slide.subtitle?.trim() || "";
  const coupon = slide.couponCode?.trim() || fallback.coupon;
  const ctaLabel = slide.ctaLabel?.trim() || fallback.ctaLabel;

  // "Só a foto": prévia mostra apenas a imagem preenchendo o card.
  if (slide.noText) {
    return (
      <div className="relative h-40 w-full overflow-hidden rounded-lg bg-slate-200">
        {slide.url ? (
          <Image src={slide.url} alt="" fill className="vw-ken-burns object-cover" sizes="480px" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-2xl opacity-40">
            🖼️
          </div>
        )}
      </div>
    );
  }

  // Templates novos: prévia fiel via HeroTemplateSlide (mesmo componente da loja).
  const tpl = slide.template ?? "overlay";
  if (tpl !== "overlay" && tpl !== "split") {
    const content: HeroSlideContent = {
      badge,
      title: title || "Título do banner",
      highlight,
      subtitle,
      ctaLabel,
      ctaHref: slide.ctaHref?.trim() || "#catalogo",
    };
    return (
      <div className="relative h-44 w-full overflow-hidden rounded-lg">
        <HeroTemplateSlide
          slide={slide}
          content={content}
          primary={primary}
          onCta={(e) => e.preventDefault()}
        />
      </div>
    );
  }

  const text = (
    <div className="vw-reveal-stagger flex flex-col justify-center gap-1">
      {badge && (
        <span className="text-[9px] font-semibold uppercase tracking-widest text-white/85 line-clamp-1">
          {badge}
        </span>
      )}
      <span className="font-serif text-base font-bold leading-tight text-white line-clamp-2 drop-shadow">
        {title || "Título do banner"}
      </span>
      {highlight && (
        <span
          className="vw-anim-gradient font-script text-xl font-bold leading-none"
          style={{
            backgroundImage:
              "linear-gradient(to right, var(--store-primary), #ffffff, var(--store-primary))",
          }}
        >
          {highlight}
        </span>
      )}
      {subtitle && (
        <span className="text-[10px] text-white/85 line-clamp-2">{subtitle}</span>
      )}
      {coupon && (
        <span className="mt-0.5 inline-flex w-fit items-center gap-1 text-[9px] font-semibold uppercase tracking-wide text-white/85">
          Cód.
          <span className="rounded border border-white/30 bg-white/20 px-1.5 py-0.5">
            {coupon}
          </span>
        </span>
      )}
      {ctaLabel && (
        <span
          className="mt-1 inline-flex w-fit rounded px-2.5 py-1 text-[10px] font-bold uppercase text-white shadow"
          style={{ backgroundColor: "var(--store-primary)" }}
        >
          {ctaLabel}
        </span>
      )}
    </div>
  );

  const photo = (
    <div className="relative h-full w-full overflow-hidden bg-slate-200">
      {slide.url ? (
        <Image src={slide.url} alt="" fill className="vw-ken-burns object-cover" sizes="480px" />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-2xl opacity-40">
          🖼️
        </div>
      )}
    </div>
  );

  if (slide.layout === "split") {
    const textCol = (
      <div
        className="flex w-1/2 flex-col justify-center p-3"
        style={{ backgroundColor: "var(--store-secondary)" }}
      >
        {text}
      </div>
    );
    const photoCol = <div className="w-1/2">{photo}</div>;
    return (
      <div className="flex h-40 w-full overflow-hidden rounded-lg">
        {slide.photoSide === "left" ? (
          <>
            {photoCol}
            {textCol}
          </>
        ) : (
          <>
            {textCol}
            {photoCol}
          </>
        )}
      </div>
    );
  }

  return (
    <div className="relative h-40 w-full overflow-hidden rounded-lg">
      {photo}
      <div className="absolute inset-0 bg-gradient-to-r from-black/55 via-black/25 to-transparent" />
      <div className="absolute inset-0 flex max-w-[70%] flex-col justify-end p-3">
        {text}
      </div>
    </div>
  );
}

export default function BannerEditPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [storeId, setStoreId] = useState<string | null>(null);
  const [sf, setSf] = useState<StorefrontSettings>({ ...DEFAULT_STOREFRONT });
  const [planId, setPlanId] = useState<string | null>(null);
  const [cheapestPlanId, setCheapestPlanId] = useState<string | null>(null);
  const [heroUploading, setHeroUploading] = useState(false);
  const [heroCrop, setHeroCrop] = useState<HeroCropSession | null>(null);
  const [heroCropSrc, setHeroCropSrc] = useState<string | null>(null);
  // Formato padrão para as PRÓXIMAS fotos adicionadas.
  const [nextLayout, setNextLayout] = useState<HeroLayout>("overlay");
  const [nextSide, setNextSide] = useState<HeroSplitPhotoSide>("right");
  const bannerInputRef = useRef<HTMLInputElement>(null);
  // Trocar a foto de um banner existente (input dedicado + índice alvo).
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const replaceIndexRef = useRef<number | null>(null);
  // Banner recém-adicionado: rola até ele e destaca para o lojista configurar.
  const [highlightUrl, setHighlightUrl] = useState<string | null>(null);
  const highlightRef = useRef<HTMLDivElement | null>(null);

  const maxBannerPhotos = bannerPhotoLimitForPlan(planId, cheapestPlanId);
  const slides = sf.heroSlides;

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }
      const { data: store } = await supabase
        .from("stores")
        .select("id, storefront")
        .eq("user_id", user.id)
        .single();
      if (!store) {
        router.push("/dashboard");
        return;
      }
      setStoreId(store.id);
      setSf(storefrontFromDb(store.storefront));
      const [{ data: sub }, { data: planRows }] = await Promise.all([
        supabase
          .from("subscriptions")
          .select("plan_id")
          .eq("store_id", store.id)
          .maybeSingle(),
        supabase
          .from("plans")
          .select("id, monthly")
          .eq("active", true)
          .order("monthly", { ascending: true }),
      ]);
      setPlanId(sub && typeof sub.plan_id === "string" ? sub.plan_id : null);
      setCheapestPlanId(
        planRows && planRows.length > 0 && typeof planRows[0].id === "string"
          ? planRows[0].id
          : "essencial"
      );
      setLoading(false);
    }
    load();
  }, [router]);

  // Gera o preview (blob) da foto atual da fila de recorte.
  useEffect(() => {
    if (!heroCrop) {
      setHeroCropSrc(null);
      return;
    }
    const file = heroCrop.files[heroCrop.current];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setHeroCropSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [heroCrop]);

  // Ao adicionar um banner, rola até o card recém-criado e destaca por uns segundos
  // (senão ele fica lá no fim da lista e o lojista nem percebe que precisa configurar).
  useEffect(() => {
    if (!highlightUrl) return;
    const el = highlightRef.current;
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    const t = setTimeout(() => setHighlightUrl(null), 3000);
    return () => clearTimeout(t);
  }, [highlightUrl, slides.length]);

  function selectHeroPhotos(fileList: FileList | File[]) {
    if (!storeId) return;
    const list = Array.from(fileList).filter((f) => f.type.startsWith("image/"));
    if (!list.length) return;
    const free = maxBannerPhotos - slides.length;
    if (free <= 0) {
      showToast(`O banner aceita no máximo ${maxBannerPhotos} fotos no seu plano.`, "error");
      return;
    }
    const toAdjust = list.slice(0, free);
    if (list.length > free) showToast(`Só cabem mais ${free} foto(s).`, "error");
    setHeroCrop({ files: toAdjust, current: 0, layout: nextLayout, photoSide: nextSide });
  }

  function advanceHeroCrop() {
    setHeroCrop((prev) => {
      if (!prev) return null;
      const next = prev.current + 1;
      if (next >= prev.files.length) return null;
      return { ...prev, current: next };
    });
  }

  async function uploadOneHeroPhoto(
    file: File,
    layout: HeroLayout,
    photoSide: HeroSplitPhotoSide
  ) {
    if (!storeId) return;
    setHeroUploading(true);
    try {
      const supabase = createClient();
      const ext = file.name.split(".").pop() || "jpg";
      const fileName = `${storeId}/storefront-hero-${Date.now()}-${Math.round(
        Math.random() * 1e6
      )}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("product-images")
        .upload(fileName, file);
      if (upErr) {
        showToast("Erro ao enviar foto: " + upErr.message, "error");
        return;
      }
      const { data } = supabase.storage.from("product-images").getPublicUrl(fileName);
      setSf((s) => ({
        ...s,
        heroSlides: [...s.heroSlides, { url: data.publicUrl, layout, photoSide }].slice(
          0,
          maxBannerPhotos
        ),
      }));
      setHighlightUrl(data.publicUrl);
    } finally {
      setHeroUploading(false);
    }
  }

  async function handleHeroCropDone(file: File) {
    const layout = heroCrop?.layout ?? "overlay";
    const photoSide = heroCrop?.photoSide ?? "right";
    const replaceIndex = heroCrop?.replaceIndex;
    advanceHeroCrop();
    if (replaceIndex != null) {
      await uploadReplaceHeroPhoto(file, replaceIndex);
    } else {
      await uploadOneHeroPhoto(file, layout, photoSide);
    }
  }

  /** Abre o seletor para TROCAR a foto principal do banner `i`. */
  function startReplacePhoto(i: number) {
    replaceIndexRef.current = i;
    replaceInputRef.current?.click();
  }

  /** Sobe a nova foto e substitui a `url` do banner `index` (mantém texto/estilo). */
  async function uploadReplaceHeroPhoto(file: File, index: number) {
    if (!storeId) return;
    setHeroUploading(true);
    try {
      const supabase = createClient();
      const ext = file.name.split(".").pop() || "jpg";
      const fileName = `${storeId}/storefront-hero-${Date.now()}-${Math.round(
        Math.random() * 1e6
      )}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("product-images")
        .upload(fileName, file);
      if (upErr) {
        showToast("Erro ao enviar foto: " + upErr.message, "error");
        return;
      }
      const { data } = supabase.storage
        .from("product-images")
        .getPublicUrl(fileName);
      setSf((s) => ({
        ...s,
        heroSlides: s.heroSlides.map((sl, j) =>
          j === index ? { ...sl, url: data.publicUrl } : sl
        ),
      }));
      showToast("Foto trocada!");
    } finally {
      setHeroUploading(false);
    }
  }

  /** Sobe uma foto EXTRA (Foto 2/3) de um estilo multi-foto (strips/duo). */
  async function uploadExtraPhoto(
    slideIndex: number,
    extraIndex: number,
    file: File
  ) {
    if (!storeId) return;
    setHeroUploading(true);
    try {
      const supabase = createClient();
      const ext = file.name.split(".").pop() || "jpg";
      const fileName = `${storeId}/storefront-hero-extra-${Date.now()}-${Math.round(
        Math.random() * 1e6
      )}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("product-images")
        .upload(fileName, file);
      if (upErr) {
        showToast("Erro ao enviar foto: " + upErr.message, "error");
        return;
      }
      const { data } = supabase.storage.from("product-images").getPublicUrl(fileName);
      setSf((s) => ({
        ...s,
        heroSlides: s.heroSlides.map((sl, j) => {
          if (j !== slideIndex) return sl;
          const images = [...(sl.images ?? [])];
          while (images.length <= extraIndex) images.push("");
          images[extraIndex] = data.publicUrl;
          return { ...sl, images };
        }),
      }));
    } finally {
      setHeroUploading(false);
    }
  }

  /** Remove uma foto extra (mantém as demais posições). */
  const removeExtraPhoto = (slideIndex: number, extraIndex: number) =>
    setSf((s) => ({
      ...s,
      heroSlides: s.heroSlides.map((sl, j) => {
        if (j !== slideIndex) return sl;
        const images = [...(sl.images ?? [])];
        if (extraIndex < images.length) images[extraIndex] = "";
        return { ...sl, images };
      }),
    }));

  /** Atualiza um campo de um slide (merge). */
  const patchSlide = (i: number, patch: Partial<HeroSlide>) =>
    setSf((s) => ({
      ...s,
      heroSlides: s.heroSlides.map((sl, j) => (j === i ? { ...sl, ...patch } : sl)),
    }));

  /** Troca o estilo do banner, aplicando gradiente/altura/lado padrão se faltar. */
  const applyTemplate = (i: number, tpl: HeroTemplate) => {
    const cur = sf.heroSlides[i];
    const patch: Partial<HeroSlide> = { template: tpl };
    if (tpl === "overlay" || tpl === "split") {
      patch.layout = tpl;
    } else {
      patch.bgFrom = cur?.bgFrom || "#001C45";
      patch.bgVia = cur?.bgVia || "#0064D2";
      patch.bgTo = cur?.bgTo || "#0086FF";
      patch.height = cur?.height || 360;
      // Strips/Duo/Gradient/Magazine ficam com o texto à esquerda (foto à
      // direita), como a referência.
      patch.photoSide =
        tpl === "gradient" ||
        tpl === "magazine" ||
        tpl === "strips" ||
        tpl === "duo"
          ? "right"
          : "left";
    }
    patchSlide(i, patch);
  };

  const removeSlide = (i: number) =>
    setSf((s) => ({ ...s, heroSlides: s.heroSlides.filter((_, j) => j !== i) }));

  const moveSlide = (i: number, dir: -1 | 1) =>
    setSf((s) => {
      const j = i + dir;
      if (j < 0 || j >= s.heroSlides.length) return s;
      const next = [...s.heroSlides];
      [next[i], next[j]] = [next[j]!, next[i]!];
      return { ...s, heroSlides: next };
    });

  /* ---- Cards promocionais abaixo do banner ---- */
  const cards = sf.promoCards;
  const addCard = (card: PromoCard) =>
    setSf((s) =>
      s.promoCards.length >= MAX_PROMO_CARDS
        ? s
        : { ...s, promoCards: [...s.promoCards, { ...card }] }
    );
  const patchCard = (i: number, patch: Partial<PromoCard>) =>
    setSf((s) => ({
      ...s,
      promoCards: s.promoCards.map((c, j) => (j === i ? { ...c, ...patch } : c)),
    }));
  const removeCard = (i: number) =>
    setSf((s) => ({ ...s, promoCards: s.promoCards.filter((_, j) => j !== i) }));
  const moveCard = (i: number, dir: -1 | 1) =>
    setSf((s) => {
      const j = i + dir;
      if (j < 0 || j >= s.promoCards.length) return s;
      const next = [...s.promoCards];
      [next[i], next[j]] = [next[j]!, next[i]!];
      return { ...s, promoCards: next };
    });

  async function save() {
    if (!storeId) return;
    setSaving(true);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("stores")
        .update({ storefront: storefrontToDb(sf) })
        .eq("id", storeId);
      if (error) {
        showToast("Erro ao salvar: " + error.message, "error");
        return;
      }
      showToast("Banner salvo!");
    } finally {
      setSaving(false);
    }
  }

  const colorVars = {
    ["--store-primary"]: sf.themePrimary,
    ["--store-secondary"]: sf.themeSecondary,
  } as React.CSSProperties;

  const fallback = {
    badge: sf.heroSubtitle,
    title: sf.heroTitle,
    ctaLabel: sf.heroCtaLabel,
    coupon: sf.heroCouponCode,
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center text-slate-500 dark:text-slate-400">
        Carregando…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <input
        ref={bannerInputRef}
        type="file"
        accept="image/*"
        multiple
        className="sr-only"
        aria-hidden
        onChange={(e) => {
          if (e.target.files?.length) selectHeroPhotos(e.target.files);
          e.target.value = "";
        }}
      />
      {/* Input dedicado a TROCAR a foto de um banner existente (recorta pelo formato dele). */}
      <input
        ref={replaceInputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        aria-hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          const idx = replaceIndexRef.current;
          if (f && idx != null) {
            const sl = sf.heroSlides[idx];
            setHeroCrop({
              files: [f],
              current: 0,
              layout: sl?.layout ?? "overlay",
              photoSide: sl?.photoSide ?? "right",
              replaceIndex: idx,
            });
          }
          e.target.value = "";
        }}
      />

      {/* Cabeçalho */}
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <Link
            href="/dashboard/configuracoes"
            className="text-xs font-medium text-slate-500 hover:underline dark:text-slate-400"
          >
            ← Voltar para a loja
          </Link>
          <h1 className="mt-1 text-xl font-bold text-slate-900 dark:text-white">
            Banners do carrossel
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Cada foto pode ter seu próprio texto e formato.
          </p>
        </div>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="shrink-0 rounded-xl bg-landing-primary px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          {saving ? "Salvando…" : "Salvar"}
        </button>
      </div>

      {/* Adicionar */}
      <div className="mb-5 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <p className="mb-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
          Adicionar banner ({slides.length}/{maxBannerPhotos})
        </p>
        <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
          Formato da próxima foto (dá para mudar depois em cada banner):
        </p>
        <div className="mb-2 grid grid-cols-2 gap-2">
          {(
            [
              { v: "overlay" as const, label: "Foto de fundo", hint: "Texto por cima" },
              { v: "split" as const, label: "Foto ao lado", hint: "Foto + texto lado a lado" },
            ]
          ).map((opt) => (
            <button
              key={opt.v}
              type="button"
              onClick={() => setNextLayout(opt.v)}
              className={`rounded-xl border-2 p-2.5 text-left ${
                nextLayout === opt.v
                  ? "border-landing-primary bg-teal-50 dark:bg-teal-900/20"
                  : "border-slate-200 dark:border-slate-700"
              }`}
            >
              <span className="block text-xs font-bold text-slate-800 dark:text-slate-100">
                {opt.label}
              </span>
              <span className="block text-[10px] text-slate-500 dark:text-slate-400">
                {opt.hint}
              </span>
            </button>
          ))}
        </div>
        {nextLayout === "split" && (
          <div className="mb-3 grid grid-cols-2 gap-2">
            {(
              [
                { v: "left" as const, label: "Foto à esquerda" },
                { v: "right" as const, label: "Foto à direita" },
              ]
            ).map((opt) => (
              <button
                key={opt.v}
                type="button"
                onClick={() => setNextSide(opt.v)}
                className={`rounded-lg border-2 px-3 py-1.5 text-xs font-semibold ${
                  nextSide === opt.v
                    ? "border-landing-primary bg-teal-50 dark:bg-teal-900/20 text-slate-800 dark:text-slate-100"
                    : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}
        <button
          type="button"
          onClick={() => bannerInputRef.current?.click()}
          disabled={heroUploading || slides.length >= maxBannerPhotos}
          className="w-full rounded-xl bg-slate-100 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-200 disabled:opacity-50 dark:bg-slate-800 dark:text-slate-100"
        >
          {heroUploading
            ? "Enviando foto…"
            : slides.length >= maxBannerPhotos
              ? `Limite de ${maxBannerPhotos} fotos atingido`
              : "+ Escolher foto"}
        </button>
      </div>

      {/* Lista de banners */}
      {slides.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-400">
          Nenhum banner ainda. Adicione a primeira foto acima.
        </p>
      ) : (
        <div className="space-y-4" style={colorVars}>
          {slides.map((slide, i) => (
            <div
              key={`${slide.url}-${i}`}
              ref={slide.url === highlightUrl ? highlightRef : undefined}
              className={`rounded-2xl border bg-white p-4 transition-all dark:bg-slate-900 ${
                slide.url === highlightUrl
                  ? "border-landing-primary ring-2 ring-landing-primary ring-offset-2 dark:ring-offset-slate-950"
                  : "border-slate-200 dark:border-slate-700"
              }`}
            >
              <div className="mb-3 flex items-center justify-between">
                <span className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-200">
                  Banner {i + 1}
                  {slide.url === highlightUrl && (
                    <span className="rounded-full bg-landing-primary px-2 py-0.5 text-[10px] font-semibold text-white">
                      Ajuste texto e formato aqui ↓
                    </span>
                  )}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => moveSlide(i, -1)}
                    disabled={i === 0}
                    className="h-7 w-7 rounded border border-slate-200 text-slate-600 disabled:opacity-30 dark:border-slate-700 dark:text-slate-300"
                    aria-label="Subir"
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    onClick={() => moveSlide(i, 1)}
                    disabled={i === slides.length - 1}
                    className="h-7 w-7 rounded border border-slate-200 text-slate-600 disabled:opacity-30 dark:border-slate-700 dark:text-slate-300"
                    aria-label="Descer"
                  >
                    ▼
                  </button>
                  <button
                    type="button"
                    onClick={() => removeSlide(i)}
                    className="h-7 w-7 rounded border border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900"
                    aria-label="Remover"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* Prévia */}
              <SlidePreview slide={slide} fallback={fallback} primary={sf.themePrimary} />

              {/* Trocar a foto principal deste banner (recorta pelo formato dele) */}
              <button
                type="button"
                onClick={() => startReplacePhoto(i)}
                disabled={heroUploading}
                className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                🖼️ {heroUploading ? "Enviando…" : "Trocar foto"}
              </button>

              {/* Só a foto (sem texto): para fotos que já têm os dizeres embutidos */}
              <label className="mt-3 flex cursor-pointer items-start gap-2.5 rounded-xl border border-slate-200 bg-slate-50/60 p-3 dark:border-slate-700 dark:bg-slate-800/40">
                <input
                  type="checkbox"
                  checked={slide.noText ?? false}
                  onChange={(e) => patchSlide(i, { noText: e.target.checked })}
                  className="mt-0.5 h-4 w-4 accent-landing-primary"
                />
                <span>
                  <span className="block text-xs font-semibold text-slate-800 dark:text-slate-100">
                    Banner só com a foto (sem texto)
                  </span>
                  <span className="block text-[11px] text-slate-500 dark:text-slate-400">
                    Mostra só a imagem, sem texto/estilo por cima. Use quando a
                    foto já vem com os dizeres. O estilo e os textos abaixo ficam
                    ignorados.
                  </span>
                </span>
              </label>

              {/* Estilo do banner */}
              <p className="mt-3 mb-1.5 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                Estilo do banner
              </p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {(
                  [
                    { v: "overlay", label: "Foto de fundo", hint: "Texto por cima" },
                    { v: "split", label: "Foto ao lado", hint: "Foto + texto" },
                    { v: "gradient", label: "Gradiente", hint: "Fundo colorido" },
                    { v: "diagonal", label: "Diagonal", hint: "Recorte diagonal" },
                    { v: "fashion", label: "Fashion", hint: "Foto + badge" },
                    { v: "magazine", label: "Magazine", hint: "Texto colorido" },
                    { v: "spring", label: "Spring", hint: "Badge girando" },
                    { v: "sale", label: "Sale", hint: "Badge % OFF" },
                    { v: "strips", label: "Strips", hint: "3 faixas diagonais" },
                    { v: "duo", label: "Duo", hint: "2 fotos + cursivo" },
                  ] as { v: HeroTemplate; label: string; hint: string }[]
                ).map((opt) => {
                  const active = (slide.template ?? "overlay") === opt.v;
                  return (
                    <button
                      key={opt.v}
                      type="button"
                      onClick={() => applyTemplate(i, opt.v)}
                      className={`rounded-lg border-2 p-2 text-left ${
                        active
                          ? "border-landing-primary bg-teal-50 dark:bg-teal-900/20"
                          : "border-slate-200 dark:border-slate-700"
                      }`}
                    >
                      <span className="block text-xs font-bold text-slate-800 dark:text-slate-100">
                        {opt.label}
                      </span>
                      <span className="block text-[10px] text-slate-500 dark:text-slate-400">
                        {opt.hint}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Lado da foto: split (legado) e templates novos usam photoSide */}
              {(slide.template === "split" ||
                slide.layout === "split" ||
                (slide.template &&
                  !["overlay", "split"].includes(slide.template))) && (
                <div className="mt-2 flex flex-wrap gap-2">
                  <span className="self-center text-[11px] text-slate-500 dark:text-slate-400">
                    Foto:
                  </span>
                  {(
                    [
                      { v: "left" as const, label: "◧ Esquerda" },
                      { v: "right" as const, label: "Direita ◨" },
                    ]
                  ).map((opt) => (
                    <button
                      key={opt.v}
                      type="button"
                      onClick={() => patchSlide(i, { photoSide: opt.v })}
                      className={`rounded-lg border-2 px-3 py-1.5 text-xs font-medium ${
                        slide.photoSide === opt.v
                          ? "border-landing-primary bg-teal-50 dark:bg-teal-900/20 text-slate-800 dark:text-slate-100"
                          : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}

              {/* Controles de cor/altura — só para os templates novos */}
              {slide.template &&
                !["overlay", "split"].includes(slide.template) && (
                  <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3 dark:border-slate-700 dark:bg-slate-800/40">
                    <p className="mb-2 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                      {slide.template === "strips" || slide.template === "duo"
                        ? "Cor de destaque deste banner"
                        : "Cores e tamanho deste banner"}
                    </p>
                    <div className="flex flex-wrap items-center gap-3">
                      {/* Gradiente do painel — só nos estilos de painel colorido.
                          Strips/Duo têm painel claro, então só a cor de destaque. */}
                      {slide.template !== "strips" &&
                        slide.template !== "duo" &&
                        (
                          [
                            { key: "bgFrom" as const, label: "De", def: "#001C45" },
                            { key: "bgVia" as const, label: "Via", def: "#0064D2" },
                            { key: "bgTo" as const, label: "Até", def: "#0086FF" },
                          ] as { key: "bgFrom" | "bgVia" | "bgTo"; label: string; def: string }[]
                        ).map((c) => (
                          <label key={c.key} className="flex items-center gap-1.5">
                            <input
                              type="color"
                              value={slide[c.key] || c.def}
                              onChange={(e) =>
                                patchSlide(i, {
                                  [c.key]: e.target.value,
                                } as Partial<HeroSlide>)
                              }
                              className="h-8 w-8 cursor-pointer rounded border border-slate-300 p-0.5 dark:border-slate-600"
                            />
                            <span className="text-[11px] text-slate-500 dark:text-slate-400">
                              {c.label}
                            </span>
                          </label>
                        ))}
                      <label className="flex items-center gap-1.5">
                        <input
                          type="color"
                          value={slide.ctaBgColor || sf.themePrimary}
                          onChange={(e) => patchSlide(i, { ctaBgColor: e.target.value })}
                          className="h-8 w-8 cursor-pointer rounded border border-slate-300 p-0.5 dark:border-slate-600"
                        />
                        <span className="text-[11px] text-slate-500 dark:text-slate-400">
                          {slide.template === "strips" || slide.template === "duo"
                            ? "Destaque"
                            : "Botão"}
                        </span>
                      </label>
                      {slide.template !== "strips" && slide.template !== "duo" && (
                        <div
                          className="h-8 min-w-[80px] flex-1 rounded-lg"
                          style={{
                            background: `linear-gradient(to right, ${slide.bgFrom || "#001C45"}, ${slide.bgVia || slide.bgFrom || "#0064D2"}, ${slide.bgTo || "#0086FF"})`,
                          }}
                        />
                      )}
                    </div>
                    {/* Strips/Duo usam proporção fixa (foto de corpo inteiro),
                        então não têm barra de altura. */}
                    {slide.template !== "strips" && slide.template !== "duo" && (
                      <label className="mt-3 block">
                        <span className="mb-1 block text-[11px] text-slate-500 dark:text-slate-400">
                          Altura ({slide.height ?? 360}px)
                        </span>
                        <input
                          type="range"
                          min={220}
                          max={560}
                          step={20}
                          value={slide.height ?? 360}
                          onChange={(e) =>
                            patchSlide(i, { height: Number(e.target.value) })
                          }
                          className="w-full accent-landing-primary"
                        />
                      </label>
                    )}
                    <p className="mt-1 text-[10px] text-slate-400">
                      Dica: nesses estilos, use fotos de pessoa/produto em pé
                      (retrato). O texto “Destaque” ganha o degradê animado.
                    </p>
                  </div>
                )}

              {/* Fotos extras dos estilos multi-foto (Strips = 3, Duo = 2) */}
              {(slide.template === "strips" || slide.template === "duo") && (
                <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3 dark:border-slate-700 dark:bg-slate-800/40">
                  <p className="mb-2 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                    Fotos deste estilo{" "}
                    <span className="font-normal text-slate-400">
                      (a 1ª é a foto principal enviada acima)
                    </span>
                  </p>
                  <div className="flex flex-wrap gap-4">
                    {Array.from({
                      length: heroTemplatePhotoCount(slide.template) - 1,
                    }).map((_, k) => (
                      <ExtraPhotoSlot
                        key={k}
                        label={`Foto ${k + 2}`}
                        url={slide.images?.[k] ?? ""}
                        disabled={heroUploading}
                        onPick={(f) => uploadExtraPhoto(i, k, f)}
                        onRemove={() => removeExtraPhoto(i, k)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Textos deste banner (vazio = usa o texto geral) */}
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <SlideField
                  label="Etiqueta"
                  value={slide.badge ?? ""}
                  placeholder="(usa o texto geral)"
                  onChange={(v) => patchSlide(i, { badge: v })}
                />
                <SlideField
                  label="Título"
                  value={slide.title ?? ""}
                  placeholder="(usa o texto geral)"
                  onChange={(v) => patchSlide(i, { title: v })}
                />
                <SlideField
                  label="Destaque cursivo ✨"
                  value={slide.highlight ?? ""}
                  placeholder="ex.: para o verão"
                  onChange={(v) => patchSlide(i, { highlight: v })}
                />
                <SlideField
                  label="Frase"
                  value={slide.subtitle ?? ""}
                  placeholder="Uma frase de apoio"
                  onChange={(v) => patchSlide(i, { subtitle: v })}
                />
                <SlideField
                  label="Cupom"
                  value={slide.couponCode ?? ""}
                  placeholder="(usa o texto geral)"
                  onChange={(v) => patchSlide(i, { couponCode: v })}
                />
                <SlideField
                  label="Texto do botão"
                  value={slide.ctaLabel ?? ""}
                  placeholder="(usa o texto geral)"
                  onChange={(v) => patchSlide(i, { ctaLabel: v })}
                />
                <SlideField
                  label="Link do botão"
                  value={slide.ctaHref ?? ""}
                  placeholder="#catalogo"
                  mono
                  onChange={(v) => patchSlide(i, { ctaHref: v })}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Cards promocionais abaixo do banner */}
      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
          Cards abaixo do banner
        </p>
        <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
          Faixa de cartões coloridos. Toque num modelo pronto para adicionar
          ({cards.length}/{MAX_PROMO_CARDS}).
        </p>

        {/* Modelos prontos */}
        <div className="mb-4 flex flex-wrap gap-2">
          {PROMO_CARD_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => addCard(p.card)}
              disabled={cards.length >= MAX_PROMO_CARDS}
              className="flex items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <span
                className="h-4 w-4 rounded"
                style={{
                  backgroundImage: `linear-gradient(135deg, ${p.card.from}, ${p.card.to})`,
                }}
              />
              + {p.label}
            </button>
          ))}
        </div>

        {cards.length === 0 ? (
          <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">
            Nenhum card ainda. Escolha um modelo acima para começar.
          </p>
        ) : (
          <div className="space-y-4">
            {cards.map((card, i) => (
              <div
                key={i}
                className="rounded-xl border border-slate-200 p-3 dark:border-slate-700"
              >
                <div className="mb-2 flex items-center justify-between">
                  {/* Prévia do card */}
                  <span
                    className="rounded-lg px-3 py-1.5 text-xs font-bold text-white"
                    style={{
                      backgroundImage: `linear-gradient(135deg, ${card.from}, ${card.to})`,
                    }}
                  >
                    {card.title || card.eyebrow || `Card ${i + 1}`}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => moveCard(i, -1)}
                      disabled={i === 0}
                      className="h-7 w-7 rounded border border-slate-200 text-slate-600 disabled:opacity-30 dark:border-slate-700 dark:text-slate-300"
                      aria-label="Subir"
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      onClick={() => moveCard(i, 1)}
                      disabled={i === cards.length - 1}
                      className="h-7 w-7 rounded border border-slate-200 text-slate-600 disabled:opacity-30 dark:border-slate-700 dark:text-slate-300"
                      aria-label="Descer"
                    >
                      ▼
                    </button>
                    <button
                      type="button"
                      onClick={() => removeCard(i)}
                      className="h-7 w-7 rounded border border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900"
                      aria-label="Remover"
                    >
                      ✕
                    </button>
                  </div>
                </div>

                {/* Cores */}
                <div className="mb-2 flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    Cor:
                  </span>
                  {PROMO_CARD_COLORS.map((col) => {
                    const active = card.from === col.from && card.to === col.to;
                    return (
                      <button
                        key={col.id}
                        type="button"
                        onClick={() => patchCard(i, { from: col.from, to: col.to })}
                        className={`h-6 w-6 rounded ${
                          active ? "ring-2 ring-offset-1 ring-landing-primary" : ""
                        }`}
                        style={{
                          backgroundImage: `linear-gradient(135deg, ${col.from}, ${col.to})`,
                        }}
                        aria-label={`Cor ${col.id}`}
                      />
                    );
                  })}
                </div>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <SlideField
                    label="Etiqueta"
                    value={card.eyebrow}
                    placeholder="🔥 Imperdível"
                    onChange={(v) => patchCard(i, { eyebrow: v })}
                  />
                  <SlideField
                    label="Título"
                    value={card.title}
                    placeholder="Camisetas & Polos"
                    onChange={(v) => patchCard(i, { title: v })}
                  />
                  <SlideField
                    label="Frase"
                    value={card.subtitle}
                    placeholder="A partir de R$ 39"
                    onChange={(v) => patchCard(i, { subtitle: v })}
                  />
                  <SlideField
                    label="Texto do link"
                    value={card.ctaLabel}
                    placeholder="Explorar"
                    onChange={(v) => patchCard(i, { ctaLabel: v })}
                  />
                  <SlideField
                    label="Link"
                    value={card.href}
                    placeholder="#catalogo"
                    mono
                    onChange={(v) => patchCard(i, { href: v })}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Menu de categorias no topo */}
      <label className="mt-6 flex cursor-pointer items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <input
          type="checkbox"
          checked={sf.showCategoryNav}
          onChange={(e) =>
            setSf((s) => ({ ...s, showCategoryNav: e.target.checked }))
          }
          className="h-5 w-5 accent-landing-primary"
        />
        <span>
          <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100">
            Mostrar menu de categorias no topo
          </span>
          <span className="block text-xs text-slate-500 dark:text-slate-400">
            Barra com as categorias abaixo do cabeçalho (aparece se você tiver
            categorias cadastradas).
          </span>
        </span>
      </label>

      {/* Texto geral (fallback) */}
      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
          Texto geral do banner
        </p>
        <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
          Usado quando um banner acima não tem texto próprio.
        </p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <SlideField
            label="Etiqueta"
            value={sf.heroSubtitle}
            placeholder="Bem-vindo à nossa loja"
            onChange={(v) => setSf((s) => ({ ...s, heroSubtitle: v }))}
          />
          <SlideField
            label="Título (vazio = nome da loja)"
            value={sf.heroTitle}
            placeholder="Nome da loja"
            onChange={(v) => setSf((s) => ({ ...s, heroTitle: v }))}
          />
          <SlideField
            label="Cupom"
            value={sf.heroCouponCode}
            placeholder="BEMVINDO10"
            onChange={(v) => setSf((s) => ({ ...s, heroCouponCode: v }))}
          />
          <SlideField
            label="Texto do botão"
            value={sf.heroCtaLabel}
            placeholder="Ver produtos"
            onChange={(v) => setSf((s) => ({ ...s, heroCtaLabel: v }))}
          />
          <SlideField
            label="Link do botão"
            value={sf.heroCtaHref}
            placeholder="#catalogo"
            mono
            onChange={(v) => setSf((s) => ({ ...s, heroCtaHref: v }))}
          />
        </div>
      </div>

      <div className="mt-6 flex gap-3">
        <Link
          href="/dashboard/configuracoes"
          className="flex-1 rounded-xl bg-slate-100 py-3 text-center font-medium text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200"
        >
          Voltar
        </Link>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="flex-1 rounded-xl bg-landing-primary py-3 font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          {saving ? "Salvando…" : "Salvar banner"}
        </button>
      </div>

      {heroCrop && heroCropSrc && heroCrop.files[heroCrop.current] && (
        <ProductImageCropModal
          imageSrc={heroCropSrc}
          sourceFileName={heroCrop.files[heroCrop.current].name}
          originalFile={heroCrop.files[heroCrop.current]}
          aspect={heroCropRatioForLayout(heroCrop.layout)}
          title="Ajustar foto do banner"
          description={
            heroCrop.layout === "split"
              ? "Enquadre a foto no formato “ao lado” (mais quadrado)."
              : "Enquadre a foto no formato largo do banner."
          }
          confirmLabel="Usar este enquadramento"
          onCancel={advanceHeroCrop}
          onComplete={handleHeroCropDone}
        />
      )}
    </div>
  );
}

/** Slot de foto extra (Foto 2/3) dos estilos multi-foto (strips/duo). */
function ExtraPhotoSlot({
  label,
  url,
  disabled,
  onPick,
  onRemove,
}: {
  label: string;
  url: string;
  disabled?: boolean;
  onPick: (file: File) => void;
  onRemove: () => void;
}) {
  return (
    <div>
      <span className="mb-1 block text-[11px] font-medium text-slate-600 dark:text-slate-300">
        {label}
      </span>
      <div className="flex items-center gap-2">
        {url ? (
          <div className="relative h-16 w-16 overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
            <Image src={url} alt="" fill className="object-cover" sizes="64px" />
            <button
              type="button"
              onClick={onRemove}
              className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-[10px] text-white hover:bg-black/80"
              aria-label="Remover foto"
            >
              ✕
            </button>
          </div>
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-dashed border-slate-300 text-xl opacity-40 dark:border-slate-600">
            🖼️
          </div>
        )}
        <label
          className={`cursor-pointer rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-100 ${
            disabled ? "pointer-events-none opacity-50" : ""
          }`}
        >
          {url ? "Trocar" : "Enviar"}
          <input
            type="file"
            accept="image/*"
            className="sr-only"
            disabled={disabled}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onPick(f);
              e.target.value = "";
            }}
          />
        </label>
      </div>
    </div>
  );
}

/** Campo de texto compacto reutilizado nos formulários dos banners. */
function SlideField({
  label,
  value,
  placeholder,
  mono = false,
  onChange,
}: {
  label: string;
  value: string;
  placeholder?: string;
  mono?: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium text-slate-600 dark:text-slate-300">
        {label}
      </span>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 ${
          mono ? "font-mono" : ""
        }`}
      />
    </label>
  );
}
