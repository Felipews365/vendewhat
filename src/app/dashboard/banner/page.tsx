"use client";

/**
 * Página dedicada de edição do BANNER (carrossel) — versão "estúdio":
 * edita UM banner por vez num formulário guiado, com PRÉVIA EM TEMPO REAL
 * (desktop + celular) e uma TABELA com todos os banners (reordenar/editar/
 * remover). Cada banner (slide) tem seu próprio estilo E seu próprio texto; há
 * também um "texto geral" usado quando o slide não tem texto próprio. Tudo mora
 * no JSONB `stores.storefront` (heroSlides + textos gerais), sem migration.
 *
 * As animações (foto surgindo, texto em cascata, botão com brilho — "Magic UI")
 * vivem no componente compartilhado com a loja pública (HeroTemplateSlide) +
 * nos keyframes CSS (vw-photo-in / vw-reveal-stagger / vw-anim-gradient /
 * vw-ken-burns / vw-banner-in), então a prévia mostra o MESMO efeito da loja.
 */
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import {
  DEFAULT_STOREFRONT,
  bannerPhotoLimitForPlan,
  HERO_TARGET_RATIO,
  MAX_PROMO_CARDS,
  PROMO_CARD_COLORS,
  PROMO_CARD_PRESETS,
  type HeroSlide,
  type HeroSplitPhotoSide,
  type HeroTemplate,
  type PromoCard,
  type StorefrontSettings,
  storefrontFromDb,
  storefrontToDb,
} from "@/lib/storefront";
import {
  HERO_PRESETS,
  clampSlidePhotos,
  heroTemplateMaxPhotos,
  type HeroPreset,
} from "@/lib/heroPresets";
import {
  HeroTemplateSlide,
  type HeroSlideContent,
} from "@/components/storefront/HeroTemplateSlide";
import { ProductImageCropModal } from "@/components/ProductImageCropModal";
import { useToast } from "@/components/Toast";

/* ------------------------------------------------------------------ */
/*  Constantes / helpers                                              */
/* ------------------------------------------------------------------ */

/** Estilos oferecidos, com rótulo + dica curta (vão nas miniaturas). */
const STYLE_OPTIONS: { v: HeroTemplate; label: string; hint: string }[] = [
  { v: "overlay", label: "Foto de fundo", hint: "Foto cobre tudo + texto" },
  { v: "split", label: "Foto ao lado", hint: "Foto + texto lado a lado" },
  { v: "gradient", label: "Gradiente", hint: "Fundo colorido gradiente" },
  { v: "diagonal", label: "Diagonal", hint: "Foto + cor diagonal" },
  { v: "fashion", label: "Fashion", hint: "Foto + badge círculo" },
  { v: "magazine", label: "Magazine", hint: "Texto colorido + foto" },
  { v: "spring", label: "Spring", hint: "Fundo branco + badge girando" },
  { v: "sale", label: "Sale", hint: "Foto + badge % OFF" },
  { v: "strips", label: "Strips", hint: "3 faixas diagonais animadas" },
  { v: "duo", label: "Duo", hint: "2 fotos + texto cursivo" },
];

/** Presets de altura (os "pills" Compacto/Médio/Alto/Extra). */
const HEIGHT_PRESETS: { v: number; label: string }[] = [
  { v: 280, label: "Compacto" },
  { v: 360, label: "Médio" },
  { v: 440, label: "Alto" },
  { v: 520, label: "Extra" },
];

/** Estilos "gráficos" (painel colorido) — ganham gradiente/altura no editor. */
function isGraphicTemplate(tpl: HeroTemplate | undefined): boolean {
  return !!tpl && tpl !== "overlay" && tpl !== "split";
}

/** Proporção de recorte da foto conforme o estilo do banner. */
function cropRatioForTemplate(tpl: HeroTemplate | undefined): number {
  if (tpl === "overlay" || !tpl) return HERO_TARGET_RATIO; // largo
  if (tpl === "split") return 1; // quadrado
  return 3 / 4; // retrato (pessoa/produto em pé)
}

/** Estilo usa `photoSide` (foto de um lado)? overlay = não. */
function usesPhotoSide(tpl: HeroTemplate | undefined): boolean {
  return tpl === "split" || isGraphicTemplate(tpl);
}

/** Slide "vazio" novo (nasce no estilo Gradiente, como a referência). */
function newSlide(): HeroSlide {
  return {
    url: "",
    layout: "overlay",
    photoSide: "right",
    template: "gradient",
    bgFrom: "#001C45",
    bgVia: "#0064D2",
    bgTo: "#0086FF",
    height: 360,
  };
}

type CropTarget = { kind: "main" } | { kind: "extra"; extraIndex: number };
type HeroCropSession = {
  file: File;
  ratio: number;
  target: CropTarget;
};

/* ------------------------------------------------------------------ */
/*  Miniatura visual de cada estilo (seletor bonito)                 */
/* ------------------------------------------------------------------ */

