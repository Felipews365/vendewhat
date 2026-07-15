"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CategoryFormModal } from "@/components/CategoryFormModal";
import {
  HERO_RECOMMENDED_HEIGHT,
  HERO_RECOMMENDED_WIDTH,
  heroImageProportionWarning,
  announcementMinOrder,
  type HeroLayout,
  type HeroSplitPhotoSide,
  type ProductCardRatio,
  type StorefrontCategoryItem,
  type StorefrontSettings,
} from "@/lib/storefront";
import { AnnouncementBar, AnnouncementText } from "@/components/storefront/AnnouncementBar";
import { BlockRenderer } from "@/components/storefront/blocks";
import { createBlock } from "@/components/storefront/blocks/registry";
import {
  BLOCK_LIMITS,
  type ImageTextFeatureConfig,
  type StoreBlock,
} from "@/components/storefront/blocks/types";

/** Prévia na vitrine: produtos reais da loja + sempre um cartão “novo”. */
export type CatalogPreviewProduct = {
  id: string;
  name: string;
  price: number;
  imageUrl: string | null;
  /** Categoria do produto (igual à loja pública). */
  category: string | null;
  /** Formato do card deste produto; `null` = usa o padrão da loja (igual à loja pública). */
  cardRatio?: ProductCardRatio | null;
};

