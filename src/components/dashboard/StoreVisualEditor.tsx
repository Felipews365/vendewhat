"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import type { StorefrontSettings } from "@/lib/storefront";

/** Até 4 itens para a grelha “Produtos” do editor (dados reais da loja). */
export type CatalogPreviewProduct = {
  id: string;
  name: string;
  price: number;
  imageUrl: string | null;
};

function formatBRL(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
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
  | "banner"
  | "texts"
  | "colors"
  | "socials"
  | "info"
  | "search";

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
  addBannerFiles,
  pendingHeroFiles,
  setPendingHeroFiles,
  setBullet,
  addBullet,
  removeBullet,
  catalogPreview = [],
}: {
  storeName: string;
  storeSlug: string;
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
  addBannerFiles: (files: FileList | File[]) => void;
  pendingHeroFiles: File[];
  setPendingHeroFiles: React.Dispatch<React.SetStateAction<File[]>>;
  setBullet: (i: number, value: string) => void;
  addBullet: () => void;
  removeBullet: (i: number) => void;
  /** Produtos reais (máx. 4) para mostrar na prévia; restantes = cartões “novo”. */
  catalogPreview?: CatalogPreviewProduct[];
}) {
  const [panel, setPanel] = useState<EditorPanel>(null);

  const previewSlots: (CatalogPreviewProduct | null)[] = Array.from(
    { length: 4 },
    (_, i) => catalogPreview[i] ?? null
  );

  const displayLogo =
    logoPreviewObjectUrl ||
    (!logoRemoved && storeLogoUrl ? storeLogoUrl : null);

  const announcementText =
    sf.heroSubtitle.trim() ||
    "Texto informativo para seus clientes (curto): frete, promoções…";

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

      {/* Canvas da vitrine — sem overflow-hidden no pai para não recortar os botões + */}
      <div className="rounded-2xl border-2 border-slate-200 bg-[#f5f5f5] shadow-inner">
        <div
          className="border-b border-slate-100 px-3 py-3 sm:px-4 rounded-t-2xl"
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
              if (e.target.files?.length) addBannerFiles(e.target.files);
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
              onClick={() => bannerInputRef.current?.click()}
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
                  addBannerFiles(e.dataTransfer.files);
              }}
            >
              {bannerBgSrc ? (
                bannerBgSrc.startsWith("blob:") ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={bannerBgSrc}
                    alt=""
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                ) : (
                  <Image
                    src={bannerBgSrc}
                    alt=""
                    fill
                    className="object-cover"
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
                    Toque para adicionar ou deixe só as cores
                  </span>
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-r from-black/45 via-black/20 to-transparent pointer-events-none" />
              <div className="absolute inset-0 flex flex-col justify-end p-3 sm:p-5 max-w-md pointer-events-none">
                {sf.heroSubtitle.trim() && (
                  <p className="text-[10px] text-white/90 font-medium tracking-wide uppercase drop-shadow line-clamp-1">
                    {sf.heroSubtitle}
                  </p>
                )}
                <h3 className="text-base sm:text-xl font-bold text-white leading-tight mt-0.5 drop-shadow-lg line-clamp-2">
                  {heroPreviewTitle}
                </h3>
                <span
                  className="mt-2 inline-flex self-start px-2.5 py-1 rounded text-white text-[10px] font-bold uppercase shadow-md"
                  style={{ backgroundColor: sf.themeSecondary }}
                >
                  {sf.heroCtaLabel || "Comprar"}
                </span>
              </div>
            </button>
            <div className="absolute top-2 right-3 sm:top-3 sm:right-4 z-30">
              <PlusFab
                label="Gerenciar fotos do banner"
                onClick={() => setPanel("banner")}
              />
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
            {previewSlots.map((product, i) => {
              if (product) {
                const href = `/dashboard/produtos/${product.id}`;
                return (
                  <Link
                    key={product.id}
                    href={href}
                    className="relative rounded-xl border border-slate-200 bg-slate-50 p-2 hover:border-landing-primary/40 transition-colors text-center group"
                  >
                    <div className="absolute top-1.5 right-1.5 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-landing-primary text-white text-sm font-light shadow ring-1 ring-white pointer-events-none">
                      +
                    </div>
                    <div className="relative aspect-square rounded-lg bg-slate-200/90 overflow-hidden mb-1.5">
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
                  key={`novo-${i}`}
                  href="/dashboard/produtos/novo"
                  className="relative rounded-xl border border-slate-200 bg-slate-50 p-2 hover:border-landing-primary/40 transition-colors text-center group"
                >
                  <div className="absolute top-1.5 right-1.5 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-landing-primary text-white text-sm font-light shadow ring-1 ring-white">
                    +
                  </div>
                  <div className="aspect-square rounded-lg bg-slate-200/90 flex flex-col items-center justify-center mb-1.5">
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
            Com produtos cadastrados, a foto e o preço aparecem aqui. Toque no
            card para editar; nos vazios, cadastre um novo.
          </p>
        </div>

        <div
          className="px-3 py-2 text-center text-[10px] text-white font-medium rounded-b-2xl"
          style={{ backgroundColor: sf.themePrimary }}
        >
          Loja feita com VendeWhat · /loja/{storeSlug || "…"}
        </div>
      </div>

      {/* Atalhos rápidos abaixo do canvas */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          id="passo-textos-banner"
          onClick={() => setPanel("texts")}
          className="text-xs font-semibold px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 scroll-mt-28"
        >
          Textos do banner
        </button>
        <button
          type="button"
          id="passo-cores"
          onClick={() => setPanel("colors")}
          className="text-xs font-semibold px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 scroll-mt-28"
        >
          Cores
        </button>
        <button
          type="button"
          id="passo-info"
          onClick={() => setPanel("info")}
          className="text-xs font-semibold px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 scroll-mt-28"
        >
          Infos abaixo do logo
        </button>
        <button
          type="button"
          id="passo-redes"
          onClick={() => setPanel("socials")}
          className="text-xs font-semibold px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 scroll-mt-28"
        >
          Redes sociais
        </button>
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
          className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm"
          placeholder="Frete grátis acima de R$…"
        />
      </EditorSheet>

      <EditorSheet
        open={panel === "banner"}
        title="Fotos do banner (opcional)"
        onClose={() => setPanel(null)}
      >
        <p className="text-xs text-slate-500">
          A loja funciona sem foto — o fundo usa suas cores. Se quiser, até 10
          imagens largas; arraste na área do banner ou escolha aqui.
        </p>
        <button
          type="button"
          onClick={() => bannerInputRef.current?.click()}
          className="w-full py-3 rounded-xl bg-slate-100 text-slate-800 font-semibold text-sm hover:bg-slate-200"
        >
          Adicionar fotos
        </button>
        <div className="flex flex-wrap gap-2">
          {sf.heroImages.map((url, i) => (
            <div
              key={`${url}-${i}`}
              className="relative w-20 h-12 rounded border border-slate-200 overflow-hidden shrink-0"
            >
              <Image src={url} alt="" fill className="object-cover" sizes="80px" />
              <button
                type="button"
                onClick={() =>
                  setSf((s) => ({
                    ...s,
                    heroImages: s.heroImages.filter((_, j) => j !== i),
                  }))
                }
                className="absolute top-0 right-0 w-5 h-5 bg-black/70 text-white text-xs"
              >
                ×
              </button>
            </div>
          ))}
          {pendingHeroFiles.map((file, i) => (
            <div
              key={`p-${i}`}
              className="flex items-center gap-1 text-[10px] border border-dashed border-landing-primary rounded px-2 py-1"
            >
              <span className="truncate max-w-[100px]">{file.name}</span>
              <button
                type="button"
                className="text-red-600"
                onClick={() =>
                  setPendingHeroFiles((prev) => prev.filter((_, j) => j !== i))
                }
              >
                ×
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => {
            setSf((s) => ({ ...s, heroImages: [] }));
            setPendingHeroFiles([]);
          }}
          className="text-xs text-red-600 hover:underline"
        >
          Limpar todas as fotos
        </button>
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
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm"
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
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm"
            />
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
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm"
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
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm"
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
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm"
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
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm"
            />
          </div>
        </div>
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
                className="flex-1 px-3 py-2 rounded-lg border border-slate-200 text-sm"
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
          className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm"
        />
      </EditorSheet>
    </div>
  );
}