function StyleThumb({ tpl }: { tpl: HeroTemplate }) {
  // Cores de referência das miniaturas (azul + rosa fashion), só ilustrativas.
  const navy = "#0b3d91";
  const blue = "#1e88ff";
  const pink = "#e6357a";
  const orange = "#ff6b1a";
  const gray = "#e2e8f0";
  const box = "relative h-12 w-full overflow-hidden rounded-md";

  switch (tpl) {
    case "overlay":
      return (
        <div className={box} style={{ background: `linear-gradient(120deg, ${navy}, ${blue})` }}>
          <div className="absolute bottom-1.5 left-1.5 h-1.5 w-8 rounded bg-white/90" />
          <div className="absolute bottom-3.5 left-1.5 h-1.5 w-5 rounded bg-white/60" />
        </div>
      );
    case "split":
      return (
        <div className={`${box} flex`}>
          <div className="w-1/2" style={{ background: gray }} />
          <div className="flex w-1/2 flex-col justify-center gap-1 px-1.5" style={{ background: navy }}>
            <div className="h-1.5 w-6 rounded bg-white/90" />
            <div className="h-1 w-4 rounded bg-white/50" />
          </div>
        </div>
      );
    case "gradient":
      return (
        <div className={box} style={{ background: `linear-gradient(120deg, ${navy}, ${blue})` }}>
          <div className="absolute right-1.5 top-1.5 h-6 w-6 rounded-full bg-white/15" />
          <div className="absolute bottom-2 left-1.5 h-1.5 w-7 rounded bg-white/90" />
        </div>
      );
    case "diagonal":
      return (
        <div className={box} style={{ background: gray }}>
          <div className="absolute inset-0" style={{ background: blue, clipPath: "polygon(45% 0, 100% 0, 100% 100%, 25% 100%)" }} />
        </div>
      );
    case "fashion":
      return (
        <div className={box} style={{ background: gray }}>
          <div className="absolute inset-y-0 right-0 w-[62%]" style={{ background: pink, clipPath: "polygon(20% 0,100% 0,100% 100%,0 100%)" }} />
          <div className="absolute right-[58%] top-1/2 h-5 w-5 -translate-y-1/2 translate-x-1/2 rounded-full border-2 border-white bg-white/90" />
        </div>
      );
    case "magazine":
      return (
        <div className={`${box} flex`} style={{ background: "#fff" }}>
          <div className="flex w-1/2 flex-col justify-center gap-1 px-1.5">
            <div className="h-2 w-7 rounded" style={{ background: orange }} />
            <div className="h-1 w-5 rounded" style={{ background: "#94a3b8" }} />
          </div>
          <div className="w-1/2" style={{ background: `linear-gradient(120deg,${orange},#ffb37a)` }} />
        </div>
      );
    case "spring":
      return (
        <div className={box} style={{ background: "#fff" }}>
          <div className="absolute inset-y-0 left-0 w-[55%]" style={{ background: `linear-gradient(120deg,${pink},#ff9ac2)`, clipPath: "polygon(0 0,78% 0,100% 100%,0 100%)" }} />
          <div className="absolute left-1/2 top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-pink-300 bg-white" />
        </div>
      );
    case "sale":
      return (
        <div className={box} style={{ background: gray }}>
          <div className="absolute inset-y-0 left-0 w-[55%]" style={{ background: `linear-gradient(120deg,${pink},#ff7aa8)`, clipPath: "polygon(0 0,80% 0,100% 100%,0 100%)" }} />
          <div className="absolute left-1/2 top-1/2 flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-[6px] font-black text-pink-600">%</div>
        </div>
      );
    case "strips":
      return (
        <div className={`${box} flex items-center gap-[3px] px-1`} style={{ background: "#fff" }}>
          <div className="flex w-1/2 flex-col gap-1">
            <div className="h-1.5 w-6 rounded" style={{ background: pink }} />
            <div className="h-1 w-4 rounded bg-slate-300" />
          </div>
          <div className="flex h-full flex-1 gap-[3px]" style={{ transform: "skewX(-12deg)" }}>
            {[orange, pink, blue].map((c, i) => (
              <div key={i} className="h-full flex-1" style={{ background: c }} />
            ))}
          </div>
        </div>
      );
    case "duo":
      return (
        <div className={`${box} flex items-center gap-[3px] px-1`} style={{ background: "#fff" }}>
          <div className="flex w-1/2 flex-col gap-1">
            <div className="h-1.5 w-6 rounded" style={{ background: pink }} />
            <div className="h-1 w-4 rounded bg-slate-300" />
          </div>
          <div className="flex h-full flex-1 gap-[3px]">
            <div className="h-full flex-1 rounded-sm" style={{ background: pink }} />
            <div className="h-full flex-1 rounded-sm" style={{ background: navy }} />
          </div>
        </div>
      );
    default:
      return <div className={box} style={{ background: gray }} />;
  }
}

/* ------------------------------------------------------------------ */
/*  Prévia fiel de um banner (mesmo render da loja)                  */
/* ------------------------------------------------------------------ */