function formatBRL(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

/** ISO → valor de `<input type="datetime-local">` (no fuso do navegador). */
function isoToLocalInput(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

/** Valor de `<input type="datetime-local">` → ISO (vazio = ""). */
function localInputToIso(v: string): string {
  if (!v) return "";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString();
}

/** Valor aceito por <input type="color"> (#rrggbb). */
function hexForColorInput(raw: string): string {
  const s = raw.trim();
  if (/^#[0-9A-Fa-f]{6}$/i.test(s)) return s;
  if (/^#[0-9A-Fa-f]{3}$/i.test(s)) {
    const r = s[1];
    const g = s[2];
    const b = s[3];
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return "#ffffff";
}

type EditorPanel =
  | null
  | "logo"
  | "announcement"
  | "avisos"
  | "banner"
  | "texts"
  | "colors"
  | "socials"
  | "info"
  | "search"
  | "categories"
  | "blocks"
  | "footer";

/** Mede a imagem (URL ou blob) e avisa se a proporção não combina com o formato. */
function useHeroProportionWarning(
  src: string | null,
  layout: HeroLayout
): string | null {
  const [warning, setWarning] = useState<string | null>(null);
  useEffect(() => {
    if (!src) {
      setWarning(null);
      return;
    }
    let active = true;
    const img = new window.Image();
    img.onload = () => {
      if (active) {
        setWarning(
          heroImageProportionWarning(
            img.naturalWidth,
            img.naturalHeight,
            layout
          )
        );
      }
    };
    img.onerror = () => {
      if (active) setWarning(null);
    };
    img.src = src;
    return () => {
      active = false;
    };
  }, [src, layout]);
  return warning;
}

/**
 * Miniatura de uma foto do banner: preview + remover + aviso de proporção +
 * escolha do FORMATO daquela foto (fundo/ao lado e o lado). Cada foto é
 * independente — mudar uma não mexe nas outras.
 */
function HeroPhotoThumb({
  src,
  index,
  layout,
  photoSide,
  onRemove,
  onChangeLayout,
  onChangeSide,
}: {
  /** URL pública (foto salva) ou blob: (foto pendente). */
  src: string;
  index: number;
  layout: HeroLayout;
  photoSide: HeroSplitPhotoSide;
  onRemove: () => void;
  onChangeLayout: (layout: HeroLayout) => void;
  onChangeSide: (side: HeroSplitPhotoSide) => void;
}) {
  const warning = useHeroProportionWarning(src, layout);
  const isBlob = src.startsWith("blob:");
  return (
    <div className="w-28 shrink-0">
      <div
        className={`relative w-28 h-16 rounded-lg border overflow-hidden ${
          warning ? "border-amber-400 ring-1 ring-amber-300" : "border-slate-200"
        }`}
      >
        {isBlob ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt="" className="w-full h-full object-cover" />
        ) : (
          <Image src={src} alt="" fill className="object-cover" sizes="112px" />
        )}
        <span className="absolute top-0 left-0 w-5 h-5 bg-landing-primary text-white text-[10px] font-bold flex items-center justify-center">
          {index + 1}
        </span>
        <button
          type="button"
          onClick={onRemove}
          className="absolute top-0 right-0 w-5 h-5 bg-black/70 text-white text-xs leading-none"
          aria-label="Remover foto"
        >
          ×
        </button>
        {warning && (
          <span
            className="absolute bottom-0 left-0 right-0 bg-amber-400/90 text-amber-950 text-[9px] font-bold text-center leading-tight py-px"
            aria-hidden
          >
            pode cortar
          </span>
        )}
      </div>

      {/* Formato desta foto */}
      <div className="mt-1 grid grid-cols-2 gap-0.5">
        {(
          [
            { v: "overlay" as const, label: "Fundo" },
            { v: "split" as const, label: "Ao lado" },
          ]
        ).map((opt) => (
          <button
            key={opt.v}
            type="button"
            onClick={() => onChangeLayout(opt.v)}
            className={`rounded px-1 py-0.5 text-[10px] font-semibold border ${
              layout === opt.v
                ? "border-landing-primary bg-teal-50 text-slate-800"
                : "border-slate-200 bg-white text-slate-500"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
      {layout === "split" && (
        <div className="mt-0.5 grid grid-cols-2 gap-0.5">
          {(
            [
              { v: "left" as const, label: "◧ Esq" },
              { v: "right" as const, label: "Dir ◨" },
            ]
          ).map((opt) => (
            <button
              key={opt.v}
              type="button"
              onClick={() => onChangeSide(opt.v)}
              className={`rounded px-1 py-0.5 text-[10px] font-medium border ${
                photoSide === opt.v
                  ? "border-landing-primary bg-teal-50 text-slate-800"
                  : "border-slate-200 bg-white text-slate-500"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
      {warning && (
        <p className="mt-1 text-[9px] leading-tight text-amber-700">{warning}</p>
      )}
    </div>
  );
}

function PlusFab({
  label,
  onClick,
}: {
  label: string;
  onClick: (e: React.MouseEvent) => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick(e);
      }}
      className="absolute z-20 flex h-8 w-8 items-center justify-center rounded-full bg-landing-primary text-white text-xl font-light leading-none shadow-md ring-2 ring-white hover:scale-105 transition-transform"
    >
      +
    </button>
  );
}

function EditorSheet({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center sm:p-4 bg-slate-900/45 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Fechar"
        onClick={onClose}
      />
      <div
        className="relative w-full max-w-lg max-h-[88vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-white shadow-xl border border-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 flex items-center justify-between gap-2 border-b border-slate-100 bg-white px-4 py-3 z-10">
          <h2 className="text-base font-bold text-slate-800">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 text-lg leading-none"
            aria-label="Fechar"
          >
            ×
          </button>
        </div>
        <div className="p-4 space-y-4">{children}</div>
      </div>
    </div>
  );
}

export function StoreVisualEditor({
  storeName,
  storeSlug,
  storeLogoUrl,
  logoPreviewObjectUrl,
  logoRemoved,
  onLogoFile,
  onRemoveLogoClick,
  sf,
  setSf,
  heroPreviewTitle,
  bannerBgSrc,
  bannerInputRef,
  logoInputRef,
  bannerDrag,
  setBannerDrag,
  heroUploading,
  maxBannerPhotos,
  onSelectHeroPhotos,
  onRemoveHeroPhoto,
  setBullet,
  addBullet,
  removeBullet,
  catalogPreview = [],
  storeId = null,
  onAutoSaveStorefront,
}: {
  storeName: string;
  storeSlug: string;
  /** Upload de imagem de categoria (bucket product-images). */
  storeId?: string | null;
  storeLogoUrl: string | null;
  logoPreviewObjectUrl: string | null;
  logoRemoved: boolean;
  onLogoFile: (file: File | null) => void;
  onRemoveLogoClick: () => void;
  sf: StorefrontSettings;
  setSf: React.Dispatch<React.SetStateAction<StorefrontSettings>>;
  heroPreviewTitle: string;
  bannerBgSrc: string | null | undefined;
  bannerInputRef: React.RefObject<HTMLInputElement | null>;
  logoInputRef: React.RefObject<HTMLInputElement | null>;
  bannerDrag: boolean;
  setBannerDrag: (v: boolean) => void;
  /** True enquanto envia fotos do banner (mostra carregando). */
  heroUploading: boolean;
  /** Quantas fotos o plano da loja permite no banner. */
  maxBannerPhotos: number;
  /** Recebe as fotos escolhidas (abre o ajuste/recorte antes de enviar). */
  onSelectHeroPhotos: (files: FileList | File[]) => void;
  onRemoveHeroPhoto: (photoIndex: number) => void;
  setBullet: (i: number, value: string) => void;
  addBullet: () => void;
  removeBullet: (i: number) => void;
  /** Produtos reais (até ~32 na prévia); no fim aparece sempre um slot “Adicione aqui”. */
  catalogPreview?: CatalogPreviewProduct[];
  /**
   * Persiste a vitrine no banco imediatamente (sem esperar “Salvar loja”).
   * Usado ao salvar/excluir uma categoria pelo modal.
   */
  onAutoSaveStorefront?: (next: StorefrontSettings) => void;
}) {
  const router = useRouter();
  const [panel, setPanel] = useState<EditorPanel>(null);
  /** Menu único "Configurações da loja" (lista todas as seções num lugar só). */
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false);
  /** Abre a página dedicada de edição do banner (em vez de um modal). */
  const openBannerEditor = () => router.push("/dashboard/banner");
  /** Abre a página dedicada dos cards promo (aba própria, fora do banner). */
  const openPromoCardsEditor = () => router.push("/dashboard/cards");
  /** Abre a página dedicada dos stories (bolinha flutuante da loja). */
  const openStoriesEditor = () => router.push("/dashboard/stories");
  /** Abre uma seção do editor pelo menu de configurações (fecha o menu antes). */
  const openSection = (p: EditorPanel) => {
    setSettingsMenuOpen(false);
    setPanel(p);
  };
  /**
   * Deep-link por hash na URL (ex.: outra tela manda o lojista direto para o
   * cadastro do Pix). `#pix`/`#pagamentos` abrem o painel "Pix, pagamentos e
   * rodapé"; roda uma vez ao montar.
   */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash.replace("#", "").toLowerCase();
    const hashToPanel: Record<string, EditorPanel> = {
      pix: "footer",
      pagamentos: "footer",
    };
    const target = hashToPanel[hash];
    if (target) {
      setPanel(target);
      document
        .getElementById("passo-configuracoes")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [storeCategoryModal, setStoreCategoryModal] = useState<{
    open: boolean;
    editIndex: number | null;
  }>({ open: false, editIndex: null });

  const heroPhotoCount = sf.heroSlides.length;
  const heroSlotsFull = heroPhotoCount >= maxBannerPhotos;

  /**
   * A prévia PASSA as fotos como a loja (mesmos 5,5s do `HeroBannerBlock`), em vez
   * de congelar na 1ª — o selo "N fotos passando" prometia isso e não cumpria.
   * Cada foto tem seu próprio formato, então layout/lado saem do slide ATIVO.
   */
  const [previewIdx, setPreviewIdx] = useState(0);
  const slidesKey = useMemo(
    () => sf.heroSlides.map((s) => s.url).join("|"),
    [sf.heroSlides]
  );
  // Trocou/reordenou as fotos: volta para a 1ª (o índice antigo apontaria para outra).
  useEffect(() => {
    setPreviewIdx(0);
  }, [slidesKey]);
  useEffect(() => {
    if (heroPhotoCount <= 1) return;
    const t = setInterval(
      () => setPreviewIdx((i) => (i + 1) % heroPhotoCount),
      5500
    );
    return () => clearInterval(t);
  }, [heroPhotoCount]);

  const activeSlideIdx =
    heroPhotoCount > 0 ? Math.min(previewIdx, heroPhotoCount - 1) : 0;
  const activeSlide = sf.heroSlides[activeSlideIdx];
  /** Foto do slide ativo; sem fotos, cai no que a página passou. */
  const bannerPhoto = activeSlide?.url ?? bannerBgSrc ?? null;
  const previewLayout: HeroLayout = activeSlide?.layout ?? sf.heroLayout;
  const previewSide: HeroSplitPhotoSide =
    activeSlide?.photoSide ?? sf.heroSplitPhotoSide;

  /** Muda o formato de UMA foto (não afeta as outras). */
  const setSlideLayout = (i: number, layout: HeroLayout) =>
    setSf((s) => ({
      ...s,
      heroSlides: s.heroSlides.map((sl, j) =>
        j === i ? { ...sl, layout } : sl
      ),
    }));
  const setSlideSide = (i: number, photoSide: HeroSplitPhotoSide) =>
    setSf((s) => ({
      ...s,
      heroSlides: s.heroSlides.map((sl, j) =>
        j === i ? { ...sl, photoSide } : sl
      ),
    }));

  const MAX_CATALOG_PREVIEW = 32;
  const productsInPreview = catalogPreview.slice(0, MAX_CATALOG_PREVIEW);
  /** Sempre um cartão vazio à direita para cadastrar o próximo produto. */
  const previewSlots: (CatalogPreviewProduct | null)[] = [
    ...productsInPreview,
    null,
  ];

  const labeledStoreCategories = useMemo(
    () =>
      sf.categories
        .map((c, i) => ({ ...c, i }))
        .filter((c) => c.label.trim()),
    [sf.categories]
  );

  /** Nomes das outras categorias (para “Categoria pai” no modal). */
  const storeCategoryParentOptions = useMemo(() => {
    const seen = new Set<string>();
    const labels: string[] = [];
    for (const c of sf.categories) {
      const L = c.label.trim();
      if (!L) continue;
      const key = L.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      labels.push(L);
    }
    const idx = storeCategoryModal.editIndex;
    if (idx === null || idx < 0 || idx >= sf.categories.length) {
      return labels;
    }
    const self = sf.categories[idx]?.label.trim();
    if (!self) return labels;
    return labels.filter(
      (l) => l.localeCompare(self, "pt", { sensitivity: "base" }) !== 0
    );
  }, [sf.categories, storeCategoryModal.editIndex]);

  const editorCategoryPlaceholders = Math.max(
    0,
    4 - Math.min(labeledStoreCategories.length, 4)
  );

  /** Troca a categoria de posição (−1 = sobe, +1 = desce) e salva na hora. */
  const moveStoreCategory = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= sf.categories.length) return;
    const next = [...sf.categories];
    [next[i], next[j]] = [next[j]!, next[i]!];
    const nextSf: StorefrontSettings = { ...sf, categories: next };
    setSf(nextSf);
    onAutoSaveStorefront?.(nextSf);
  };

  /* ---- Blocos de conteúdo (builder) — hoje só "Destaque com imagem + texto" ---- */
  const contentBlocks = sf.contentBlocks;
  const FEAT = BLOCK_LIMITS.imageTextFeature;

  const addFeatureBlock = () =>
    setSf((s) => ({
      ...s,
      contentBlocks: [...s.contentBlocks, createBlock("imageTextFeature")],
    }));

  /** Atualiza a config de um bloco (merge raso). */
  const patchBlockConfig = (id: string, patch: Record<string, unknown>) =>
    setSf((s) => ({
      ...s,
      contentBlocks: s.contentBlocks.map((b) =>
        b.id === id
          ? ({ ...b, config: { ...b.config, ...patch } } as StoreBlock)
          : b
      ),
    }));

  const removeBlock = (id: string) =>
    setSf((s) => ({
      ...s,
      contentBlocks: s.contentBlocks.filter((b) => b.id !== id),
    }));

  /** Sobe (−1) ou desce (+1) um bloco na ordem. */
  const moveBlock = (id: string, dir: -1 | 1) =>
    setSf((s) => {
      const i = s.contentBlocks.findIndex((b) => b.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= s.contentBlocks.length) return s;
      const next = [...s.contentBlocks];
      [next[i], next[j]] = [next[j]!, next[i]!];
      return { ...s, contentBlocks: next };
    });

  /** Vars de cor da loja para a prévia dos blocos combinar com o tema. */
  const previewColorVars = {
    ["--store-primary"]: sf.themePrimary,
    ["--store-secondary"]: sf.themeSecondary,
  } as CSSProperties;

  const displayLogo =
    logoPreviewObjectUrl ||
    (!logoRemoved && storeLogoUrl ? storeLogoUrl : null);

  /**
   * Capas das bolinhas de story no mostruário — mesma cascata da loja
   * (`StoreStories`): foto do produto anunciado → a própria mídia (se for foto)
   * → a logo. Vídeo não vira miniatura sem canvas, daí a cascata.
   */
  const storyCovers = useMemo(
    () =>
      sf.stories.slice(0, 4).map((s) => {
        const prod = s.productId
          ? catalogPreview.find((p) => p.id === s.productId)
          : null;
        return (
          prod?.imageUrl ||
          (s.mediaType === "image" ? s.mediaUrl : null) ||
          displayLogo ||
          null
        );
      }),
    [sf.stories, catalogPreview, displayLogo]
  );

  const announcementText =
    sf.heroSubtitle.trim() ||
    "Texto informativo para seus clientes (curto): frete, promoções…";

  // Avisos da barra do topo, montados igual à loja pública: o pedido mínimo
  // entra automático na frente (ver `announcementMinOrder`) + os do lojista.
  const announcementPreviewItems = useMemo(() => {
    const min = announcementMinOrder(sf);
    return min ? [min, ...sf.announcements] : sf.announcements;
  }, [sf]);

  return (
    <div className="space-y-4">
      {/* Barra estilo “montador” */}
      <div className="rounded-xl border border-slate-200 bg-white px-3 sm:px-4 py-2.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 shadow-sm overflow-x-auto overflow-y-visible">
        <div className="flex items-center gap-2 min-w-0 flex-1 sm:flex-initial">
          <span className="font-bold text-landing-primary text-sm shrink-0">
            VendeWhat
          </span>
          <span className="text-slate-300">|</span>
          <nav className="flex flex-wrap items-center gap-3 text-xs font-semibold text-slate-600">
            <span className="text-landing-primary border-b-2 border-landing-primary pb-px">
              Loja
            </span>
            <Link
              href="/dashboard/produtos/novo"
              className="hover:text-landing-primary transition-colors"
            >
              Cadastrar
            </Link>
            <span className="text-slate-400 cursor-default" title="Você já está aqui">
              Configurar
            </span>
            <Link
              href="/dashboard/produtos"
              className="hover:text-landing-primary transition-colors"
            >
              Gerenciar
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-2 text-slate-400 text-xs shrink-0 pl-1">
          <span className="hidden sm:inline truncate max-w-[min(180px,28vw)] text-slate-500">
            {storeName}
          </span>
        </div>
      </div>

      <p className="text-xs text-slate-500">
        Clique nos botões <strong className="text-landing-primary">+</strong> para
        editar cada parte. A área abaixo é como a loja pública — o que mudar aqui
        precisa de <strong>Salvar</strong> no final da página.
      </p>

      {/* Botão único que reúne todas as configurações da loja num menu só. */}
      <div className="relative scroll-mt-28" id="passo-configuracoes">
        <button
          type="button"
          onClick={() => setSettingsMenuOpen((v) => !v)}
          aria-expanded={settingsMenuOpen}
          className="flex w-full items-center justify-between gap-2 rounded-xl border border-landing-primary/30 bg-landing-primary px-4 py-3 text-sm font-bold text-white shadow-sm hover:opacity-95 sm:w-auto"
        >
          <span className="flex items-center gap-2">
            <span aria-hidden>⚙️</span> Configurações da loja
          </span>
          <span aria-hidden className={settingsMenuOpen ? "rotate-180 transition-transform" : "transition-transform"}>▾</span>
        </button>
        <p className="mt-1 text-[11px] text-slate-500">
          Tudo num lugar só: Pix e pagamentos, banner, cores, categorias, rodapé…
        </p>

        {settingsMenuOpen && (
          <>
            {/* Fundo para fechar ao clicar fora. */}
            <button
              type="button"
              aria-label="Fechar menu"
              onClick={() => setSettingsMenuOpen(false)}
              className="fixed inset-0 z-30 cursor-default"
            />
            <div className="absolute left-0 top-full z-40 mt-2 w-full max-w-sm overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
              <div className="max-h-[70vh] overflow-y-auto py-1">
                {(
                  [
                    { emoji: "💳", label: "Pix, pagamentos e rodapé", onClick: () => openSection("footer") },
                    { emoji: "🖼️", label: "Logo da loja", onClick: () => openSection("logo") },
                    { emoji: "🎞️", label: "Banner da loja", onClick: () => { setSettingsMenuOpen(false); openBannerEditor(); } },
                    { emoji: "🏷️", label: "Cards abaixo do banner", onClick: () => { setSettingsMenuOpen(false); openPromoCardsEditor(); } },
                    { emoji: "🎬", label: "Stories da loja", onClick: () => { setSettingsMenuOpen(false); openStoriesEditor(); } },
                    { emoji: "✍️", label: "Textos do banner", onClick: () => openSection("texts") },
                    { emoji: "🎨", label: "Aparência da loja", onClick: () => { setSettingsMenuOpen(false); router.push("/dashboard/aparencia"); } },
                    { emoji: "📢", label: "Barra de avisos do topo", onClick: () => openSection("avisos") },
                    { emoji: "🔎", label: "Barra de busca", onClick: () => openSection("search") },
                    { emoji: "ℹ️", label: "Informações abaixo do logo", onClick: () => openSection("info") },
                    { emoji: "🔗", label: "Redes sociais", onClick: () => openSection("socials") },
                    { emoji: "🏷️", label: "Categorias na loja", onClick: () => openSection("categories") },
                    { emoji: "✨", label: "Blocos de destaque", onClick: () => openSection("blocks") },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    onClick={item.onClick}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50"
                  >
                    <span aria-hidden className="text-base">{item.emoji}</span>
                    <span className="font-medium">{item.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Canvas da vitrine — sem overflow-hidden no pai para não recortar os botões + */}
      <div className="rounded-2xl border-2 border-slate-200 bg-[#f5f5f5] shadow-inner">
        {/* Barra de avisos: é o 1º elemento da loja pública, então é o 1º do canvas.
            Usa o MESMO componente da loja (rola de verdade, com o pedido mínimo na
            frente) — o lojista vê aqui exatamente o que o cliente vê. */}
        <div className="relative" id="passo-avisos">
          <button
            type="button"
            onClick={() => setPanel("avisos")}
            className="block w-full overflow-hidden rounded-t-2xl text-left ring-inset hover:ring-2 hover:ring-landing-primary/50 transition-shadow"
            title="Editar barra de avisos"
          >
            {sf.announcementBarEnabled && announcementPreviewItems.length > 0 ? (
              <AnnouncementBar
                items={announcementPreviewItems}
                bg={sf.announcementBarBg}
              />
            ) : (
              // Desligada/vazia continua clicável: é daqui que ele liga de volta.
              <span className="block w-full bg-slate-100 py-2 text-center text-[11px] text-slate-400">
                Barra de avisos do topo desligada — toque para configurar
              </span>
            )}
          </button>
          <div className="absolute top-1/2 -translate-y-1/2 right-2">
            <PlusFab
              label="Editar barra de avisos"
              onClick={() => setPanel("avisos")}
            />
          </div>
        </div>

        <div
          className="border-b border-slate-100 px-3 py-3 sm:px-4"
          style={{ backgroundColor: sf.headerBackground }}
        >
          <div className="flex flex-col sm:flex-row sm:items-start gap-3">
            {/* Logo */}
            <div className="relative shrink-0">
              <button
                type="button"
                id="passo-logo"
                onClick={() => logoInputRef.current?.click()}
                className="relative flex h-[72px] w-[72px] sm:h-20 sm:w-20 items-center justify-center rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 text-center overflow-hidden hover:border-landing-primary/50 transition-colors"
              >
                {displayLogo ? (
                  displayLogo.startsWith("blob:") ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={displayLogo}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <Image
                      src={displayLogo}
                      alt=""
                      width={80}
                      height={80}
                      className="object-cover w-full h-full"
                    />
                  )
                ) : (
                  <span className="text-[10px] text-slate-400 px-1 leading-tight">
                    Adicione sua logo
                  </span>
                )}
              </button>
              <div className="absolute -top-1 -right-1">
                <PlusFab
                  label="Editar logo"
                  onClick={() => setPanel("logo")}
                />
              </div>
              <input
                ref={logoInputRef as React.Ref<HTMLInputElement>}
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  onLogoFile(f);
                  e.target.value = "";
                }}
              />
            </div>

            {/* Busca + atalhos — pr reserva espaço para o + sem encostar na borda */}
            <div className="flex-1 min-w-0 space-y-2 pr-2 sm:pr-3">
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm pointer-events-none z-10">
                  ⌕
                </span>
                <div
                  className="flex items-center w-full rounded-full border-2 border-slate-300 bg-white px-3 py-2 pl-10 pr-10 text-sm text-slate-500 shadow-sm cursor-default min-h-[42px]"
                  id="passo-busca"
                >
                  <span className="truncate flex-1">
                    {sf.searchPlaceholder || "Faça sua busca"}
                  </span>
                </div>
                <div className="absolute -top-1 right-0">
                  <PlusFab
                    label="Editar busca"
                    onClick={() => setPanel("search")}
                  />
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
                <span className="inline-flex items-center gap-1.5 opacity-60">
                  <span className="h-2 w-2 rounded-full bg-slate-300" />
                  Ativos
                </span>
                <span className="inline-flex items-center gap-1.5 opacity-60">
                  <span className="h-2 w-2 rounded-full border border-slate-300" />
                  Inativos
                </span>
                <span className="text-slate-400">(só na loja pública)</span>
              </div>
            </div>
          </div>

          {/* Linha informativa */}
          <div className="relative mt-3 rounded-lg bg-slate-50 border border-slate-100 px-3 py-2 pr-12">
            <button
              type="button"
              onClick={() => setPanel("announcement")}
              className="w-full text-left text-xs text-slate-600 line-clamp-2 hover:text-slate-800"
            >
              {announcementText}
            </button>
            <div className="absolute top-1/2 -translate-y-1/2 right-2">
              <PlusFab
                label="Editar texto informativo"
                onClick={() => setPanel("announcement")}
              />
            </div>
          </div>
        </div>

        {/* Banner */}
        <div className="p-3 sm:p-4 bg-[#f0f0f0]">
          <input
            ref={bannerInputRef as React.Ref<HTMLInputElement>}
            type="file"
            accept="image/*"
            multiple
            className="sr-only"
            aria-hidden
            onChange={(e) => {
              if (e.target.files?.length) onSelectHeroPhotos(e.target.files);
              e.target.value = "";
            }}
          />
          <div className="relative" id="passo-banner">
            <button
              type="button"
              className={`relative w-full aspect-[16/9] min-h-[88px] sm:aspect-[2/1] md:aspect-[21/9] rounded-xl overflow-hidden border-2 text-left transition-all shadow-sm group focus:outline-none focus-visible:ring-2 focus-visible:ring-landing-primary focus-visible:ring-offset-2 ${
                bannerDrag
                  ? "border-landing-primary bg-teal-50 scale-[1.01]"
                  : "border-slate-200 hover:border-landing-primary/50 bg-slate-200/80"
              }`}
              onClick={openBannerEditor}
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setBannerDrag(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setBannerDrag(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setBannerDrag(false);
                if (e.dataTransfer.files?.length)
                  onSelectHeroPhotos(e.dataTransfer.files);
              }}
            >
              {(() => {
                // `key` no índice = remonta a cada troca, disparando a mesma
                // transição de entrada (`vw-banner-in`) que a loja usa.
                const photoEl = bannerPhoto ? (
                  bannerPhoto.startsWith("blob:") ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={activeSlideIdx}
                      src={bannerPhoto}
                      alt=""
                      className="vw-banner-in absolute inset-0 w-full h-full object-cover"
                    />
                  ) : (
                    <Image
                      key={activeSlideIdx}
                      src={bannerPhoto}
                      alt=""
                      fill
                      className="vw-banner-in object-cover"
                      sizes="(max-width: 896px) 100vw, 896px"
                    />
                  )
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500 gap-1">
                    <span className="text-2xl opacity-50" aria-hidden>
                      🖼
                    </span>
                    <span className="text-xs font-medium px-2 text-center">
                      Banner opcional
                    </span>
                    <span className="text-[10px] px-2 text-center text-slate-400">
                      Toque para adicionar fotos ou deixe só as cores
                    </span>
                  </div>
                );

                // Mesma regra da loja: o texto é o do slide ativo e, vazio, cai
                // no texto geral — senão a prévia passaria a foto 2 com o texto
                // da 1ª.
                const slideBadge =
                  activeSlide?.badge?.trim() || sf.heroSubtitle.trim();
                const slideTitle =
                  activeSlide?.title?.trim() || heroPreviewTitle;
                const slideCoupon =
                  activeSlide?.couponCode?.trim() || sf.heroCouponCode.trim();
                const slideCta =
                  activeSlide?.ctaLabel?.trim() || sf.heroCtaLabel || "Comprar";

                const textLines = (
                  <>
                    {slideBadge && (
                      <p className="text-[10px] font-medium tracking-wide uppercase text-white/90 drop-shadow line-clamp-1">
                        {slideBadge}
                      </p>
                    )}
                    <h3 className="text-base sm:text-xl font-bold text-white leading-tight mt-0.5 drop-shadow-lg line-clamp-2">
                      {slideTitle}
                    </h3>
                    {slideCoupon && (
                      <span className="mt-1.5 inline-flex self-start items-center gap-1 text-[9px] font-semibold uppercase tracking-wide text-white/85">
                        Cód.
                        <span className="px-1.5 py-0.5 rounded bg-white/20 border border-white/30 text-white">
                          {slideCoupon}
                        </span>
                      </span>
                    )}
                    <span
                      className="mt-2 inline-flex self-start px-2.5 py-1 rounded text-white text-[10px] font-bold uppercase shadow-md"
                      style={{ backgroundColor: sf.themePrimary }}
                    >
                      {slideCta}
                    </span>
                  </>
                );

                if (previewLayout === "split") {
                  const photoCol = (
                    <div className="relative w-1/2 h-full overflow-hidden">
                      {photoEl}
                    </div>
                  );
                  const textCol = (
                    <div
                      className="w-1/2 h-full flex flex-col justify-center p-3 sm:p-4"
                      style={{ backgroundColor: sf.themeSecondary }}
                    >
                      {textLines}
                    </div>
                  );
                  return (
                    <div className="absolute inset-0 flex">
                      {previewSide === "left" ? (
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
                  <>
                    {photoEl}
                    <div className="absolute inset-0 bg-gradient-to-r from-black/45 via-black/20 to-transparent pointer-events-none" />
                    <div className="absolute inset-0 flex flex-col justify-end p-3 sm:p-5 max-w-md pointer-events-none">
                      {textLines}
                    </div>
                  </>
                );
              })()}
            </button>
            <div className="absolute top-2 right-3 sm:top-3 sm:right-4 z-30">
              <PlusFab
                label="Gerenciar fotos do banner"
                onClick={openBannerEditor}
              />
            </div>
            {heroPhotoCount > 1 && (
              <span className="absolute top-2 left-3 sm:top-3 sm:left-4 z-30 px-2 py-0.5 rounded-full bg-black/55 text-white text-[10px] font-semibold backdrop-blur-sm">
                Foto {activeSlideIdx + 1} de {heroPhotoCount}
              </span>
            )}
          </div>

          {/* Cards promo — faixa logo abaixo do banner, como na loja. Têm aba
              própria (/dashboard/cards), então o clique leva para lá. */}
          {sf.promoCardsEnabled && sf.promoCards.length > 0 && (
            <div className="relative mt-3" id="passo-promo-cards">
              <button
                type="button"
                onClick={openPromoCardsEditor}
                title="Editar os cards abaixo do banner"
                className="grid w-full grid-cols-3 gap-2 rounded-xl p-1 text-left ring-offset-2 transition hover:ring-2 hover:ring-landing-primary/50"
              >
                {sf.promoCards.map((c, i) => (
                  <span
                    key={i}
                    className="flex min-h-[64px] flex-col justify-end overflow-hidden rounded-xl p-2 shadow-sm sm:min-h-[80px] sm:p-3"
                    style={{
                      // Mesma regra da loja: com tema escolhido o card segue as
                      // cores da loja; sem tema, as cores do próprio card.
                      backgroundImage: sf.themeId
                        ? `linear-gradient(135deg, ${sf.themeSecondary}, ${sf.themePrimary})`
                        : `linear-gradient(135deg, ${c.from}, ${c.to})`,
                    }}
                  >
                    {c.eyebrow && (
                      <span className="truncate text-[0.5rem] font-bold uppercase tracking-widest text-white/75 sm:text-[0.6rem]">
                        {c.eyebrow}
                      </span>
                    )}
                    <span className="truncate text-[11px] font-bold leading-snug text-white sm:text-sm">
                      <AnnouncementText text={c.title} />
                    </span>
                    {c.subtitle && (
                      <span className="truncate text-[9px] text-white/85 sm:text-[11px]">
                        {c.subtitle}
                      </span>
                    )}
                  </span>
                ))}
              </button>
              <div className="absolute -top-1 right-0">
                <PlusFab
                  label="Editar os cards abaixo do banner"
                  onClick={openPromoCardsEditor}
                />
              </div>
            </div>
          )}

          {/* Stories — MOSTRUÁRIO. Na loja é uma bolinha flutuante na lateral,
              não uma faixa; aqui vira uma linha e aparece SEMPRE (inclusive sem
              story nenhum e com a bolinha escondida), porque o objetivo é o
              lojista DESCOBRIR o recurso e chegar na aba própria — se só
              aparecesse quando já existisse story, ninguém acharia. */}
          <div className="relative mt-3" id="passo-stories">
            <button
              type="button"
              onClick={openStoriesEditor}
              title="Gerenciar os stories da loja"
              className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white p-2.5 text-left shadow-sm transition hover:ring-2 hover:ring-landing-primary/50"
            >
              {storyCovers.length > 0 ? (
                <span className="flex shrink-0 -space-x-2">
                  {storyCovers.map((cover, i) => (
                    <span
                      key={i}
                      className="rounded-full p-[2px]"
                      style={{
                        backgroundImage: `linear-gradient(135deg, ${sf.themePrimary}, #f472b6)`,
                      }}
                    >
                      <span className="block rounded-full bg-white p-[1px]">
                        {cover ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={cover}
                            alt=""
                            className="h-9 w-9 rounded-full object-cover"
                          />
                        ) : (
                          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-sm">
                            🎬
                          </span>
                        )}
                      </span>
                    </span>
                  ))}
                </span>
              ) : (
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 border-dashed border-slate-300 text-base">
                  🎬
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block text-[11px] font-semibold text-slate-800 sm:text-xs">
                  Stories da loja
                </span>
                <span className="block text-[10px] leading-snug text-slate-500 sm:text-[11px]">
                  {!sf.storiesEnabled
                    ? "Escondidos na loja no momento."
                    : sf.stories.length === 0
                      ? sf.storiesAutoFromProducts
                        ? "Seus produtos com vídeo já aparecem numa bolinha na loja, com o botão “Ver produto”."
                        : "Grave um vídeo do produto — ele vira uma bolinha na sua loja, com o botão “Ver produto”."
                      : `${sf.stories.length} ${sf.stories.length === 1 ? "story" : "stories"}${
                          sf.storiesAutoFromProducts
                            ? " + os produtos novos com vídeo"
                            : ""
                        }, numa bolinha na lateral da loja.`}
                </span>
              </span>
              <span className="shrink-0 text-[10px] font-semibold text-landing-primary sm:text-[11px]">
                {sf.stories.length === 0 ? "Criar →" : "Editar →"}
              </span>
            </button>
          </div>
        </div>

        {/* Categorias — prévia estilo vitrine; na loja pública só aparece o que existir nos produtos */}
        <div className="bg-white border-t border-slate-200 flex min-w-0">
          <div
            className="w-1 shrink-0 bg-landing-primary rounded-r-sm"
            aria-hidden
          />
          <div className="flex-1 min-w-0 py-4 px-3 sm:px-4">
            <div className="flex items-center justify-between gap-2 mb-3">
              <h3 className="text-sm font-bold text-slate-800 tracking-tight">
                Categorias
              </h3>
              <button
                type="button"
                onClick={() => setPanel("categories")}
                className="text-xs font-semibold text-landing-primary hover:underline shrink-0"
              >
                Lista completa
              </button>
            </div>
            <div
              className="flex gap-4 sm:gap-5 overflow-x-auto pb-1 -mx-0.5 px-0.5 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
              role="list"
            >
              {labeledStoreCategories.map((cat) => (
                <button
                  key={cat.i}
                  type="button"
                  onClick={() =>
                    setStoreCategoryModal({ open: true, editIndex: cat.i })
                  }
                  role="listitem"
                  className="flex flex-col items-center shrink-0 w-[4.5rem] sm:w-[5rem] group text-center"
                >
                  <div className="relative w-[4rem] h-[4rem] sm:w-[4.5rem] sm:h-[4.5rem]">
                    <div className="absolute inset-0 rounded-full bg-slate-200 overflow-hidden ring-2 ring-slate-100 shadow-sm transition-transform group-hover:scale-[1.03] flex items-center justify-center">
                      {cat.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={cat.imageUrl}
                          alt=""
                          className="absolute inset-0 h-full w-full object-cover object-center"
                        />
                      ) : null}
                    </div>
                    <span
                      className="absolute -top-0.5 -right-0.5 z-10 flex h-6 w-6 items-center justify-center rounded-full text-white text-base font-light leading-none shadow-md ring-2 ring-white"
                      style={{ backgroundColor: sf.themePrimary }}
                      aria-hidden
                    >
                      +
                    </span>
                  </div>
                  <span className="mt-2 text-center text-[11px] text-slate-500 leading-tight max-w-[5rem] line-clamp-2">
                    {cat.label}
                  </span>
                </button>
              ))}
              {Array.from({ length: editorCategoryPlaceholders }).map(
                (_, ei) => (
                  <button
                    key={`ph-${ei}`}
                    type="button"
                    onClick={() =>
                      setStoreCategoryModal({ open: true, editIndex: null })
                    }
                    className="flex flex-col items-center shrink-0 w-[4.5rem] sm:w-[5rem] group text-center"
                    title="Adicionar categoria"
                  >
                    <div className="relative w-[4rem] h-[4rem] sm:w-[4.5rem] sm:h-[4.5rem]">
                      <div className="absolute inset-0 rounded-full border-2 border-dashed border-slate-300 bg-slate-50 flex items-center justify-center transition-colors group-hover:border-landing-primary/50 group-hover:bg-teal-50/40">
                        <span className="text-slate-400 text-2xl font-light leading-none group-hover:text-landing-primary">
                          +
                        </span>
                      </div>
                    </div>
                    <span className="mt-2 text-center text-[11px] text-slate-400 leading-tight max-w-[5rem]">
                      Adicionar
                    </span>
                  </button>
                )
              )}
              {labeledStoreCategories.length >= 4 &&
                labeledStoreCategories.length < 8 && (
                  <button
                    type="button"
                    onClick={() =>
                      setStoreCategoryModal({ open: true, editIndex: null })
                    }
                    className="flex flex-col items-center shrink-0 w-[4.5rem] sm:w-[5rem] group text-center"
                    title="Nova categoria"
                  >
                    <div className="relative w-[4rem] h-[4rem] sm:w-[4.5rem] sm:h-[4.5rem]">
                      <div className="absolute inset-0 rounded-full border-2 border-dashed border-slate-300 bg-slate-50 flex items-center justify-center transition-colors group-hover:border-landing-primary/50 group-hover:bg-teal-50/40">
                        <span className="text-slate-400 text-lg font-light group-hover:text-landing-primary">
                          +
                        </span>
                      </div>
                    </div>
                    <span className="mt-2 text-[11px] text-slate-400">Nova</span>
                  </button>
                )}
            </div>
          </div>
        </div>

        {/* Produtos */}
        <div className="bg-white px-3 py-4 sm:px-4 border-t border-slate-200">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-bold text-slate-800">Produtos</span>
            <span className="text-[11px] text-slate-400">Ordenar ▼</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {previewSlots.map((product) => {
              if (product) {
                const href = `/dashboard/produtos/${product.id}`;
                // Mesma regra da loja: o formato do produto manda; sem formato
                // próprio, vale o padrão da loja (`productCardRatio`).
                const ratioClass =
                  (product.cardRatio ?? sf.productCardRatio) === "1:1"
                    ? "aspect-square"
                    : "aspect-[3/4]";
                return (
                  <Link
                    key={product.id}
                    href={href}
                    className="relative rounded-xl border border-slate-200 bg-slate-50 p-2 hover:border-landing-primary/40 transition-colors text-center group"
                  >
                    <div className="absolute top-1.5 right-1.5 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-landing-primary text-white text-sm font-light shadow ring-1 ring-white pointer-events-none">
                      +
                    </div>
                    <div
                      className={`relative ${ratioClass} rounded-lg bg-slate-200/90 overflow-hidden mb-1.5`}
                    >
                      {product.imageUrl ? (
                        <Image
                          src={product.imageUrl}
                          alt=""
                          fill
                          className="object-cover"
                          sizes="(max-width: 640px) 45vw, 180px"
                        />
                      ) : (
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                          <span className="text-[10px] text-slate-500 px-1 text-center">
                            Sem foto — edite o produto
                          </span>
                        </div>
                      )}
                    </div>
                    <p className="text-[10px] text-slate-700 font-medium truncate">
                      {product.name}
                    </p>
                    <p className="text-[10px] font-semibold text-slate-800">
                      {formatBRL(product.price)}
                    </p>
                    <span
                      className="mt-1.5 block w-full py-1 rounded text-[10px] font-bold text-white"
                      style={{ backgroundColor: sf.themePrimary }}
                    >
                      Comprar
                    </span>
                  </Link>
                );
              }
              return (
                <Link
                  key="slot-novo-produto"
                  href="/dashboard/produtos/novo"
                  className="relative rounded-xl border border-slate-200 bg-slate-50 p-2 hover:border-landing-primary/40 transition-colors text-center group"
                >
                  <div className="absolute top-1.5 right-1.5 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-landing-primary text-white text-sm font-light shadow ring-1 ring-white">
                    +
                  </div>
                  {/* Slot vazio segue o padrão da loja, senão ficaria torto ao lado dos outros. */}
                  <div
                    className={`${
                      sf.productCardRatio === "1:1"
                        ? "aspect-square"
                        : "aspect-[3/4]"
                    } rounded-lg bg-slate-200/90 flex flex-col items-center justify-center mb-1.5`}
                  >
                    <span className="text-[10px] text-slate-500 px-1">
                      Adicione aqui
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-500 truncate">
                    Nome do produto
                  </p>
                  <p className="text-[10px] font-semibold text-slate-700">
                    R$ 0,00
                  </p>
                  <span
                    className="mt-1.5 block w-full py-1 rounded text-[10px] font-bold text-white"
                    style={{ backgroundColor: sf.themePrimary }}
                  >
                    Comprar
                  </span>
                </Link>
              );
            })}
          </div>
          <p className="text-[11px] text-slate-500 text-center mt-3">
            A foto e o preço vêm dos produtos reais. Toque num card para editar;
            o último cartão &quot;Adicione aqui&quot; sempre abre o cadastro de um
            novo — quando salvar, ele entra na lista e aparece outro vazio.
          </p>
        </div>

        {/* Blocos de destaque (conteúdo extra abaixo dos produtos) */}
        <div className="relative bg-white border-t border-slate-200">
          <div className="absolute top-2 right-2 z-20">
            <PlusFab
              label="Gerenciar blocos de destaque"
              onClick={() => setPanel("blocks")}
            />
          </div>
          {contentBlocks.length === 0 ? (
            <button
              type="button"
              onClick={() => setPanel("blocks")}
              className="w-full px-3 py-6 text-center text-xs font-medium text-slate-500 hover:bg-slate-50"
            >
              <span className="text-lg">✨</span>
              <span className="mt-1 block">
                Adicionar bloco de destaque (imagem + texto)
              </span>
            </button>
          ) : (
            <div style={previewColorVars}>
              {contentBlocks.map((block) => (
                <BlockRenderer key={block.id} block={block} editing />
              ))}
            </div>
          )}
        </div>

        {/* Rodapé comercial (abaixo dos produtos na loja pública) */}
        <div className="relative bg-stone-50/95 border-t border-slate-200 px-3 py-3 sm:px-4">
          <div className="absolute top-2 right-2 z-20">
            <PlusFab
              label="Editar Pix, pagamentos e rodapé"
              onClick={() => setPanel("footer")}
            />
          </div>
          <p className="text-[10px] font-bold text-slate-800 uppercase tracking-wide pr-12 mb-1.5">
            Rodapé da vitrine
          </p>
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 text-[9px] text-slate-600">
            <span className="flex items-center gap-1 min-w-0">
              <span aria-hidden>🚚</span>
              <span className="truncate">
                {sf.footerShippingLine.trim() || "Frete e envio (configure)"}
              </span>
            </span>
            <span className="hidden sm:inline text-slate-300">|</span>
            <span className="flex items-center gap-1 min-w-0">
              <span aria-hidden>🤝</span>
              <span className="truncate">
                {sf.footerReturnsLine.trim() || "Trocas e devoluções"}
              </span>
            </span>
          </div>
          <p className="text-[9px] text-slate-400 mt-1.5 line-clamp-2 pr-2">
            {[
              sf.footerPhone,
              sf.footerEmail,
              sf.footerWebsite,
              sf.footerHours,
            ]
              .map((s) => s.trim())
              .filter(Boolean)
              .join(" · ") ||
              "Contato, horário, Pix, link de políticas e YouTube — toque no +"}
          </p>
        </div>

        <div
          className="px-3 py-2 text-center text-[10px] text-white font-medium rounded-b-2xl"
          style={{ backgroundColor: sf.themePrimary }}
        >
          Loja feita com VendeWhat · /loja/{storeSlug || "…"}
        </div>
      </div>


      {/* Painéis */}
      <EditorSheet
        open={panel === "logo"}
        title="Logo da loja"
        onClose={() => setPanel(null)}
      >
        <p className="text-sm text-slate-600">
          Imagem quadrada (ex.: 400×400). Aparece no canto da vitrine.
        </p>
        <button
          type="button"
          onClick={() => logoInputRef.current?.click()}
          className="w-full py-3 rounded-xl bg-landing-primary text-white font-semibold text-sm hover:opacity-90"
        >
          Escolher imagem
        </button>
        {(storeLogoUrl || logoPreviewObjectUrl) && !logoRemoved && (
          <button
            type="button"
            onClick={onRemoveLogoClick}
            className="text-sm text-red-600 font-medium hover:underline"
          >
            Remover logo atual
          </button>
        )}
      </EditorSheet>

      <EditorSheet
        open={panel === "announcement"}
        title="Texto informativo"
        onClose={() => setPanel(null)}
      >
        <p className="text-xs text-slate-500">
          Frase curta (também aparece no topo do banner na loja).
        </p>
        <label className="block text-sm font-medium text-slate-700">Texto</label>
        <input
          type="text"
          value={sf.heroSubtitle}
          onChange={(e) =>
            setSf((s) => ({ ...s, heroSubtitle: e.target.value }))
          }
          className="w-full px-3 py-2.5 rounded-lg border border-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-400"
          placeholder="Frete grátis acima de R$…"
        />
      </EditorSheet>

      {/* LEGADO: o banner agora é editado na página /dashboard/banner (o clique
          no banner navega para lá). Este painel não é mais aberto — mantido só
          para não quebrar props enquanto migramos; pode ser removido depois. */}
      <EditorSheet
        open={panel === "banner"}
        title="Banner da loja (opcional)"
        onClose={() => setPanel(null)}
      >
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">
            Formato das próximas fotos
          </label>
          <p className="text-[11px] text-slate-500 mb-1.5">
            Vale para as fotos que você <strong>adicionar agora</strong>. Cada
            foto guarda seu próprio formato — dá para mudar depois em cada uma,
            sem mexer nas outras.
          </p>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                { v: "overlay" as const, label: "Foto de fundo", hint: "Texto por cima da foto" },
                { v: "split" as const, label: "Foto ao lado", hint: "Foto de um lado, texto do outro" },
              ]
            ).map((opt) => {
              const active = sf.heroLayout === opt.v;
              return (
                <button
                  key={opt.v}
                  type="button"
                  onClick={() => setSf((s) => ({ ...s, heroLayout: opt.v }))}
                  className={`rounded-xl border-2 p-2.5 text-left transition-all ${
                    active
                      ? "border-landing-primary bg-teal-50"
                      : "border-slate-200 bg-white hover:border-slate-300"
                  }`}
                >
                  <span className="block text-xs font-bold text-slate-800">
                    {opt.label}
                  </span>
                  <span className="block text-[10px] text-slate-500 mt-0.5 leading-tight">
                    {opt.hint}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {sf.heroLayout === "split" && (
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Lado da foto (novas fotos)
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  { v: "left" as const, label: "Foto à esquerda" },
                  { v: "right" as const, label: "Foto à direita" },
                ]
              ).map((opt) => {
                const active = sf.heroSplitPhotoSide === opt.v;
                return (
                  <button
                    key={opt.v}
                    type="button"
                    onClick={() =>
                      setSf((s) => ({ ...s, heroSplitPhotoSide: opt.v }))
                    }
                    className={`rounded-lg border-2 px-3 py-2 text-xs font-semibold transition-all ${
                      active
                        ? "border-landing-primary bg-teal-50 text-slate-800"
                        : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="rounded-xl bg-sky-50 border border-sky-100 p-3 text-xs text-sky-900 space-y-1">
          <p className="font-semibold">
            📐 Tamanho ideal: “de fundo” {HERO_RECOMMENDED_WIDTH} ×{" "}
            {HERO_RECOMMENDED_HEIGHT} (larga); “ao lado” foto quadrada.
          </p>
          <p>
            Você pode colocar até <strong>{maxBannerPhotos} fotos</strong> no
            banner — elas passam <strong>uma atrás da outra</strong> sozinhas
            (1ª, 2ª, 3ª…). Ao escolher cada foto, você ajusta o enquadramento no
            formato escolhido.
          </p>
        </div>

        {heroUploading && (
          <p className="flex items-center gap-2 text-xs text-slate-500">
            <span className="animate-spin w-3.5 h-3.5 border-2 border-landing-primary border-t-transparent rounded-full" />
            Enviando foto…
          </p>
        )}

        {heroPhotoCount === 0 ? (
          <p className="text-xs text-slate-500">
            Sem foto, a loja fica só com as suas cores (sem banner). Tudo bem
            deixar assim! Toque em “Adicionar foto” para começar.
          </p>
        ) : (
          <div className="flex flex-wrap gap-3">
            {sf.heroSlides.map((slide, i) => (
              <HeroPhotoThumb
                key={`${slide.url}-${i}`}
                src={slide.url}
                index={i}
                layout={slide.layout}
                photoSide={slide.photoSide}
                onRemove={() => onRemoveHeroPhoto(i)}
                onChangeLayout={(layout) => setSlideLayout(i, layout)}
                onChangeSide={(side) => setSlideSide(i, side)}
              />
            ))}
          </div>
        )}

        {!heroSlotsFull ? (
          <button
            type="button"
            onClick={() => bannerInputRef.current?.click()}
            disabled={heroUploading}
            className="w-full py-3 rounded-xl bg-slate-100 text-slate-800 font-semibold text-sm hover:bg-slate-200 disabled:opacity-50"
          >
            + Adicionar foto ({heroPhotoCount}/{maxBannerPhotos})
          </button>
        ) : (
          <p className="text-[11px] text-slate-500 text-center">
            Você atingiu o limite de {maxBannerPhotos} fotos do seu plano.
          </p>
        )}

        {heroPhotoCount > 0 && (
          <button
            type="button"
            onClick={() => setSf((s) => ({ ...s, heroImages: [] }))}
            className="text-xs text-red-600 hover:underline"
          >
            Tirar o banner (remover todas as fotos)
          </button>
        )}
      </EditorSheet>

      <EditorSheet
        open={panel === "texts"}
        title="Textos no banner"
        onClose={() => setPanel(null)}
      >
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Frase pequena (opcional)
            </label>
            <input
              type="text"
              value={sf.heroSubtitle}
              onChange={(e) =>
                setSf((s) => ({ ...s, heroSubtitle: e.target.value }))
              }
              className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-400"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Título grande (vazio = nome da loja)
            </label>
            <input
              type="text"
              value={sf.heroTitle}
              onChange={(e) =>
                setSf((s) => ({ ...s, heroTitle: e.target.value }))
              }
              className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-400"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Cupom de desconto (opcional)
            </label>
            <input
              type="text"
              value={sf.heroCouponCode}
              onChange={(e) =>
                setSf((s) => ({ ...s, heroCouponCode: e.target.value }))
              }
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm uppercase"
              placeholder="Ex.: BEMVINDO10"
            />
            <p className="text-[11px] text-slate-500 mt-1">
              Aparece no banner como “Use o código”. Deixe vazio para não mostrar.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Texto do botão
              </label>
              <input
                type="text"
                value={sf.heroCtaLabel}
                onChange={(e) =>
                  setSf((s) => ({ ...s, heroCtaLabel: e.target.value }))
                }
                className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-400"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Link do botão
              </label>
              <input
                type="text"
                value={sf.heroCtaHref}
                onChange={(e) =>
                  setSf((s) => ({ ...s, heroCtaHref: e.target.value }))
                }
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm font-mono"
                placeholder="#catalogo"
              />
            </div>
          </div>
        </div>
      </EditorSheet>

      <EditorSheet
        open={panel === "blocks"}
        title="Blocos de destaque"
        onClose={() => setPanel(null)}
      >
        <p className="text-xs text-slate-500">
          Blocos aparecem <strong>abaixo dos produtos</strong>, na ordem da
          lista. Hoje: “Destaque com imagem + texto”. Salvam junto com o{" "}
          <strong>Salvar loja</strong>.
        </p>

        {contentBlocks.length === 0 && (
          <p className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-xs text-slate-500">
            Nenhum bloco ainda. Toque em “Adicionar destaque” para criar o
            primeiro.
          </p>
        )}

        <div className="space-y-4">
          {contentBlocks.map((block, idx) => {
            const cfg = block.config as ImageTextFeatureConfig;
            const bodyLen = (cfg.body ?? "").length;
            return (
              <div
                key={block.id}
                className="rounded-xl border border-slate-200 p-3 space-y-2.5"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700">
                    ✨ Destaque {idx + 1}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => moveBlock(block.id, -1)}
                      disabled={idx === 0}
                      className="w-7 h-7 rounded border border-slate-200 text-slate-600 disabled:opacity-30 hover:bg-slate-50"
                      aria-label="Subir bloco"
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      onClick={() => moveBlock(block.id, 1)}
                      disabled={idx === contentBlocks.length - 1}
                      className="w-7 h-7 rounded border border-slate-200 text-slate-600 disabled:opacity-30 hover:bg-slate-50"
                      aria-label="Descer bloco"
                    >
                      ▼
                    </button>
                    <button
                      type="button"
                      onClick={() => removeBlock(block.id)}
                      className="w-7 h-7 rounded border border-red-200 text-red-600 hover:bg-red-50"
                      aria-label="Remover bloco"
                    >
                      ✕
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Etiqueta (opcional)
                  </label>
                  <input
                    type="text"
                    value={cfg.eyebrow ?? ""}
                    maxLength={FEAT.eyebrow.max}
                    onChange={(e) =>
                      patchBlockConfig(block.id, { eyebrow: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-400"
                    placeholder="Ex.: NOVIDADE"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Título
                  </label>
                  <input
                    type="text"
                    value={cfg.title ?? ""}
                    maxLength={FEAT.title.max}
                    onChange={(e) =>
                      patchBlockConfig(block.id, { title: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-400"
                    placeholder="Conheça a nova coleção"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Texto
                  </label>
                  <textarea
                    value={cfg.body ?? ""}
                    maxLength={FEAT.body.max}
                    rows={3}
                    onChange={(e) =>
                      patchBlockConfig(block.id, { body: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-400 resize-none"
                    placeholder="Peças selecionadas com carinho para você."
                  />
                  <span className="text-[10px] text-slate-400">
                    {bodyLen}/{FEAT.body.max}
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Link da imagem (opcional)
                  </label>
                  <input
                    type="text"
                    value={cfg.imageUrl ?? ""}
                    onChange={(e) =>
                      patchBlockConfig(block.id, { imageUrl: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm font-mono"
                    placeholder="https://…/foto.jpg"
                  />
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    Sem imagem, mostra um espaço com ícone (não quebra).
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Lado da imagem
                    </label>
                    <div className="grid grid-cols-2 gap-1">
                      {(["left", "right"] as const).map((sideVal) => (
                        <button
                          key={sideVal}
                          type="button"
                          onClick={() =>
                            patchBlockConfig(block.id, { imageSide: sideVal })
                          }
                          className={`rounded-lg border-2 px-2 py-1.5 text-[11px] font-semibold ${
                            (cfg.imageSide ?? "right") === sideVal
                              ? "border-landing-primary bg-teal-50 text-slate-800"
                              : "border-slate-200 bg-white text-slate-600"
                          }`}
                        >
                          {sideVal === "left" ? "Esquerda" : "Direita"}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Botão (opcional)
                    </label>
                    <input
                      type="text"
                      value={cfg.ctaLabel ?? ""}
                      maxLength={FEAT.ctaLabel.max}
                      onChange={(e) =>
                        patchBlockConfig(block.id, { ctaLabel: e.target.value })
                      }
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-400"
                      placeholder="Ver coleção"
                    />
                  </div>
                </div>

                {(cfg.ctaLabel ?? "").trim() && (
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Link do botão
                    </label>
                    <input
                      type="text"
                      value={cfg.ctaHref ?? ""}
                      onChange={(e) =>
                        patchBlockConfig(block.id, { ctaHref: e.target.value })
                      }
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm font-mono"
                      placeholder="#catalogo"
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <button
          type="button"
          onClick={addFeatureBlock}
          className="w-full py-3 rounded-xl bg-slate-100 text-slate-800 font-semibold text-sm hover:bg-slate-200"
        >
          + Adicionar destaque (imagem + texto)
        </button>
      </EditorSheet>

      <EditorSheet
        open={panel === "colors"}
        title="Cores da loja"
        onClose={() => setPanel(null)}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Fundo do topo da loja
            </label>
            <p className="text-xs text-slate-500 mb-2">
              Área do logo, busca e ícones no catálogo público.
            </p>
            <div className="flex gap-2 items-stretch">
              <input
                type="color"
                value={hexForColorInput(sf.headerBackground)}
                onChange={(e) =>
                  setSf((s) => ({ ...s, headerBackground: e.target.value }))
                }
                className="h-10 w-14 min-w-[3.5rem] shrink-0 rounded border border-slate-200 cursor-pointer p-0.5 bg-white"
                title="Escolher cor"
              />
              <input
                type="text"
                value={sf.headerBackground}
                onChange={(e) =>
                  setSf((s) => ({ ...s, headerBackground: e.target.value }))
                }
                className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-slate-200 text-sm font-mono"
                placeholder="#ffffff ou rgba(255,255,255,0.95)"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Fundo da página
            </label>
            <p className="text-xs text-slate-500 mb-2">
              Cor da página inteira. Um cinza claro separa os cards brancos
              (banner, promoções e produtos), como nas grandes lojas.
            </p>
            <div className="flex gap-2 items-stretch">
              <input
                type="color"
                value={hexForColorInput(sf.pageBackground)}
                onChange={(e) =>
                  setSf((s) => ({ ...s, pageBackground: e.target.value }))
                }
                className="h-10 w-14 min-w-[3.5rem] shrink-0 rounded border border-slate-200 cursor-pointer p-0.5 bg-white"
                title="Escolher cor"
              />
              <input
                type="text"
                value={sf.pageBackground}
                onChange={(e) =>
                  setSf((s) => ({ ...s, pageBackground: e.target.value }))
                }
                className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-slate-200 text-sm font-mono"
                placeholder="#f4f4f5"
              />
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
          <div className="min-w-0">
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Cor principal
            </label>
            <div className="flex gap-2 items-stretch">
              <input
                type="color"
                value={hexForColorInput(sf.themePrimary)}
                onChange={(e) =>
                  setSf((s) => ({ ...s, themePrimary: e.target.value }))
                }
                className="h-10 w-14 min-w-[3.5rem] shrink-0 rounded border border-slate-200 cursor-pointer p-0.5 bg-white"
                title="Escolher cor"
              />
              <input
                type="text"
                value={sf.themePrimary}
                onChange={(e) =>
                  setSf((s) => ({ ...s, themePrimary: e.target.value }))
                }
                className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-slate-200 text-sm font-mono"
              />
            </div>
          </div>
          <div className="min-w-0">
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Cor escura / destaque
            </label>
            <div className="flex gap-2 items-stretch">
              <input
                type="color"
                value={hexForColorInput(sf.themeSecondary)}
                onChange={(e) =>
                  setSf((s) => ({ ...s, themeSecondary: e.target.value }))
                }
                className="h-10 w-14 min-w-[3.5rem] shrink-0 rounded border border-slate-200 cursor-pointer p-0.5 bg-white"
                title="Escolher cor"
              />
              <input
                type="text"
                value={sf.themeSecondary}
                onChange={(e) =>
                  setSf((s) => ({ ...s, themeSecondary: e.target.value }))
                }
                className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-slate-200 text-sm font-mono"
              />
            </div>
          </div>
        </div>
      </EditorSheet>

      <EditorSheet
        open={panel === "socials"}
        title="Redes sociais"
        onClose={() => setPanel(null)}
      >
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Instagram
            </label>
            <input
              type="text"
              value={sf.instagramUrl}
              onChange={(e) =>
                setSf((s) => ({ ...s, instagramUrl: e.target.value }))
              }
              className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-400"
              placeholder="@loja"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Facebook (opcional)
            </label>
            <input
              type="text"
              value={sf.facebookUrl}
              onChange={(e) =>
                setSf((s) => ({ ...s, facebookUrl: e.target.value }))
              }
              className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-400"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              TikTok (opcional)
            </label>
            <input
              type="text"
              value={sf.tiktokUrl}
              onChange={(e) =>
                setSf((s) => ({ ...s, tiktokUrl: e.target.value }))
              }
              className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-400"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              YouTube (opcional)
            </label>
            <input
              type="text"
              value={sf.youtubeUrl}
              onChange={(e) =>
                setSf((s) => ({ ...s, youtubeUrl: e.target.value }))
              }
              className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-400"
              placeholder="https://youtube.com/@…"
            />
          </div>
        </div>
      </EditorSheet>

      <EditorSheet
        open={panel === "categories"}
        title="Categorias na loja"
        onClose={() => setPanel(null)}
      >
        <p className="text-xs text-slate-500">
          Use o <strong>+</strong> ou &quot;Categoria 1…4&quot;. Na loja pública a
          faixa <strong>aparece abaixo do banner</strong> quando há{" "}
          <strong>produtos</strong> e você definiu pelo menos um nome aqui. Para{" "}
          <strong>filtrar</strong> ao tocar, a categoria escolhida no{" "}
          <strong>cadastro do produto</strong> deve ter o mesmo nome que você
          definiu aqui. Máximo 8 itens.
        </p>
        <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
          {sf.categories.map((cat, i) => (
            <div
              key={i}
              className="rounded-xl border border-slate-200 bg-slate-50/80 p-3 space-y-2"
            >
              <div className="flex justify-between items-center gap-2">
                <span className="text-xs font-semibold text-slate-600">
                  Categoria {i + 1}
                </span>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    disabled={i === 0}
                    title="Mover para cima"
                    aria-label="Mover categoria para cima"
                    onClick={() => moveStoreCategory(i, -1)}
                    className="px-1.5 py-0.5 rounded border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    disabled={i === sf.categories.length - 1}
                    title="Mover para baixo"
                    aria-label="Mover categoria para baixo"
                    onClick={() => moveStoreCategory(i, 1)}
                    className="px-1.5 py-0.5 rounded border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    ▼
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setSf((s) => ({
                        ...s,
                        categories: s.categories.filter((_, j) => j !== i),
                      }))
                    }
                    className="text-xs text-red-600 hover:underline ml-1"
                  >
                    Remover
                  </button>
                </div>
              </div>
              <label className="block text-[11px] font-medium text-slate-600">
                Nome
              </label>
              <input
                type="text"
                value={cat.label}
                onChange={(e) => {
                  const v = e.target.value;
                  setSf((s) => {
                    const next = [...s.categories];
                    next[i] = { ...next[i]!, label: v };
                    return { ...s, categories: next };
                  });
                }}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-400"
                placeholder="Ex.: Vestidos"
              />
              {cat.parentLabel?.trim() ? (
                <p className="text-[10px] text-slate-400 -mt-1">
                  Pai: <span className="font-medium">{cat.parentLabel.trim()}</span>{" "}
                  (edite no + da prévia para alterar)
                </p>
              ) : null}
              <label className="block text-[11px] font-medium text-slate-600">
                URL da imagem (opcional)
              </label>
              <input
                type="url"
                value={cat.imageUrl}
                onChange={(e) => {
                  const v = e.target.value;
                  setSf((s) => {
                    const next = [...s.categories];
                    next[i] = { ...next[i]!, imageUrl: v };
                    return { ...s, categories: next };
                  });
                }}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm font-mono text-xs"
                placeholder="https://…"
              />
            </div>
          ))}
        </div>
        <button
          type="button"
          disabled={sf.categories.length >= 8}
          onClick={() =>
            setSf((s) => ({
              ...s,
              categories: [
                ...s.categories,
                { label: "", imageUrl: "" } satisfies StorefrontCategoryItem,
              ],
            }))
          }
          className="w-full py-2.5 rounded-xl border-2 border-dashed border-landing-primary/40 text-landing-primary font-semibold text-sm hover:bg-teal-50 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          + Adicionar categoria
        </button>
      </EditorSheet>

      <EditorSheet
        open={panel === "info"}
        title="Informações abaixo do logo"
        onClose={() => setPanel(null)}
      >
        <div className="space-y-2">
          {sf.infoBullets.map((line, i) => (
            <div key={i} className="flex gap-2">
              <input
                type="text"
                value={line}
                onChange={(e) => setBullet(i, e.target.value)}
                className="flex-1 px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-400"
              />
              <button
                type="button"
                onClick={() => removeBullet(i)}
                className="px-2 text-slate-400 hover:text-red-600"
              >
                ✕
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={addBullet}
            className="text-sm font-semibold text-landing-primary hover:underline"
          >
            + Linha
          </button>
        </div>
      </EditorSheet>

      <EditorSheet
        open={panel === "search"}
        title="Barra de busca"
        onClose={() => setPanel(null)}
      >
        <label className="block text-sm font-medium text-slate-700 mb-1">
          Texto de exemplo na busca
        </label>
        <input
          type="text"
          value={sf.searchPlaceholder}
          onChange={(e) =>
            setSf((s) => ({ ...s, searchPlaceholder: e.target.value }))
          }
          className="w-full px-3 py-2.5 rounded-lg border border-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-400"
        />
      </EditorSheet>

      <EditorSheet
        open={panel === "avisos"}
        title="Barra de avisos do topo"
        onClose={() => setPanel(null)}
      >
        <div className="space-y-4">
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <input
              type="checkbox"
              checked={sf.announcementBarEnabled}
              onChange={(e) =>
                setSf((s) => ({
                  ...s,
                  announcementBarEnabled: e.target.checked,
                }))
              }
              className="h-4 w-4"
            />
            Mostrar a barra de avisos no topo
          </label>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Cor de fundo da barra
            </label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={sf.announcementBarBg}
                onChange={(e) =>
                  setSf((s) => ({ ...s, announcementBarBg: e.target.value }))
                }
                className="h-9 w-12 rounded border border-slate-200"
              />
              <input
                type="text"
                value={sf.announcementBarBg}
                onChange={(e) =>
                  setSf((s) => ({ ...s, announcementBarBg: e.target.value }))
                }
                className="flex-1 px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-400"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Avisos (frete grátis, parcelamento, troca…)
            </label>
            <p className="text-xs text-slate-500 mb-2">
              Um por linha. Coloque um trecho entre{" "}
              <code className="px-1 rounded bg-slate-100">**asteriscos**</code>{" "}
              para destacá-lo em dourado. Ex.:{" "}
              <span className="whitespace-nowrap">
                🚚 Frete grátis acima de **R$ 79**
              </span>
            </p>
            <div className="space-y-2">
              {sf.announcements.map((line, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    type="text"
                    value={line}
                    maxLength={80}
                    onChange={(e) =>
                      setSf((s) => ({
                        ...s,
                        announcements: s.announcements.map((a, j) =>
                          j === i ? e.target.value : a
                        ),
                      }))
                    }
                    className="flex-1 px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-400"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setSf((s) => ({
                        ...s,
                        announcements: s.announcements.filter(
                          (_, j) => j !== i
                        ),
                      }))
                    }
                    className="px-2 text-slate-400 hover:text-red-600"
                  >
                    ✕
                  </button>
                </div>
              ))}
              {sf.announcements.length < 6 && (
                <button
                  type="button"
                  onClick={() =>
                    setSf((s) => ({
                      ...s,
                      announcements: [...s.announcements, ""],
                    }))
                  }
                  className="text-sm font-semibold text-landing-primary hover:underline"
                >
                  + Aviso
                </button>
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Subtítulo do logo no topo
            </label>
            <input
              type="text"
              value={sf.headerTagline}
              maxLength={40}
              placeholder="Ex.: MODA & ESTILO"
              onChange={(e) =>
                setSf((s) => ({ ...s, headerTagline: e.target.value }))
              }
              className="w-full px-3 py-2.5 rounded-lg border border-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-400"
            />
          </div>
        </div>
      </EditorSheet>

      <EditorSheet
        open={panel === "footer"}
        title="Pix, pagamentos e rodapé"
        onClose={() => setPanel(null)}
      >
        <p className="text-xs text-slate-500">
          Aparece na loja pública <strong>abaixo dos produtos</strong>. O bloco
          só é exibido ao cliente quando houver pelo menos um campo preenchido,
          Pix/dinheiro ativo ou alguma rede social.
        </p>
        <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 space-y-1.5">
          <label className="block text-sm font-medium text-slate-700">
            Endereço para retirada
          </label>
          <p className="text-xs text-slate-500">
            Mostrado ao cliente no carrinho quando ele escolhe{" "}
            <strong>Retirada</strong> como forma de envio.
          </p>
          <textarea
            value={sf.pickupAddress}
            onChange={(e) =>
              setSf((s) => ({ ...s, pickupAddress: e.target.value }))
            }
            rows={3}
            className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-400 resize-none"
            placeholder="Ex.: Rua das Flores, 123 — Centro, São Paulo/SP. Seg–Sex 9h–18h."
          />
          <label className="block text-sm font-medium text-slate-700 pt-1">
            Como retirar (instruções)
          </label>
          <p className="text-xs text-slate-500">
            Aparece no carrinho e na mensagem do WhatsApp quando o cliente
            escolhe <strong>Retirada</strong>. A IA do WhatsApp também usa isso
            para explicar a retirada.
          </p>
          <textarea
            value={sf.pickupInstructions}
            onChange={(e) =>
              setSf((s) => ({ ...s, pickupInstructions: e.target.value }))
            }
            rows={2}
            className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-400 resize-none"
            placeholder="Ex.: Retire de Seg–Sex, 9h–18h. Apresente o código do pedido no balcão."
          />
        </div>
        <label className="block text-sm font-medium text-slate-700">
          Frete / envio (linha superior)
        </label>
        <input
          type="text"
          value={sf.footerShippingLine}
          onChange={(e) =>
            setSf((s) => ({ ...s, footerShippingLine: e.target.value }))
          }
          className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-400"
          placeholder="Ex.: Frete grátis em pedidos a partir de R$ 199"
        />
        <label className="block text-sm font-medium text-slate-700">
          Trocas / política (linha superior)
        </label>
        <input
          type="text"
          value={sf.footerReturnsLine}
          onChange={(e) =>
            setSf((s) => ({ ...s, footerReturnsLine: e.target.value }))
          }
          className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-400"
          placeholder="Ex.: Conheça nossa política de trocas e devoluções"
        />
        <label className="block text-sm font-medium text-slate-700">
          URL das políticas de devolução
        </label>
        <input
          type="url"
          value={sf.footerPolicyUrl}
          onChange={(e) =>
            setSf((s) => ({ ...s, footerPolicyUrl: e.target.value }))
          }
          className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm font-mono text-xs"
          placeholder="https://…"
        />
        <label className="block text-sm font-medium text-slate-700">
          Telefone de atendimento
        </label>
        <input
          type="text"
          value={sf.footerPhone}
          onChange={(e) =>
            setSf((s) => ({ ...s, footerPhone: e.target.value }))
          }
          className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-400"
          placeholder="(00) 00000-0000"
        />
        <label className="block text-sm font-medium text-slate-700">E-mail</label>
        <input
          type="email"
          value={sf.footerEmail}
          onChange={(e) =>
            setSf((s) => ({ ...s, footerEmail: e.target.value }))
          }
          className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-400"
          placeholder="contato@sualoja.com"
        />
        <label className="block text-sm font-medium text-slate-700">Site</label>
        <input
          type="text"
          value={sf.footerWebsite}
          onChange={(e) =>
            setSf((s) => ({ ...s, footerWebsite: e.target.value }))
          }
          className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-400"
          placeholder="www.sualoja.com.br"
        />
        <label className="block text-sm font-medium text-slate-700">
          Horário de atendimento
        </label>
        <input
          type="text"
          value={sf.footerHours}
          onChange={(e) =>
            setSf((s) => ({ ...s, footerHours: e.target.value }))
          }
          className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-400"
          placeholder="Seg–Sex 9h–18h"
        />
        <div className="flex flex-wrap gap-4 pt-1">
          <label className="inline-flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={sf.footerShowPix}
              onChange={(e) =>
                setSf((s) => ({ ...s, footerShowPix: e.target.checked }))
              }
              className="rounded border-slate-300"
            />
            Mostrar Pix
          </label>
          <label className="inline-flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={sf.footerShowCash}
              onChange={(e) =>
                setSf((s) => ({ ...s, footerShowCash: e.target.checked }))
              }
              className="rounded border-slate-300"
            />
            Mostrar dinheiro
          </label>
        </div>
        <label className="block text-sm font-medium text-slate-700">
          Chave Pix
        </label>
        <input
          type="text"
          value={sf.pixKey}
          onChange={(e) => setSf((s) => ({ ...s, pixKey: e.target.value }))}
          className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-400"
          placeholder="CPF, telefone, e-mail ou chave aleatória"
        />
        <label className="block text-sm font-medium text-slate-700">
          Nome do titular do Pix
        </label>
        <input
          type="text"
          value={sf.pixName}
          onChange={(e) => setSf((s) => ({ ...s, pixName: e.target.value }))}
          className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-400"
          placeholder="Ex.: Maria da Silva"
        />
        <p className="text-[11px] text-slate-500">
          Quando o cliente finalizar por <strong>Enviar pedido no WhatsApp</strong>,
          a chave Pix entra na mensagem para ele pagar e enviar o comprovante.
        </p>
        <label className="mt-1 flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50/60 p-3 text-sm text-slate-700 cursor-pointer">
          <input
            type="checkbox"
            checked={sf.aiSendPixOnCheckout}
            onChange={(e) =>
              setSf((s) => ({ ...s, aiSendPixOnCheckout: e.target.checked }))
            }
            className="mt-0.5 rounded border-slate-300"
          />
          <span>
            A IA do WhatsApp envia a chave Pix ao fechar o pedido
            <span className="block text-[11px] text-slate-500">
              Quando o cliente for finalizar a compra pela conversa, a IA manda a
              chave Pix acima para ele pagar. Sem chave preenchida, ela nunca
              envia nem inventa uma.
            </span>
          </span>
        </label>
        <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 space-y-1.5">
          <p className="text-sm font-medium text-slate-700">
            Formas de pagamento no checkout
          </p>
          <p className="text-xs text-slate-500">
            Você escolhe quais formas o cliente pode usar (Pix, dinheiro, cartão,
            Mercado Pago) e o <strong>pedido mínimo</strong> em{" "}
            <Link
              href="/dashboard/ia?tab=configuracoes"
              className="text-landing-primary font-semibold hover:underline"
            >
              Configuração da IA
            </Link>{" "}
            (seção “O que a sua loja aceita”). Assim não fica repetido em dois
            lugares — o que você marca lá já vale aqui no checkout.
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 space-y-2">
          <p className="text-sm font-medium text-slate-700">Formato da foto dos produtos</p>
          <p className="text-xs text-slate-500">
            Como as fotos aparecem nos cards da loja. Vale para todos os produtos.
          </p>
          <div className="flex gap-2 pt-0.5">
            {(
              [
                { id: "1:1", label: "Quadrado", sub: "1:1", box: "h-8 w-8" },
                { id: "3:4", label: "Retrato", sub: "3:4", box: "h-10 w-[30px]" },
              ] as const
            ).map((opt) => {
              const active = sf.productCardRatio === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    if (sf.productCardRatio === opt.id) return;
                    // Salva na hora, igual ao controle de estoque.
                    const nextSf: StorefrontSettings = {
                      ...sf,
                      productCardRatio: opt.id,
                    };
                    setSf(nextSf);
                    onAutoSaveStorefront?.(nextSf);
                  }}
                  className={`flex-1 flex flex-col items-center gap-1.5 rounded-lg border px-3 py-2.5 transition-colors ${
                    active
                      ? "border-landing-primary bg-landing-primary/5 ring-1 ring-landing-primary"
                      : "border-slate-200 hover:border-slate-400 bg-white"
                  }`}
                >
                  <span
                    className={`${opt.box} rounded bg-slate-300 ${
                      active ? "bg-landing-primary/60" : ""
                    }`}
                    aria-hidden
                  />
                  <span className="text-xs font-medium text-slate-700">
                    {opt.label}{" "}
                    <span className="text-slate-400 font-normal">({opt.sub})</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 space-y-3">
          <div>
            <p className="text-sm font-medium text-slate-700">
              Cartões de produto (estilo loja)
            </p>
            <p className="text-xs text-slate-500">
              Aparece nos cards de <strong>Ofertas Relâmpago</strong> e{" "}
              <strong>Mais Produtos</strong> da loja. Salva na hora.
            </p>
          </div>

          {/* Contador Ofertas Relâmpago */}
          <label className="block space-y-1">
            <span className="text-xs font-medium text-slate-600">
              Contador “Ofertas Relâmpago” (data e hora do fim)
            </span>
            <div className="flex items-center gap-2">
              <input
                type="datetime-local"
                value={isoToLocalInput(sf.flashSaleEndsAt)}
                onChange={(e) => {
                  const nextSf: StorefrontSettings = {
                    ...sf,
                    flashSaleEndsAt: localInputToIso(e.target.value),
                  };
                  setSf(nextSf);
                  onAutoSaveStorefront?.(nextSf);
                }}
                className="flex-1 rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-900 outline-none focus:border-landing-primary focus:ring-1 focus:ring-landing-primary"
              />
              {sf.flashSaleEndsAt && (
                <button
                  type="button"
                  onClick={() => {
                    const nextSf: StorefrontSettings = {
                      ...sf,
                      flashSaleEndsAt: "",
                    };
                    setSf(nextSf);
                    onAutoSaveStorefront?.(nextSf);
                  }}
                  className="rounded-lg border border-slate-300 px-2.5 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100"
                >
                  Limpar
                </button>
              )}
            </div>
            <span className="block text-[11px] text-slate-500">
              Vazio ou no passado = sem contador (as promoções continuam
              aparecendo).
            </span>
          </label>

          {/* Parcelamento */}
          <label className="block space-y-1">
            <span className="text-xs font-medium text-slate-600">
              Parcelamento estimado
            </span>
            <select
              value={sf.cardInstallmentsMax}
              onChange={(e) => {
                const nextSf: StorefrontSettings = {
                  ...sf,
                  cardInstallmentsMax: Number(e.target.value),
                };
                setSf(nextSf);
                onAutoSaveStorefront?.(nextSf);
              }}
              className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-900 outline-none focus:border-landing-primary focus:ring-1 focus:ring-landing-primary"
            >
              <option value={0}>Não mostrar</option>
              <option value={2}>até 2x sem juros</option>
              <option value={3}>até 3x sem juros</option>
              <option value={4}>até 4x sem juros</option>
              <option value={6}>até 6x sem juros</option>
              <option value={10}>até 10x sem juros</option>
              <option value={12}>até 12x sem juros</option>
            </select>
            <span className="block text-[11px] text-slate-500">
              Estimativa (preço ÷ parcelas). Não é cobrança de gateway.
            </span>
          </label>

          {/* Frete grátis */}
          <label className="block space-y-1">
            <span className="text-xs font-medium text-slate-600">
              Selo de frete grátis
            </span>
            <input
              type="text"
              maxLength={40}
              defaultValue={sf.cardFreeShipping}
              placeholder="Ex.: Frete grátis acima de R$ 79"
              onBlur={(e) => {
                const val = e.target.value.trim().slice(0, 40);
                if (val === sf.cardFreeShipping) return;
                const nextSf: StorefrontSettings = {
                  ...sf,
                  cardFreeShipping: val,
                };
                setSf(nextSf);
                onAutoSaveStorefront?.(nextSf);
              }}
              className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-900 outline-none focus:border-landing-primary focus:ring-1 focus:ring-landing-primary"
            />
            <span className="block text-[11px] text-slate-500">
              Vazio = não mostra. É um texto fixo — a loja não calcula frete por
              produto.
            </span>
          </label>

          {/* Estrelas decorativas */}
          <label className="inline-flex items-start gap-2 text-sm text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={sf.cardShowRatings}
              onChange={(e) => {
                const nextSf: StorefrontSettings = {
                  ...sf,
                  cardShowRatings: e.target.checked,
                };
                setSf(nextSf);
                onAutoSaveStorefront?.(nextSf);
              }}
              className="mt-0.5 rounded border-slate-300"
            />
            <span>
              Mostrar estrelas de avaliação
              <span className="block text-[11px] text-slate-500 font-normal">
                <strong>Decorativo</strong>: a nota é gerada automaticamente (não
                são avaliações reais de clientes).
              </span>
            </span>
          </label>
        </div>

        <p className="text-[11px] text-slate-500">
          Instagram, Facebook, TikTok e YouTube ficam em{" "}
          <button
            type="button"
            className="text-landing-primary font-semibold hover:underline"
            onClick={() => setPanel("socials")}
          >
            Redes sociais
          </button>
          .
        </p>
      </EditorSheet>

      <CategoryFormModal
        variant="store"
        storeId={storeId}
        open={storeCategoryModal.open}
        onClose={() => setStoreCategoryModal({ open: false, editIndex: null })}
        title={
          storeCategoryModal.editIndex !== null
            ? "Editar categoria"
            : "Adicionar Categoria"
        }
        initialName={
          storeCategoryModal.editIndex !== null
            ? (sf.categories[storeCategoryModal.editIndex]?.label ?? "")
            : ""
        }
        initialImageUrl={
          storeCategoryModal.editIndex !== null
            ? (sf.categories[storeCategoryModal.editIndex]?.imageUrl ?? "")
            : ""
        }
        initialParentLabel={
          storeCategoryModal.editIndex !== null
            ? (sf.categories[storeCategoryModal.editIndex]?.parentLabel ?? "")
            : ""
        }
        parentCategoryOptions={storeCategoryParentOptions}
        onSave={(d) => {
          const editIdx = storeCategoryModal.editIndex;
          const item: StorefrontCategoryItem = {
            label: d.name,
            imageUrl: d.imageUrl,
          };
          const pl = d.parentLabel?.trim();
          if (pl) item.parentLabel = pl;
          const next = [...sf.categories];
          let nextSf: StorefrontSettings | null = null;
          if (editIdx !== null && editIdx >= 0 && editIdx < next.length) {
            next[editIdx] = item;
            nextSf = { ...sf, categories: next };
          } else if (next.length < 8) {
            nextSf = { ...sf, categories: [...next, item] };
          }
          if (nextSf) {
            setSf(nextSf);
            onAutoSaveStorefront?.(nextSf);
          }
        }}
        onDelete={
          storeCategoryModal.editIndex !== null
            ? () => {
                const editIdx = storeCategoryModal.editIndex;
                if (
                  editIdx === null ||
                  editIdx < 0 ||
                  editIdx >= sf.categories.length
                ) {
                  return;
                }
                const nextSf: StorefrontSettings = {
                  ...sf,
                  categories: sf.categories.filter((_, j) => j !== editIdx),
                };
                setSf(nextSf);
                onAutoSaveStorefront?.(nextSf);
              }
            : undefined
        }
      />
    </div>
  );
}
