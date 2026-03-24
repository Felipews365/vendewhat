"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import {
  DEFAULT_STOREFRONT,
  type StorefrontSettings,
  normalizeInstagramUrl,
  normalizeSocialUrl,
  storefrontFromDb,
  storefrontToDb,
} from "@/lib/storefront";

export default function ConfiguracoesLojaPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [storeId, setStoreId] = useState<string | null>(null);
  const [storeName, setStoreName] = useState("");
  const [storeSlug, setStoreSlug] = useState("");
  const [sf, setSf] = useState<StorefrontSettings>({ ...DEFAULT_STOREFRONT });
  /** Novas fotos do banner (enviadas ao salvar) */
  const [pendingHeroFiles, setPendingHeroFiles] = useState<File[]>([]);
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null);
  const [bannerDrag, setBannerDrag] = useState(false);
  const bannerInputRef = useRef<HTMLInputElement>(null);

  /** Prévia local da primeira foto nova (blob) */
  useEffect(() => {
    if (pendingHeroFiles.length === 0) {
      setPreviewBlobUrl(null);
      return;
    }
    const url = URL.createObjectURL(pendingHeroFiles[0]);
    setPreviewBlobUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [pendingHeroFiles]);

  function addBannerFiles(fileList: FileList | File[]) {
    const list = Array.from(fileList).filter((f) => f.type.startsWith("image/"));
    if (list.length) setPendingHeroFiles((prev) => [...prev, ...list]);
  }

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
        .select("id, name, slug, storefront")
        .eq("user_id", user.id)
        .single();
      if (!store) {
        router.push("/dashboard");
        return;
      }
      setStoreId(store.id);
      setStoreName(typeof store.name === "string" ? store.name : "");
      setStoreSlug(typeof store.slug === "string" ? store.slug : "");
      setSf(storefrontFromDb(store.storefront));
      setLoading(false);
    }
    load();
  }, [router]);

  function setBullet(i: number, value: string) {
    setSf((prev) => {
      const next = [...prev.infoBullets];
      next[i] = value;
      return { ...prev, infoBullets: next };
    });
  }

  function addBullet() {
    setSf((prev) => ({
      ...prev,
      infoBullets: [...prev.infoBullets, ""],
    }));
  }

  function removeBullet(i: number) {
    setSf((prev) => ({
      ...prev,
      infoBullets: prev.infoBullets.filter((_, j) => j !== i),
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!storeId) return;
    setSaving(true);
    setError("");
    setSuccess(false);

    try {
      const supabase = createClient();
      const maxHero = 10;
      let heroImages = [...sf.heroImages];

      if (heroImages.length + pendingHeroFiles.length > maxHero) {
        setError(
          `No máximo ${maxHero} fotos no banner. Remova algumas ou envie menos arquivos.`
        );
        setSaving(false);
        return;
      }

      for (let i = 0; i < pendingHeroFiles.length; i++) {
        const file = pendingHeroFiles[i];
        const ext = file.name.split(".").pop() || "jpg";
        const fileName = `${storeId}/storefront-hero-${Date.now()}-${i}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("product-images")
          .upload(fileName, file);
        if (upErr) {
          setError("Erro ao enviar imagem do banner: " + upErr.message);
          setSaving(false);
          return;
        }
        const { data: urlData } = supabase.storage
          .from("product-images")
          .getPublicUrl(fileName);
        heroImages.push(urlData.publicUrl);
      }

      const ig = normalizeInstagramUrl(sf.instagramUrl);
      const fb = sf.facebookUrl.trim()
        ? normalizeSocialUrl(sf.facebookUrl)
        : "";
      const tr = sf.tiktokUrl.trim();
      const tt = tr
        ? /^https?:\/\//i.test(tr)
          ? tr
          : `https://www.tiktok.com/@${tr.replace(/^@/, "")}`
        : "";

      const payload = storefrontToDb({
        ...sf,
        heroImages,
        instagramUrl: ig,
        facebookUrl: fb,
        tiktokUrl: tt,
      });
      const { error: up } = await supabase
        .from("stores")
        .update({
          storefront: payload,
          updated_at: new Date().toISOString(),
        })
        .eq("id", storeId);

      if (up) {
        if (up.message?.includes("storefront") || up.code === "PGRST204") {
          setError(
            "Ative a coluna storefront no Supabase: rode supabase-migration-storefront-promo.sql"
          );
        } else {
          setError(up.message);
        }
        setSaving(false);
        return;
      }

      setSf((prev) => ({
        ...prev,
        heroImages,
        instagramUrl: ig,
        facebookUrl: fb,
        tiktokUrl: tt,
      }));
      setPendingHeroFiles([]);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 4000);
    } catch {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin w-8 h-8 border-4 border-whatsapp border-t-transparent rounded-full" />
      </div>
    );
  }

  const heroPreviewTitle =
    sf.heroTitle.trim() || storeName || "Nome da sua loja";
  const bannerBgSrc = sf.heroImages[0] ?? previewBlobUrl;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/dashboard" className="text-xl font-bold text-slate-800">
            VendeWhat
          </Link>
          <Link
            href="/dashboard"
            className="text-sm text-slate-500 hover:text-slate-800 transition-colors"
          >
            ← Painel
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-slate-800 mb-1">
          Monte a sua loja
        </h1>
        <p className="text-slate-600 text-sm mb-2 max-w-2xl">
          Você vê abaixo uma <strong>prévia igual à loja do cliente</strong>.
          Comece pelo banner: <strong>clique na área grande</strong> para
          escolher fotos (ou arraste imagens para cima dela). Depois ajuste
          textos e cores — não precisa saber programação.
        </p>
        {storeSlug && (
          <p className="text-xs text-slate-500 mb-6">
            Link da sua loja:{" "}
            <Link
              href={`/loja/${storeSlug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-whatsapp font-medium hover:underline"
            >
              /loja/{storeSlug}
            </Link>{" "}
            (abre em nova aba após salvar)
          </p>
        )}

        {error && (
          <div className="mb-6 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
            {error}
          </div>
        )}
        {success && (
          <div className="mb-6 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-sm">
            Configurações salvas com sucesso.
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-8 bg-white rounded-xl p-6 shadow-sm border border-slate-100">
          {/* Passo 1 — banner visual clicável */}
          <section className="space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-whatsapp text-white text-sm font-bold shrink-0">
                1
              </span>
              <h2 className="text-base font-bold text-slate-800">
                Banner da loja — clique na imagem para adicionar fotos
              </h2>
            </div>
            <p className="text-xs text-slate-500 -mt-2 ml-10">
              Dica: fotos <span className="font-mono">1920 × 600 px</span>{" "}
              (largas) ficam perfeitas. Várias fotos viram carrossel (máx. 10).
            </p>

            <input
              ref={bannerInputRef}
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

            <button
              type="button"
              className={`relative w-full aspect-[1920/600] rounded-xl overflow-hidden border-2 text-left transition-all shadow-inner group focus:outline-none focus-visible:ring-2 focus-visible:ring-whatsapp focus-visible:ring-offset-2 ${
                bannerDrag
                  ? "border-whatsapp bg-whatsapp/10 scale-[1.01]"
                  : "border-slate-200 hover:border-whatsapp/60 bg-slate-100"
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
                    priority
                  />
                )
              ) : (
                <div
                  className="absolute inset-0 opacity-90"
                  style={{
                    background: `linear-gradient(135deg, ${sf.themeSecondary} 0%, ${sf.themePrimary} 100%)`,
                  }}
                />
              )}
              <div className="absolute inset-0 bg-gradient-to-r from-black/50 via-black/25 to-transparent pointer-events-none" />
              <div className="absolute inset-0 flex flex-col justify-end p-4 sm:p-6 md:p-8 max-w-xl pointer-events-none">
                {sf.heroSubtitle.trim() && (
                  <p className="text-[10px] sm:text-xs text-white/90 font-medium tracking-widest uppercase drop-shadow">
                    {sf.heroSubtitle}
                  </p>
                )}
                <h3 className="font-serif text-lg sm:text-2xl md:text-3xl font-bold text-white leading-tight mt-1 drop-shadow-lg line-clamp-2">
                  {heroPreviewTitle}
                </h3>
                <span
                  className="mt-3 inline-flex self-start px-3 py-1.5 rounded-md text-white text-[10px] sm:text-xs font-bold uppercase tracking-wide shadow-md"
                  style={{ backgroundColor: sf.themeSecondary }}
                >
                  {sf.heroCtaLabel || "Ver produtos"}
                </span>
              </div>
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="rounded-full bg-white/95 text-slate-800 px-4 py-2.5 sm:px-5 sm:py-3 shadow-lg text-sm font-semibold flex items-center gap-2 opacity-95 border border-slate-200">
                  <span className="text-lg" aria-hidden>
                    +
                  </span>
                  {bannerBgSrc
                    ? "Adicionar mais fotos"
                    : "Toque para escolher fotos"}
                </div>
              </div>
            </button>

            <div className="flex flex-wrap gap-3 items-start">
              {sf.heroImages.map((url, i) => (
                <div
                  key={`${url}-${i}`}
                  className="relative w-20 aspect-[1920/600] sm:w-24 rounded-lg overflow-hidden border border-slate-200 bg-slate-100 group shrink-0"
                >
                  <Image
                    src={url}
                    alt=""
                    fill
                    className="object-cover"
                    sizes="96px"
                  />
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSf((s) => ({
                        ...s,
                        heroImages: s.heroImages.filter((_, j) => j !== i),
                      }));
                    }}
                    className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/70 text-white text-xs flex items-center justify-center opacity-90 hover:opacity-100"
                    aria-label="Remover foto"
                  >
                    ×
                  </button>
                  <span className="absolute bottom-1 left-1 text-[9px] bg-black/55 text-white px-1 rounded">
                    {i + 1}
                  </span>
                </div>
              ))}
              {pendingHeroFiles.map((file, i) => (
                <div
                  key={`pending-${i}-${file.name}`}
                  className="relative w-20 aspect-[1920/600] sm:w-24 rounded-lg border-2 border-dashed border-whatsapp bg-whatsapp/5 flex flex-col items-center justify-center p-1 text-center shrink-0"
                >
                  <span className="text-[9px] text-whatsapp font-bold">
                    Nova
                  </span>
                  <span className="text-[8px] text-slate-500 line-clamp-2 mt-0.5">
                    {file.name}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setPendingHeroFiles((prev) =>
                        prev.filter((_, j) => j !== i)
                      )
                    }
                    className="mt-1 text-[9px] text-red-600 underline"
                  >
                    remover
                  </button>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-2 items-center text-sm">
              <button
                type="button"
                onClick={() => bannerInputRef.current?.click()}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-100 text-slate-800 font-medium hover:bg-slate-200 transition-colors"
              >
                📷 Escolher fotos no computador
              </button>
              {(sf.heroImages.length > 0 || pendingHeroFiles.length > 0) && (
                <button
                  type="button"
                  onClick={() => {
                    setSf((s) => ({ ...s, heroImages: [] }));
                    setPendingHeroFiles([]);
                  }}
                  className="text-xs text-red-600 hover:underline"
                >
                  Tirar todas as fotos do banner
                </button>
              )}
            </div>
          </section>

          {/* Passo 2 — textos do banner */}
          <section className="space-y-4 border-t border-slate-100 pt-8">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-slate-700 text-white text-sm font-bold shrink-0">
                2
              </span>
              <h2 className="text-base font-bold text-slate-800">
                Textos que aparecem em cima da foto
              </h2>
            </div>
            <p className="text-xs text-slate-500 ml-10 -mt-2">
              Eles já aparecem na prévia acima enquanto você digita.
            </p>
            <div className="space-y-3 ml-0 sm:ml-10">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Frase pequena no topo (opcional)
                </label>
                <input
                  type="text"
                  value={sf.heroSubtitle}
                  onChange={(e) =>
                    setSf((s) => ({ ...s, heroSubtitle: e.target.value }))
                  }
                  className="w-full px-4 py-2.5 rounded-lg border border-slate-200 text-sm"
                  placeholder="Ex: Moda feminina · Fabricação própria"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Título grande (deixe vazio para usar o nome da loja)
                </label>
                <input
                  type="text"
                  value={sf.heroTitle}
                  onChange={(e) =>
                    setSf((s) => ({ ...s, heroTitle: e.target.value }))
                  }
                  className="w-full px-4 py-2.5 rounded-lg border border-slate-200 text-sm"
                  placeholder="Ex: MODA FEMININA"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                    className="w-full px-4 py-2.5 rounded-lg border border-slate-200 text-sm"
                    placeholder="Ex: VER PRODUTOS"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Onde o botão leva
                  </label>
                  <input
                    type="text"
                    value={sf.heroCtaHref}
                    onChange={(e) =>
                      setSf((s) => ({ ...s, heroCtaHref: e.target.value }))
                    }
                    className="w-full px-4 py-2.5 rounded-lg border border-slate-200 text-sm font-mono"
                    placeholder="#catalogo"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    Use{" "}
                    <code className="bg-slate-100 px-1 rounded">#catalogo</code>{" "}
                    para rolar até os produtos.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Passo 3 — cores */}
          <section className="space-y-4 border-t border-slate-100 pt-8">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-slate-700 text-white text-sm font-bold shrink-0">
                3
              </span>
              <h2 className="text-base font-bold text-slate-800">
                Cores da loja (botões e detalhes)
              </h2>
            </div>
            <p className="text-xs text-slate-500 ml-10 -mt-2">
              Experimente até combinar com sua marca. A prévia do banner usa
              essas cores quando ainda não há foto.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 ml-0 sm:ml-10">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Cor principal (botões do catálogo)
                </label>
                <div className="flex gap-2 items-center">
                  <input
                    type="color"
                    value={sf.themePrimary}
                    onChange={(e) =>
                      setSf((s) => ({ ...s, themePrimary: e.target.value }))
                    }
                    className="h-10 w-14 rounded border border-slate-200 cursor-pointer"
                  />
                  <input
                    type="text"
                    value={sf.themePrimary}
                    onChange={(e) =>
                      setSf((s) => ({ ...s, themePrimary: e.target.value }))
                    }
                    className="flex-1 px-3 py-2 rounded-lg border border-slate-200 text-sm font-mono"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Cor escura (promoções e destaques)
                </label>
                <div className="flex gap-2 items-center">
                  <input
                    type="color"
                    value={sf.themeSecondary}
                    onChange={(e) =>
                      setSf((s) => ({ ...s, themeSecondary: e.target.value }))
                    }
                    className="h-10 w-14 rounded border border-slate-200 cursor-pointer"
                  />
                  <input
                    type="text"
                    value={sf.themeSecondary}
                    onChange={(e) =>
                      setSf((s) => ({ ...s, themeSecondary: e.target.value }))
                    }
                    className="flex-1 px-3 py-2 rounded-lg border border-slate-200 text-sm font-mono"
                  />
                </div>
              </div>
            </div>
          </section>

          <section className="space-y-4 border-t border-slate-100 pt-8">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-slate-700 text-white text-sm font-bold shrink-0">
                4
              </span>
              <h2 className="text-base font-bold text-slate-800">
                Redes sociais
              </h2>
            </div>
            <p className="text-xs text-slate-500 ml-10 -mt-2">
              Os links aparecem no rodapé da loja e no ícone do Instagram no topo
              (quando preenchido).
            </p>
            <div className="ml-0 sm:ml-10 space-y-3">
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
                className="w-full px-4 py-2.5 rounded-lg border border-slate-200 text-sm"
                placeholder="@sualoja ou https://instagram.com/sualoja"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Facebook <span className="text-slate-400">(opcional)</span>
              </label>
              <input
                type="text"
                value={sf.facebookUrl}
                onChange={(e) =>
                  setSf((s) => ({ ...s, facebookUrl: e.target.value }))
                }
                className="w-full px-4 py-2.5 rounded-lg border border-slate-200 text-sm"
                placeholder="https://facebook.com/sualoja"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                TikTok <span className="text-slate-400">(opcional)</span>
              </label>
              <input
                type="text"
                value={sf.tiktokUrl}
                onChange={(e) =>
                  setSf((s) => ({ ...s, tiktokUrl: e.target.value }))
                }
                className="w-full px-4 py-2.5 rounded-lg border border-slate-200 text-sm"
                placeholder="@usuario ou link completo"
              />
            </div>
            </div>
          </section>

          <section className="space-y-4 border-t border-slate-100 pt-8">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-slate-700 text-white text-sm font-bold shrink-0">
                5
              </span>
              <h2 className="text-base font-bold text-slate-800">
                Informações abaixo do logo
              </h2>
            </div>
            <p className="text-xs text-slate-500 ml-10 -mt-2">
              Lista com marcadores (ex.: pedido mínimo, atacado). Deixe em
              branco para ocultar.
            </p>
            <div className="space-y-2 ml-0 sm:ml-10">
              {sf.infoBullets.map((line, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    type="text"
                    value={line}
                    onChange={(e) => setBullet(i, e.target.value)}
                    className="flex-1 px-3 py-2 rounded-lg border border-slate-200 text-sm"
                    placeholder="Ex: Pedido mínimo R$ 280,00"
                  />
                  <button
                    type="button"
                    onClick={() => removeBullet(i)}
                    className="px-3 text-slate-400 hover:text-red-600 text-sm"
                  >
                    ✕
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={addBullet}
                className="text-sm text-whatsapp font-medium hover:underline"
              >
                + Adicionar linha
              </button>
            </div>
          </section>

          <section className="space-y-4 border-t border-slate-100 pt-8">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-slate-700 text-white text-sm font-bold shrink-0">
                6
              </span>
              <h2 className="text-base font-bold text-slate-800">
                Barra de busca
              </h2>
            </div>
            <div className="ml-0 sm:ml-10">
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Texto de exemplo dentro da busca
              </label>
              <input
                type="text"
                value={sf.searchPlaceholder}
                onChange={(e) =>
                  setSf((s) => ({ ...s, searchPlaceholder: e.target.value }))
                }
                className="w-full px-4 py-2.5 rounded-lg border border-slate-200 text-sm"
              />
            </div>
          </section>

          <div className="flex gap-3 pt-4 border-t border-slate-100">
            <Link
              href="/dashboard"
              className="flex-1 text-center py-3 bg-slate-100 text-slate-700 rounded-lg font-medium hover:bg-slate-200 transition-colors"
            >
              Voltar
            </Link>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-3 bg-whatsapp text-white rounded-lg font-semibold hover:bg-whatsapp-dark transition-all disabled:opacity-50"
            >
              {saving ? "Salvando..." : "Salvar aparência"}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