/** Miolo do slide — replica a escolha do HeroBannerBlock da loja pública. */
function SlideInner({
  slide,
  content,
  primary,
  mobile = false,
}: {
  slide: HeroSlide;
  content: HeroSlideContent;
  primary: string;
  /** true = prévia de celular (empilha foto em cima, texto embaixo). */
  mobile?: boolean;
}) {
  // "Só a foto": mostra apenas a imagem preenchendo o card.
  if (slide.noText) {
    return slide.url ? (
      <Image src={slide.url} alt="" fill className="vw-ken-burns object-cover" sizes="640px" />
    ) : (
      <div className="flex h-full w-full items-center justify-center bg-slate-200 text-3xl opacity-40">
        🖼️
      </div>
    );
  }

  const tpl = slide.template ?? "overlay";

  // Estilos gráficos: usa o MESMO componente da loja (animações inclusas).
  // `forceLayout` fixa o layout na prévia (o `sm:` do componente responde ao
  // viewport do PC, então sem isso o mockup de celular mostraria o de desktop).
  if (isGraphicTemplate(tpl)) {
    return (
      <HeroTemplateSlide
        slide={slide}
        content={content}
        primary={primary}
        onCta={(e) => e.preventDefault()}
        forceLayout={mobile ? "mobile" : "desktop"}
      />
    );
  }

  const textBlock = (
    <div className="vw-reveal-stagger flex flex-col gap-1">
      {content.badge && (
        <span className="text-[10px] font-semibold uppercase tracking-widest text-white/85 line-clamp-1">
          {content.badge}
        </span>
      )}
      <span className="font-serif text-xl font-bold leading-tight text-white line-clamp-2 drop-shadow">
        {content.title || "Título do banner"}
      </span>
      {content.highlight && (
        <span
          className="vw-anim-gradient font-script text-2xl font-bold leading-none"
          style={{
            backgroundImage:
              "linear-gradient(to right, var(--store-primary), #ffffff, var(--store-primary))",
          }}
        >
          {content.highlight}
        </span>
      )}
      {content.subtitle && (
        <span className="text-[11px] text-white/85 line-clamp-2">{content.subtitle}</span>
      )}
      {content.ctaLabel && (
        <span
          className="mt-1 inline-flex w-fit rounded px-3 py-1.5 text-[11px] font-bold uppercase text-white shadow"
          style={{ backgroundColor: "var(--store-primary)" }}
        >
          {content.ctaLabel} →
        </span>
      )}
    </div>
  );

  const photo = slide.url ? (
    <Image src={slide.url} alt="" fill className="vw-ken-burns object-cover" sizes="640px" />
  ) : (
    <div className="flex h-full w-full items-center justify-center bg-slate-200 text-3xl opacity-40">
      🖼️
    </div>
  );

  // Split: foto de um lado, texto num painel colorido do outro. No celular
  // (mobile) empilha — foto em cima, painel embaixo — igual à loja real.
  if (tpl === "split") {
    const photoCol = (
      <div className={`relative ${mobile ? "h-1/2 w-full" : "w-1/2"}`}>{photo}</div>
    );
    const textCol = (
      <div
        className={`flex flex-col justify-center p-4 ${mobile ? "h-1/2 w-full" : "w-1/2"}`}
        style={{ backgroundColor: "var(--store-secondary)" }}
      >
        {textBlock}
      </div>
    );
    return (
      <div className={`absolute inset-0 flex ${mobile ? "flex-col" : ""}`}>
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

  // Overlay: foto de fundo + texto por cima.
  return (
    <>
      {photo}
      <div className="absolute inset-0 bg-gradient-to-r from-black/55 via-black/25 to-transparent" />
      <div className="absolute inset-0 flex max-w-[75%] flex-col justify-end p-4">{textBlock}</div>
    </>
  );
}

/** Prévia em um "card" (desktop) ou "celular" (mobile portrait). */
function BannerPreview({
  slide,
  content,
  primary,
  secondary,
  variant,
}: {
  slide: HeroSlide;
  content: HeroSlideContent;
  primary: string;
  secondary: string;
  variant: "desktop" | "mobile";
}) {
  const vars = {
    ["--store-primary"]: primary,
    ["--store-secondary"]: secondary,
  } as React.CSSProperties;

  // A key força o remonte a cada mudança relevante → as animações re-disparam.
  const animKey = `${slide.template}-${slide.url}-${slide.photoSide}-${content.title}-${content.highlight}`;

  if (variant === "mobile") {
    return (
      <div className="mx-auto w-[190px]" style={vars}>
        <div className="rounded-[1.75rem] border-4 border-slate-800 bg-slate-800 p-1.5 shadow-lg dark:border-slate-600">
          <div
            key={animKey}
            className="vw-banner-in relative h-[300px] w-full overflow-hidden rounded-[1.35rem]"
          >
            <SlideInner slide={slide} content={content} primary={primary} mobile />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={vars}>
      <div
        key={animKey}
        className="vw-banner-in relative aspect-[16/7] w-full overflow-hidden rounded-2xl shadow-sm ring-1 ring-slate-200 dark:ring-slate-700"
      >
        <SlideInner slide={slide} content={content} primary={primary} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Modelos prontos (cards com miniatura real)                       */
/* ------------------------------------------------------------------ */

/** Constrói um `HeroSlide` "de exemplo" a partir do preset (sem fotos). */
function presetToSlide(p: HeroPreset): HeroSlide {
  return {
    url: "",
    layout: p.template === "split" ? "split" : "overlay",
    photoSide: p.photoSide ?? "right",
    template: p.template,
    bgFrom: p.bgFrom,
    bgVia: p.bgVia,
    bgTo: p.bgTo,
    ctaBgColor: p.ctaBgColor,
    height: p.height,
    badge: p.sample.badge,
    title: p.sample.title,
    highlight: p.sample.highlight,
    subtitle: p.sample.subtitle,
    ctaLabel: p.sample.ctaLabel,
  };
}

function presetContent(p: HeroPreset): HeroSlideContent {
  return {
    badge: p.sample.badge ?? "",
    title: p.sample.title || "Título do banner",
    highlight: p.sample.highlight ?? "",
    subtitle: p.sample.subtitle ?? "",
    ctaLabel: p.sample.ctaLabel || "Ver coleção",
    ctaHref: "#catalogo",
  };
}

/** Miniatura REAL do modelo (mesmo render da loja, sem fotos). */
function PresetPreview({
  preset,
  primary,
  secondary,
}: {
  preset: HeroPreset;
  primary: string;
  secondary: string;
}) {
  const vars = {
    ["--store-primary"]: primary,
    ["--store-secondary"]: secondary,
  } as React.CSSProperties;
  return (
    <div
      className="relative aspect-[16/7] w-full overflow-hidden rounded-lg bg-slate-100 dark:bg-slate-800"
      style={vars}
    >
      <SlideInner slide={presetToSlide(preset)} content={presetContent(preset)} primary={primary} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Página                                                            */
/* ------------------------------------------------------------------ */

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

  // Formulário de UM banner por vez.
  const [draft, setDraft] = useState<HeroSlide | null>(null);
  const [draftIndex, setDraftIndex] = useState<number | null>(null); // null = novo
  const [draftOrder, setDraftOrder] = useState(1); // 1-based
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  const [showAdvancedStyle, setShowAdvancedStyle] = useState(false);
  const formRef = useRef<HTMLDivElement | null>(null);

  const mainInputRef = useRef<HTMLInputElement>(null);
  const extraInputRef = useRef<HTMLInputElement>(null);
  const extraIndexRef = useRef<number>(0);

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
        supabase.from("subscriptions").select("plan_id").eq("store_id", store.id).maybeSingle(),
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

  // Preview (blob) da foto em recorte.
  useEffect(() => {
    if (!heroCrop) {
      setHeroCropSrc(null);
      return;
    }
    const url = URL.createObjectURL(heroCrop.file);
    setHeroCropSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [heroCrop]);

  /* ---- Persistência ---- */

  /** Salva um storefront no banco (e atualiza o estado). */
  async function persist(next: StorefrontSettings, toastMsg?: string) {
    setSf(next);
    if (!storeId) return;
    setSaving(true);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("stores")
        .update({ storefront: storefrontToDb(next) })
        .eq("id", storeId);
      if (error) {
        showToast("Erro ao salvar: " + error.message, "error");
        return;
      }
      if (toastMsg) showToast(toastMsg);
    } finally {
      setSaving(false);
    }
  }

  /* ---- Abrir/fechar o formulário ---- */

  function openNew() {
    if (slides.length >= maxBannerPhotos) {
      showToast(`O banner aceita no máximo ${maxBannerPhotos} fotos no seu plano.`, "error");
      return;
    }
    setDraft(newSlide());
    setDraftIndex(null);
    setDraftOrder(slides.length + 1);
    setActivePresetId(null);
    setShowAdvancedStyle(false);
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }

  function openEdit(i: number) {
    setDraft({ ...slides[i] });
    setDraftIndex(i);
    setDraftOrder(i + 1);
    setActivePresetId(null);
    setShowAdvancedStyle(false);
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }

  function closeForm() {
    setDraft(null);
    setDraftIndex(null);
  }

  const patchDraft = (patch: Partial<HeroSlide>) =>
    setDraft((d) => (d ? { ...d, ...patch } : d));

  /**
   * Aplica um MODELO pronto: estilo + paleta + altura/lado, preenchendo só os
   * textos VAZIOS com o exemplo (para trocar de modelo sem perder o que já foi
   * digitado/enviado). Ajusta o nº de fotos ao que o modelo aproveita.
   */
  function applyPreset(preset: HeroPreset) {
    setActivePresetId(preset.id);
    setDraft((d) => {
      const base = d ?? newSlide();
      const keep = (cur: string | undefined, sample: string | undefined) =>
        cur?.trim() ? cur : sample;
      const next: HeroSlide = {
        ...base,
        template: preset.template,
        layout:
          preset.template === "overlay" || preset.template === "split"
            ? preset.template
            : base.layout,
        photoSide: preset.photoSide ?? base.photoSide,
        bgFrom: preset.bgFrom ?? base.bgFrom,
        bgVia: preset.bgVia ?? base.bgVia,
        bgTo: preset.bgTo ?? base.bgTo,
        ctaBgColor: preset.ctaBgColor ?? base.ctaBgColor,
        height: preset.height ?? base.height,
        badge: keep(base.badge, preset.sample.badge),
        title: keep(base.title, preset.sample.title),
        highlight: keep(base.highlight, preset.sample.highlight),
        subtitle: keep(base.subtitle, preset.sample.subtitle),
        ctaLabel: keep(base.ctaLabel, preset.sample.ctaLabel),
      };
      return clampSlidePhotos(next);
    });
  }

  /** Escolhe o estilo do banner, aplicando padrões de cor/altura/lado. */
  function chooseStyle(tpl: HeroTemplate) {
    setActivePresetId(null);
    setDraft((d) => {
      if (!d) return d;
      const patch: Partial<HeroSlide> = { template: tpl };
      if (tpl === "overlay" || tpl === "split") {
        patch.layout = tpl;
      } else {
        patch.bgFrom = d.bgFrom || "#001C45";
        patch.bgVia = d.bgVia || "#0064D2";
        patch.bgTo = d.bgTo || "#0086FF";
        patch.height = d.height || 360;
        patch.photoSide =
          tpl === "gradient" || tpl === "magazine" || tpl === "strips" || tpl === "duo"
            ? "right"
            : "left";
      }
      // Ajusta fotos ao novo estilo (dropa extras que ele não aproveita).
      return clampSlidePhotos({ ...d, ...patch });
    });
  }

  /** Salva o banner do formulário na lista (na posição escolhida) e persiste. */
  async function commitDraft() {
    if (!draft) return;
    const list = [...slides];
    const pos = Math.max(0, Math.min(draftOrder - 1, (draftIndex == null ? list.length : list.length - 1)));
    if (draftIndex == null) {
      list.push({ ...draft });
      const [item] = list.splice(list.length - 1, 1);
      list.splice(pos, 0, item!);
    } else {
      list[draftIndex] = { ...draft };
      const [item] = list.splice(draftIndex, 1);
      list.splice(pos, 0, item!);
    }
    const next = { ...sf, heroSlides: list.slice(0, maxBannerPhotos) };
    closeForm();
    await persist(next, draftIndex == null ? "Banner criado!" : "Banner salvo!");
  }

  /* ---- Ações da tabela ---- */

  async function removeSlide(i: number) {
    const next = { ...sf, heroSlides: slides.filter((_, j) => j !== i) };
    if (draftIndex === i) closeForm();
    await persist(next, "Banner removido.");
  }

  async function moveSlide(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= slides.length) return;
    const list = [...slides];
    [list[i], list[j]] = [list[j]!, list[i]!];
    await persist({ ...sf, heroSlides: list });
  }

  /* ---- Upload de fotos (com recorte) ---- */

  function pickMainPhoto() {
    mainInputRef.current?.click();
  }
  function pickExtraPhoto(extraIndex: number) {
    extraIndexRef.current = extraIndex;
    extraInputRef.current?.click();
  }

  async function uploadPhoto(file: File): Promise<string | null> {
    if (!storeId) return null;
    const supabase = createClient();
    const ext = file.name.split(".").pop() || "jpg";
    const fileName = `${storeId}/storefront-hero-${Date.now()}-${Math.round(Math.random() * 1e6)}.${ext}`;
    const { error: upErr } = await supabase.storage.from("product-images").upload(fileName, file);
    if (upErr) {
      showToast("Erro ao enviar foto: " + upErr.message, "error");
      return null;
    }
    return supabase.storage.from("product-images").getPublicUrl(fileName).data.publicUrl;
  }

  async function handleCropDone(file: File) {
    const target = heroCrop?.target ?? { kind: "main" as const };
    setHeroCrop(null);
    setHeroUploading(true);
    try {
      const url = await uploadPhoto(file);
      if (!url) return;
      if (target.kind === "main") {
        patchDraft({ url });
      } else {
        setDraft((d) => {
          if (!d) return d;
          const images = [...(d.images ?? [])];
          while (images.length <= target.extraIndex) images.push("");
          images[target.extraIndex] = url;
          return { ...d, images };
        });
      }
    } finally {
      setHeroUploading(false);
    }
  }

  const removeExtraPhoto = (extraIndex: number) =>
    setDraft((d) => {
      if (!d) return d;
      const images = [...(d.images ?? [])];
      if (extraIndex < images.length) images[extraIndex] = "";
      return { ...d, images };
    });

  /* ---- Cards promocionais ---- */
  const cards = sf.promoCards;
  const addCard = (card: PromoCard) =>
    setSf((s) =>
      s.promoCards.length >= MAX_PROMO_CARDS ? s : { ...s, promoCards: [...s.promoCards, { ...card }] }
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

  async function saveRest() {
    await persist(sf, "Alterações salvas!");
  }

  /* ---- Derivados ---- */

  const fallback = {
    badge: sf.heroSubtitle,
    title: sf.heroTitle,
    ctaLabel: sf.heroCtaLabel,
    coupon: sf.heroCouponCode,
  };

  const draftContent: HeroSlideContent | null = draft
    ? {
        badge: draft.badge?.trim() || fallback.badge,
        title: draft.title?.trim() || fallback.title || "Título do banner",
        highlight: draft.highlight?.trim() || "",
        subtitle: draft.subtitle?.trim() || "",
        ctaLabel: draft.ctaLabel?.trim() || fallback.ctaLabel || "Ver coleção",
        ctaHref: draft.ctaHref?.trim() || "#catalogo",
      }
    : null;

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-16 text-center text-slate-500 dark:text-slate-400">
        Carregando…
      </div>
    );
  }

  const graphic = isGraphicTemplate(draft?.template);
  const maxPhotos = heroTemplateMaxPhotos(draft?.template);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      {/* Inputs de arquivo escondidos */}
      <input
        ref={mainInputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        aria-hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f && draft) {
            setHeroCrop({ file: f, ratio: cropRatioForTemplate(draft.template), target: { kind: "main" } });
          }
          e.target.value = "";
        }}
      />
      <input
        ref={extraInputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        aria-hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f && draft) {
            setHeroCrop({
              file: f,
              ratio: 3 / 4,
              target: { kind: "extra", extraIndex: extraIndexRef.current },
            });
          }
          e.target.value = "";
        }}
      />

      {/* Cabeçalho */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            href="/dashboard/configuracoes"
            className="text-xs font-medium text-slate-500 hover:underline dark:text-slate-400"
          >
            ← Voltar para a loja
          </Link>
          <h1 className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">
            Banners do Carrossel
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Gerencie os slides exibidos no topo da página inicial.
          </p>
        </div>
        <button
          type="button"
          onClick={openNew}
          disabled={slides.length >= maxBannerPhotos}
          className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-landing-primary px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:opacity-90 disabled:opacity-50"
        >
          <span className="text-lg leading-none">+</span> Novo banner
        </button>
      </div>

      {/* Formulário (com prévia) */}
      {draft && draftContent && (
        <div
          ref={formRef}
          className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900"
        >
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              {draftIndex == null ? "Novo Banner" : `Editar Banner ${draftIndex + 1}`}
            </h2>
            <span className="text-xs text-slate-400">
              {slides.length}/{maxBannerPhotos} banners
            </span>
          </div>

          <div className="grid gap-6 lg:grid-cols-[1fr,300px]">
            {/* ---- Coluna do formulário ---- */}
            <div className="space-y-5">
              {/* Modelos prontos (cards com miniatura real) */}
              <div>
                <Label>
                  Escolha um modelo{" "}
                  <span className="font-normal text-slate-400">
                    (1 clique aplica — depois é só trocar as fotos e os textos)
                  </span>
                </Label>
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                  {HERO_PRESETS.map((preset) => {
                    const active = activePresetId === preset.id;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => applyPreset(preset)}
                        title={`${preset.label} — usa até ${preset.photoCount} foto${preset.photoCount > 1 ? "s" : ""}`}
                        className={`group overflow-hidden rounded-xl border-2 text-left transition ${
                          active
                            ? "border-landing-primary ring-2 ring-landing-primary/30"
                            : "border-slate-200 hover:border-slate-300 dark:border-slate-700"
                        }`}
                      >
                        <PresetPreview
                          preset={preset}
                          primary={sf.themePrimary}
                          secondary={sf.themeSecondary}
                        />
                        <div className="flex items-center justify-between gap-1 px-2 py-1.5">
                          <span className="truncate text-xs font-bold text-slate-800 dark:text-slate-100">
                            {preset.emoji} {preset.label}
                          </span>
                          <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                            {preset.photoCount} 📷
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Estilo do banner (ajuste fino — avançado) */}
              <details
                open={showAdvancedStyle}
                onToggle={(e) => setShowAdvancedStyle((e.target as HTMLDetailsElement).open)}
                className="rounded-xl border border-slate-200 dark:border-slate-700"
              >
                <summary className="cursor-pointer select-none px-3 py-2.5 text-sm font-semibold text-slate-700 dark:text-slate-200">
                  ⚙️ Ajuste fino do estilo (avançado)
                </summary>
                <div className="px-3 pb-3">
                  <p className="mb-2 text-[11px] text-slate-500 dark:text-slate-400">
                    Prefere montar do zero? Escolha o estilo base — as cores e os textos você ajusta
                    abaixo.
                  </p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {STYLE_OPTIONS.map((opt) => {
                      const active = (draft.template ?? "overlay") === opt.v;
                      return (
                        <button
                          key={opt.v}
                          type="button"
                          onClick={() => chooseStyle(opt.v)}
                          className={`rounded-xl border-2 p-2 text-left transition ${
                            active
                              ? "border-landing-primary bg-teal-50 dark:bg-teal-900/20"
                              : "border-slate-200 hover:border-slate-300 dark:border-slate-700"
                          }`}
                        >
                          <StyleThumb tpl={opt.v} />
                          <span className="mt-1.5 block text-xs font-bold text-slate-800 dark:text-slate-100">
                            {opt.label}
                          </span>
                          <span className="block text-[10px] leading-tight text-slate-500 dark:text-slate-400">
                            {opt.hint}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </details>

              {/* Imagem */}
              <div>
                <Label>
                  Imagem do banner{" "}
                  <span className="font-normal text-slate-400">
                    {maxPhotos > 1
                      ? "(foto principal)"
                      : draft.template === "gradient"
                        ? "(opcional)"
                        : "(recomendada)"}
                  </span>
                </Label>
                <div className="flex items-start gap-3">
                  <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-800">
                    {draft.url ? (
                      <Image src={draft.url} alt="" fill className="object-cover" sizes="80px" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-2xl opacity-40">
                        🖼️
                      </div>
                    )}
                  </div>
                  <div className="flex-1 space-y-2">
                    <button
                      type="button"
                      onClick={pickMainPhoto}
                      disabled={heroUploading}
                      className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-slate-50 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                    >
                      ⬆ {heroUploading ? "Enviando…" : draft.url ? "Trocar imagem" : "Fazer upload de imagem"}
                    </button>
                    <input
                      type="text"
                      value={draft.url}
                      placeholder="Ou cole a URL da imagem aqui"
                      onChange={(e) => patchDraft({ url: e.target.value })}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    />
                    <p className="text-[11px] text-slate-400">
                      JPG, PNG, WEBP ·{" "}
                      {draft.template === "overlay"
                        ? "Recomendado: foto larga (paisagem)"
                        : draft.template === "split"
                          ? "Recomendado: foto quadrada"
                          : "Recomendado: proporção 3/4 (retrato)"}
                    </p>
                  </div>
                </div>

                {/* Fotos extras — quantas o modelo aproveita (1 a 3) */}
                {maxPhotos > 1 && (
                  <div className="mt-3 space-y-2 rounded-xl border border-slate-200 bg-slate-50/60 p-3 dark:border-slate-700 dark:bg-slate-800/40">
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Este modelo fica ótimo com 1, 2{maxPhotos >= 3 ? " ou 3" : ""} fotos — o layout
                      se adapta automaticamente. Adicione mais se quiser (opcional).
                    </p>
                    <div className="flex flex-wrap gap-4">
                      {Array.from({ length: maxPhotos - 1 }).map((_, k) => (
                        <ExtraPhotoSlot
                          key={k}
                          label={`Foto ${k + 2}`}
                          url={draft.images?.[k] ?? ""}
                          disabled={heroUploading}
                          onPick={() => pickExtraPhoto(k)}
                          onRemove={() => removeExtraPhoto(k)}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Textos */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field
                  label="Título (primeira linha)"
                  value={draft.title ?? ""}
                  placeholder='Ex.: "Vista-se com"'
                  onChange={(v) => patchDraft({ title: v })}
                />
                <Field
                  label="Destaque (segunda linha — animado ✨)"
                  value={draft.highlight ?? ""}
                  placeholder='Ex.: "Muito Estilo"'
                  onChange={(v) => patchDraft({ highlight: v })}
                />
                <div className="sm:col-span-2">
                  <Field
                    label="Subtítulo"
                    value={draft.subtitle ?? ""}
                    placeholder="Descrição exibida abaixo do título"
                    onChange={(v) => patchDraft({ subtitle: v })}
                  />
                </div>
                <Field
                  label="Texto do badge"
                  value={draft.badge ?? ""}
                  placeholder='Ex.: "Nova Coleção 2026"'
                  onChange={(v) => patchDraft({ badge: v })}
                />
                <Field
                  label="Ordem"
                  value={String(draftOrder)}
                  type="number"
                  onChange={(v) => setDraftOrder(Math.max(1, Number(v) || 1))}
                />
                <Field
                  label="Texto do botão"
                  value={draft.ctaLabel ?? ""}
                  placeholder="Ver coleção"
                  onChange={(v) => patchDraft({ ctaLabel: v })}
                />
                <Field
                  label="Link do botão"
                  value={draft.ctaHref ?? ""}
                  placeholder="/produtos"
                  mono
                  onChange={(v) => patchDraft({ ctaHref: v })}
                />
              </div>

              {/* Cor do botão + gradiente + altura (estilos gráficos) */}
              {graphic && (
                <>
                  {draft.template !== "strips" && draft.template !== "duo" && (
                    <div>
                      <Label>Gradiente de fundo</Label>
                      <div className="flex flex-wrap items-center gap-3">
                        {(
                          [
                            { key: "bgFrom" as const, label: "De", def: "#001C45" },
                            { key: "bgVia" as const, label: "Via", def: "#0064D2" },
                            { key: "bgTo" as const, label: "Até", def: "#0086FF" },
                          ]
                        ).map((c) => (
                          <label key={c.key} className="flex items-center gap-1.5">
                            <input
                              type="color"
                              value={draft[c.key] || c.def}
                              onChange={(e) => patchDraft({ [c.key]: e.target.value } as Partial<HeroSlide>)}
                              className="h-9 w-9 cursor-pointer rounded border border-slate-300 p-0.5 dark:border-slate-600"
                            />
                            <span className="text-xs text-slate-500 dark:text-slate-400">{c.label}</span>
                          </label>
                        ))}
                        <div
                          className="h-9 min-w-[120px] flex-1 rounded-lg"
                          style={{
                            background: `linear-gradient(to right, ${draft.bgFrom || "#001C45"}, ${draft.bgVia || "#0064D2"}, ${draft.bgTo || "#0086FF"})`,
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {draft.template !== "strips" && draft.template !== "duo" && (
                    <div>
                      <Label>
                        Altura do banner{" "}
                        <span className="font-normal text-slate-400">({draft.height ?? 360}px)</span>
                      </Label>
                      <input
                        type="range"
                        min={220}
                        max={560}
                        step={20}
                        value={draft.height ?? 360}
                        onChange={(e) => patchDraft({ height: Number(e.target.value) })}
                        className="w-full accent-landing-primary"
                      />
                      <div className="mt-2 flex flex-wrap gap-2">
                        {HEIGHT_PRESETS.map((h) => {
                          const active = (draft.height ?? 360) === h.v;
                          return (
                            <button
                              key={h.v}
                              type="button"
                              onClick={() => patchDraft({ height: h.v })}
                              className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                                active
                                  ? "border-landing-primary bg-landing-primary text-white"
                                  : "border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300"
                              }`}
                            >
                              {h.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div>
                    <Label>
                      {draft.template === "strips" || draft.template === "duo"
                        ? "Cor de destaque"
                        : "Cor do botão"}
                    </Label>
                    <div className="flex items-center gap-3">
                      <input
                        type="color"
                        value={draft.ctaBgColor || sf.themePrimary}
                        onChange={(e) => patchDraft({ ctaBgColor: e.target.value })}
                        className="h-9 w-9 cursor-pointer rounded border border-slate-300 p-0.5 dark:border-slate-600"
                      />
                      <span
                        className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold text-white shadow"
                        style={{ backgroundColor: draft.ctaBgColor || sf.themePrimary }}
                      >
                        {draftContent.ctaLabel} →
                      </span>
                      <button
                        type="button"
                        onClick={() => patchDraft({ ctaBgColor: undefined })}
                        className="text-xs text-slate-400 underline hover:text-slate-600"
                      >
                        Resetar
                      </button>
                    </div>
                  </div>
                </>
              )}

              {/* Posição da foto */}
              {usesPhotoSide(draft.template) && (
                <div>
                  <Label>Posição da foto</Label>
                  <div className="flex gap-2">
                    {(
                      [
                        { v: "left" as const, label: "← Esquerda" },
                        { v: "right" as const, label: "Direita →" },
                      ]
                    ).map((opt) => (
                      <button
                        key={opt.v}
                        type="button"
                        onClick={() => patchDraft({ photoSide: opt.v as HeroSplitPhotoSide })}
                        className={`rounded-lg border-2 px-4 py-2 text-sm font-semibold ${
                          draft.photoSide === opt.v
                            ? "border-landing-primary bg-teal-50 text-slate-800 dark:bg-teal-900/20 dark:text-slate-100"
                            : "border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Só a foto */}
              <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-slate-200 bg-slate-50/60 p-3 dark:border-slate-700 dark:bg-slate-800/40">
                <input
                  type="checkbox"
                  checked={draft.noText ?? false}
                  onChange={(e) => patchDraft({ noText: e.target.checked })}
                  className="mt-0.5 h-4 w-4 accent-landing-primary"
                />
                <span>
                  <span className="block text-xs font-semibold text-slate-800 dark:text-slate-100">
                    Banner só com a foto (sem texto)
                  </span>
                  <span className="block text-[11px] text-slate-500 dark:text-slate-400">
                    Mostra só a imagem, sem texto/estilo por cima. Use quando a foto já vem com os
                    dizeres embutidos.
                  </span>
                </span>
              </label>

              {/* Ações */}
              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={commitDraft}
                  disabled={saving || heroUploading}
                  className="rounded-xl bg-landing-primary px-6 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
                >
                  {saving ? "Salvando…" : draftIndex == null ? "Criar banner" : "Salvar alterações"}
                </button>
                <button
                  type="button"
                  onClick={closeForm}
                  className="rounded-xl border border-slate-300 px-6 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  Cancelar
                </button>
              </div>
            </div>

            {/* ---- Coluna da prévia ---- */}
            <div className="space-y-4">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Prévia em tempo real
              </p>
              <p className="rounded-lg bg-slate-100 px-3 py-2 text-[11px] text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                Veja como o banner fica <b>no computador</b> e <b>no celular</b> — escolha a
                imagem que fica boa nos dois formatos.
              </p>
              <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                💻 No computador
              </p>
              <BannerPreview
                slide={draft}
                content={draftContent}
                primary={sf.themePrimary}
                secondary={sf.themeSecondary}
                variant="desktop"
              />
              <p className="text-center text-[11px] text-slate-400">
                O gradiente animado do texto destaque e o brilho do botão aparecem na loja.
              </p>
              <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                📱 No celular
              </p>
              <BannerPreview
                slide={draft}
                content={draftContent}
                primary={sf.themePrimary}
                secondary={sf.themeSecondary}
                variant="mobile"
              />
            </div>
          </div>
        </div>
      )}

      {/* Tabela de banners */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
        {slides.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-3xl">🖼️</p>
            <p className="mt-2 text-sm font-medium text-slate-600 dark:text-slate-300">
              Nenhum banner ainda.
            </p>
            <p className="text-xs text-slate-400">Clique em “+ Novo banner” para criar o primeiro.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-400">
                  <th className="px-4 py-3 font-semibold">Prévia</th>
                  <th className="px-4 py-3 font-semibold">Título</th>
                  <th className="hidden px-4 py-3 font-semibold sm:table-cell">Link</th>
                  <th className="px-4 py-3 font-semibold">Ordem</th>
                  <th className="hidden px-4 py-3 font-semibold md:table-cell">Status</th>
                  <th className="px-4 py-3 text-right font-semibold">Ações</th>
                </tr>
              </thead>
              <tbody>
                {slides.map((slide, i) => {
                  const title = slide.title?.trim() || fallback.title || "(sem título)";
                  const highlight = slide.highlight?.trim();
                  const badge = slide.badge?.trim();
                  const link = slide.ctaHref?.trim() || sf.heroCtaHref || "#catalogo";
                  return (
                    <tr
                      key={`${slide.url}-${i}`}
                      className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60 dark:border-slate-800 dark:hover:bg-slate-800/40"
                    >
                      <td className="px-4 py-3">
                        <div className="relative h-11 w-16 overflow-hidden rounded-md ring-1 ring-slate-200 dark:ring-slate-700">
                          {slide.url ? (
                            <Image src={slide.url} alt="" fill className="object-cover" sizes="64px" />
                          ) : (
                            <div
                              className="h-full w-full"
                              style={{
                                background: `linear-gradient(120deg, ${slide.bgFrom || "#001C45"}, ${slide.bgTo || "#0086FF"})`,
                              }}
                            />
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-800 dark:text-slate-100">{title}</p>
                        {highlight && (
                          <p className="text-xs text-slate-500 dark:text-slate-400">{highlight}</p>
                        )}
                        {badge && (
                          <span className="mt-1 inline-block rounded bg-teal-50 px-1.5 py-0.5 text-[10px] font-bold uppercase text-teal-700 dark:bg-teal-900/30 dark:text-teal-300">
                            {badge}
                          </span>
                        )}
                      </td>
                      <td className="hidden px-4 py-3 font-mono text-xs text-slate-500 sm:table-cell dark:text-slate-400">
                        {link}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => moveSlide(i, -1)}
                            disabled={i === 0 || saving}
                            className="text-slate-400 disabled:opacity-30 hover:text-slate-700"
                            aria-label="Subir"
                          >
                            ▲
                          </button>
                          <span className="w-4 text-center text-slate-600 dark:text-slate-300">{i}</span>
                          <button
                            type="button"
                            onClick={() => moveSlide(i, 1)}
                            disabled={i === slides.length - 1 || saving}
                            className="text-slate-400 disabled:opacity-30 hover:text-slate-700"
                            aria-label="Descer"
                          >
                            ▼
                          </button>
                        </div>
                      </td>
                      <td className="hidden px-4 py-3 md:table-cell">
                        <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-700 dark:bg-green-900/30 dark:text-green-300">
                          ● Ativo
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => openEdit(i)}
                            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-800"
                            aria-label="Editar"
                          >
                            ✏️
                          </button>
                          <button
                            type="button"
                            onClick={() => removeSlide(i)}
                            disabled={saving}
                            className="rounded-lg p-2 text-red-500 hover:bg-red-50 disabled:opacity-50 dark:hover:bg-red-900/20"
                            aria-label="Remover"
                          >
                            🗑️
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Cards promocionais abaixo do banner */}
      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
            Cards abaixo do banner
          </p>
          {/* É AQUI que a loja diz "não quero" — apagar os cards não resolve,
              a lista vazia renasce com os modelos (ver `promoCardsFromDb`). */}
          <label className="flex items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-300">
            <input
              type="checkbox"
              checked={sf.promoCardsEnabled}
              onChange={(e) =>
                setSf((s) => ({ ...s, promoCardsEnabled: e.target.checked }))
              }
              className="h-4 w-4"
            />
            Mostrar na loja
          </label>
        </div>
        <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
          {sf.promoCardsEnabled
            ? `Faixa de cartões coloridos. Toque num modelo pronto para adicionar (${cards.length}/${MAX_PROMO_CARDS}).`
            : "A faixa está escondida na loja. Marque “Mostrar na loja” para exibi-la."}
        </p>

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
                style={{ backgroundImage: `linear-gradient(135deg, ${p.card.from}, ${p.card.to})` }}
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
              <div key={i} className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                <div className="mb-2 flex items-center justify-between">
                  <span
                    className="rounded-lg px-3 py-1.5 text-xs font-bold text-white"
                    style={{ backgroundImage: `linear-gradient(135deg, ${card.from}, ${card.to})` }}
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

                <div className="mb-2 flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">Cor:</span>
                  {PROMO_CARD_COLORS.map((col) => {
                    const active = card.from === col.from && card.to === col.to;
                    return (
                      <button
                        key={col.id}
                        type="button"
                        onClick={() => patchCard(i, { from: col.from, to: col.to })}
                        className={`h-6 w-6 rounded ${active ? "ring-2 ring-landing-primary ring-offset-1" : ""}`}
                        style={{ backgroundImage: `linear-gradient(135deg, ${col.from}, ${col.to})` }}
                        aria-label={`Cor ${col.id}`}
                      />
                    );
                  })}
                </div>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <Field label="Etiqueta" value={card.eyebrow} placeholder="🔥 Imperdível" onChange={(v) => patchCard(i, { eyebrow: v })} />
                  <Field label="Título" value={card.title} placeholder="Camisetas & Polos" onChange={(v) => patchCard(i, { title: v })} />
                  <Field label="Frase" value={card.subtitle} placeholder="A partir de R$ 39" onChange={(v) => patchCard(i, { subtitle: v })} />
                  <Field label="Texto do link" value={card.ctaLabel} placeholder="Explorar" onChange={(v) => patchCard(i, { ctaLabel: v })} />
                  <Field label="Link" value={card.href} placeholder="#catalogo" mono onChange={(v) => patchCard(i, { href: v })} />
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
          onChange={(e) => setSf((s) => ({ ...s, showCategoryNav: e.target.checked }))}
          className="h-5 w-5 accent-landing-primary"
        />
        <span>
          <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100">
            Mostrar menu de categorias no topo
          </span>
          <span className="block text-xs text-slate-500 dark:text-slate-400">
            Barra com as categorias abaixo do cabeçalho (aparece se você tiver categorias
            cadastradas).
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
          <Field label="Etiqueta" value={sf.heroSubtitle} placeholder="Bem-vindo à nossa loja" onChange={(v) => setSf((s) => ({ ...s, heroSubtitle: v }))} />
          <Field label="Título (vazio = nome da loja)" value={sf.heroTitle} placeholder="Nome da loja" onChange={(v) => setSf((s) => ({ ...s, heroTitle: v }))} />
          <Field label="Cupom" value={sf.heroCouponCode} placeholder="BEMVINDO10" onChange={(v) => setSf((s) => ({ ...s, heroCouponCode: v }))} />
          <Field label="Texto do botão" value={sf.heroCtaLabel} placeholder="Ver produtos" onChange={(v) => setSf((s) => ({ ...s, heroCtaLabel: v }))} />
          <Field label="Link do botão" value={sf.heroCtaHref} placeholder="#catalogo" mono onChange={(v) => setSf((s) => ({ ...s, heroCtaHref: v }))} />
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
          onClick={saveRest}
          disabled={saving}
          className="flex-1 rounded-xl bg-landing-primary py-3 font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          {saving ? "Salvando…" : "Salvar alterações"}
        </button>
      </div>

      {heroCrop && heroCropSrc && (
        <ProductImageCropModal
          imageSrc={heroCropSrc}
          sourceFileName={heroCrop.file.name}
          originalFile={heroCrop.file}
          aspect={heroCrop.ratio}
          title="Ajustar foto do banner"
          description="Enquadre a foto no formato do banner."
          confirmLabel="Usar este enquadramento"
          outputType="image/webp"
          outputMaxWidth={1920}
          onCancel={() => setHeroCrop(null)}
          onComplete={handleCropDone}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Componentes auxiliares                                            */
/* ------------------------------------------------------------------ */

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">{children}</p>
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
  onPick: () => void;
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
        <button
          type="button"
          onClick={onPick}
          disabled={disabled}
          className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200 disabled:opacity-50 dark:bg-slate-800 dark:text-slate-100"
        >
          {url ? "Trocar" : "Enviar"}
        </button>
      </div>
    </div>
  );
}

/** Campo de texto rotulado reutilizado nos formulários. */
function Field({
  label,
  value,
  placeholder,
  mono = false,
  type = "text",
  onChange,
}: {
  label: string;
  value: string;
  placeholder?: string;
  mono?: boolean;
  type?: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
        {label}
      </span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 ${
          mono ? "font-mono" : ""
        }`}
      />
    </label>
  );
}
