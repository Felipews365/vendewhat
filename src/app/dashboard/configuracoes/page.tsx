"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  DEFAULT_STOREFRONT,
  MAX_PHOTOS_PER_CAROUSEL,
  carouselLimitForPlan,
  type StorefrontSettings,
  normalizeInstagramUrl,
  normalizeSocialUrl,
  storefrontFromDb,
  storefrontToDb,
} from "@/lib/storefront";
import { StoreSetupGuideModal } from "@/components/dashboard/StoreSetupGuideModal";
import {
  StoreVisualEditor,
  type CatalogPreviewProduct,
} from "@/components/dashboard/StoreVisualEditor";
import { getProductImageUrls } from "@/lib/productImages";
import { useToast } from "@/components/Toast";

export default function ConfiguracoesLojaPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [storeId, setStoreId] = useState<string | null>(null);
  const [storeName, setStoreName] = useState("");
  const [storeSlug, setStoreSlug] = useState("");
  const [storeLogo, setStoreLogo] = useState<string | null>(null);
  const [pendingLogoFile, setPendingLogoFile] = useState<File | null>(null);
  const [logoRemoved, setLogoRemoved] = useState(false);
  const [logoObjectUrl, setLogoObjectUrl] = useState<string | null>(null);
  const [sf, setSf] = useState<StorefrontSettings>({ ...DEFAULT_STOREFRONT });
  const [heroUploading, setHeroUploading] = useState(false);
  const [planId, setPlanId] = useState<string | null>(null);
  const [cheapestPlanId, setCheapestPlanId] = useState<string | null>(null);
  const [bannerDrag, setBannerDrag] = useState(false);
  const [showSetupGuide, setShowSetupGuide] = useState(false);
  const [catalogPreview, setCatalogPreview] = useState<CatalogPreviewProduct[]>(
    []
  );
  const bannerInputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  async function loadCatalogPreview(storeRowId: string) {
    const supabase = createClient();
    const { data } = await supabase
      .from("products")
      .select("*")
      .eq("store_id", storeRowId)
      .eq("active", true)
      .order("created_at", { ascending: false })
      .limit(32);
    const rows = data ?? [];
    setCatalogPreview(
      rows.map((p) => {
        const priceNum =
          typeof p.price === "number"
            ? p.price
            : parseFloat(String(p.price ?? 0)) || 0;
        const catRaw = (p as { category?: string | null }).category;
        const category =
          typeof catRaw === "string" && catRaw.trim() ? catRaw.trim() : null;
        return {
          id: String(p.id),
          name:
            typeof p.name === "string" && p.name.trim()
              ? p.name.trim()
              : "Produto",
          price: priceNum,
          imageUrl: getProductImageUrls(
            p as { image?: string | null; images?: unknown }
          )[0] ?? null,
          category,
        };
      })
    );
  }

  useEffect(() => {
    if (!pendingLogoFile) {
      setLogoObjectUrl(null);
      return;
    }
    const url = URL.createObjectURL(pendingLogoFile);
    setLogoObjectUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [pendingLogoFile]);

  const maxCarousels = carouselLimitForPlan(planId, cheapestPlanId);

  /** Envia fotos direto pro storage e já adiciona no carrossel indicado. */
  async function uploadHeroPhotos(
    carouselIndex: number,
    fileList: FileList | File[]
  ) {
    if (!storeId) return;
    const list = Array.from(fileList).filter((f) => f.type.startsWith("image/"));
    if (!list.length) return;
    const current = sf.heroCarousels[carouselIndex] ?? [];
    const free = MAX_PHOTOS_PER_CAROUSEL - current.length;
    if (free <= 0) {
      showToast(
        `Cada carrossel aceita no máximo ${MAX_PHOTOS_PER_CAROUSEL} fotos.`,
        "error"
      );
      return;
    }
    const toUpload = list.slice(0, free);
    if (list.length > free) {
      showToast(`Só cabem mais ${free} foto(s) neste carrossel.`, "error");
    }
    setHeroUploading(true);
    try {
      const supabase = createClient();
      const urls: string[] = [];
      for (let i = 0; i < toUpload.length; i++) {
        const file = toUpload[i];
        const ext = file.name.split(".").pop() || "jpg";
        const fileName = `${storeId}/storefront-hero-${Date.now()}-${i}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("product-images")
          .upload(fileName, file);
        if (upErr) {
          showToast("Erro ao enviar foto: " + upErr.message, "error");
          continue;
        }
        const { data } = supabase.storage
          .from("product-images")
          .getPublicUrl(fileName);
        urls.push(data.publicUrl);
      }
      if (urls.length) {
        setSf((s) => {
          const next = s.heroCarousels.map((c) => [...c]);
          while (next.length <= carouselIndex) next.push([]);
          next[carouselIndex] = [...next[carouselIndex], ...urls].slice(
            0,
            MAX_PHOTOS_PER_CAROUSEL
          );
          return { ...s, heroCarousels: next };
        });
      }
    } finally {
      setHeroUploading(false);
    }
  }

  function removeHeroPhoto(carouselIndex: number, photoIndex: number) {
    setSf((s) => {
      const next = s.heroCarousels
        .map((c, ci) =>
          ci === carouselIndex ? c.filter((_, pi) => pi !== photoIndex) : c
        )
        .filter((c) => c.length > 0);
      return { ...s, heroCarousels: next };
    });
  }

  function addCarousel() {
    setSf((s) => {
      if (s.heroCarousels.length >= maxCarousels) {
        showToast(
          `Seu plano permite até ${maxCarousels} carrosséis no banner.`,
          "error"
        );
        return s;
      }
      return { ...s, heroCarousels: [...s.heroCarousels, []] };
    });
  }

  function removeCarousel(carouselIndex: number) {
    setSf((s) => ({
      ...s,
      heroCarousels: s.heroCarousels.filter((_, i) => i !== carouselIndex),
    }));
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
        .select("id, name, slug, storefront, logo")
        .eq("user_id", user.id)
        .single();
      if (!store) {
        router.push("/dashboard");
        return;
      }
      setStoreId(store.id);
      setStoreName(typeof store.name === "string" ? store.name : "");
      setStoreSlug(typeof store.slug === "string" ? store.slug : "");
      setStoreLogo(
        typeof store.logo === "string" && store.logo.trim()
          ? store.logo.trim()
          : null
      );
      setSf(storefrontFromDb(store.storefront));

      // Plano da loja (define quantos carrosséis o banner permite).
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
      setPlanId(
        sub && typeof sub.plan_id === "string" ? sub.plan_id : null
      );
      setCheapestPlanId(
        planRows && planRows.length > 0 && typeof planRows[0].id === "string"
          ? planRows[0].id
          : "essencial"
      );

      await loadCatalogPreview(store.id);
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
      // As fotos do banner já foram enviadas ao escolher (upload imediato);
      // aqui só persistimos as URLs que estão em sf.heroCarousels.

      let nextLogo: string | null = storeLogo;
      if (logoRemoved) {
        nextLogo = null;
      }
      if (pendingLogoFile) {
        const ext = pendingLogoFile.name.split(".").pop() || "jpg";
        const fileName = `${storeId}/store-logo-${Date.now()}.${ext}`;
        const { error: logoErr } = await supabase.storage
          .from("product-images")
          .upload(fileName, pendingLogoFile);
        if (logoErr) {
          setError("Erro ao enviar logo: " + logoErr.message);
          setSaving(false);
          return;
        }
        const { data: logoUrlData } = supabase.storage
          .from("product-images")
          .getPublicUrl(fileName);
        nextLogo = logoUrlData.publicUrl;
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
        instagramUrl: ig,
        facebookUrl: fb,
        tiktokUrl: tt,
      });
      const { error: up } = await supabase
        .from("stores")
        .update({
          storefront: payload,
          logo: nextLogo,
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
        heroCarousels: prev.heroCarousels.filter((c) => c.length > 0),
        instagramUrl: ig,
        facebookUrl: fb,
        tiktokUrl: tt,
      }));
      setStoreLogo(nextLogo);
      setPendingLogoFile(null);
      setLogoRemoved(false);
      await loadCatalogPreview(storeId);
      setSuccess(true);
      showToast(`Loja “${storeName}” salva!`);
      setTimeout(() => setSuccess(false), 4000);
    } catch {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-landing-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  const heroPreviewTitle =
    sf.heroTitle.trim() || storeName || "Nome da sua loja";
  const bannerBgSrc = sf.heroCarousels[0]?.[0] ?? null;

  return (
    <main className="max-w-6xl mx-auto px-4 py-8">
      <StoreSetupGuideModal
        open={showSetupGuide}
        onClose={() => setShowSetupGuide(false)}
      />

      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between mb-1">
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Monte a sua loja</h1>
        <button
          type="button"
          onClick={() => setShowSetupGuide(true)}
          className="text-sm font-semibold text-landing-primary hover:text-landing-accent dark:text-violet-400 dark:hover:text-violet-300 underline-offset-2 hover:underline shrink-0 w-fit"
        >
          Ver passo a passo
        </button>
      </div>
      <p className="text-slate-600 dark:text-slate-300 text-sm mb-6 max-w-2xl leading-relaxed">
        Monte direto na vitrine: use os botões{" "}
        <strong className="text-landing-primary">+</strong>. A{" "}
        <strong>foto de capa é opcional</strong> — sem ela, a loja usa só as
        cores. Use <strong>Compartilhar sua loja</strong> no menu para copiar o
        link ou abrir a vitrine.
      </p>

      {storeSlug && (
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
          Loja pública:{" "}
          <Link
            href={`/loja/${storeSlug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-landing-primary dark:text-violet-400 font-medium hover:underline"
          >
            /loja/{storeSlug}
          </Link>{" "}
          — salve para publicar alterações.
        </p>
      )}

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 dark:bg-red-950/30 dark:border-red-900 dark:text-red-300 rounded-lg text-sm">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 dark:bg-emerald-950/30 dark:border-emerald-900 dark:text-emerald-300 rounded-lg text-sm">
          Loja salva com sucesso.
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <StoreVisualEditor
          storeId={storeId}
          storeName={storeName}
          storeSlug={storeSlug}
          storeLogoUrl={storeLogo}
          logoPreviewObjectUrl={logoObjectUrl}
          logoRemoved={logoRemoved}
          onLogoFile={(file) => {
            setPendingLogoFile(file);
            if (file) setLogoRemoved(false);
          }}
          onRemoveLogoClick={() => {
            setLogoRemoved(true);
            setPendingLogoFile(null);
          }}
          sf={sf}
          setSf={setSf}
          heroPreviewTitle={heroPreviewTitle}
          bannerBgSrc={bannerBgSrc}
          bannerInputRef={bannerInputRef}
          logoInputRef={logoInputRef}
          bannerDrag={bannerDrag}
          setBannerDrag={setBannerDrag}
          heroUploading={heroUploading}
          maxCarousels={maxCarousels}
          onUploadHeroPhotos={uploadHeroPhotos}
          onRemoveHeroPhoto={removeHeroPhoto}
          onAddCarousel={addCarousel}
          onRemoveCarousel={removeCarousel}
          setBullet={setBullet}
          addBullet={addBullet}
          removeBullet={removeBullet}
          catalogPreview={catalogPreview}
        />

        <div className="flex gap-3 pt-2">
          <Link
            href="/dashboard"
            className="flex-1 text-center py-3 bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200 rounded-xl font-medium hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
          >
            Voltar
          </Link>
          <button
            type="submit"
            disabled={saving}
            className="flex-1 py-3 bg-landing-primary text-white rounded-xl font-semibold hover:opacity-90 transition-all disabled:opacity-50"
          >
            {saving ? "Salvando..." : "Salvar loja"}
          </button>
        </div>
      </form>
    </main>
  );
}
