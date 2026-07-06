"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  storefrontFromDb,
  storefrontToDb,
  sanitizeFacebookPixelId,
  sanitizeGoogleTagId,
  type StorefrontSettings,
} from "@/lib/storefront";
import { useToast } from "@/components/Toast";

export default function PixelsPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [storeId, setStoreId] = useState<string | null>(null);
  const [storeSlug, setStoreSlug] = useState("");
  const [sf, setSf] = useState<StorefrontSettings | null>(null);
  const [fbId, setFbId] = useState("");
  const [gId, setGId] = useState("");

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
        .select("id, slug, storefront")
        .eq("user_id", user.id)
        .single();
      if (!store) {
        router.push("/dashboard");
        return;
      }
      const parsed = storefrontFromDb(store.storefront);
      setStoreId(store.id);
      setStoreSlug(typeof store.slug === "string" ? store.slug : "");
      setSf(parsed);
      setFbId(parsed.facebookPixelId);
      setGId(parsed.googleAnalyticsId);
      setLoading(false);
    }
    load();
  }, [router]);

  async function handleSave() {
    if (!storeId || !sf) return;
    setSaving(true);
    try {
      const supabase = createClient();
      const next: StorefrontSettings = {
        ...sf,
        facebookPixelId: sanitizeFacebookPixelId(fbId),
        googleAnalyticsId: sanitizeGoogleTagId(gId),
      };
      const { error } = await supabase
        .from("stores")
        .update({
          storefront: storefrontToDb(next),
          updated_at: new Date().toISOString(),
        })
        .eq("id", storeId);
      if (error) {
        showToast("Erro ao salvar: " + error.message, "error");
        return;
      }
      setSf(next);
      setFbId(next.facebookPixelId);
      setGId(next.googleAnalyticsId);
      showToast("Pixels salvos!");
    } catch {
      showToast("Erro de conexão. Tente novamente.", "error");
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

  return (
    <main className="max-w-xl mx-auto px-4 py-8 pb-16">
      <div className="flex items-center gap-2 mb-1">
        <Link
          href="/dashboard/conta"
          className="text-sm text-landing-primary dark:text-violet-400 font-medium hover:underline"
        >
          ← Conta
        </Link>
      </div>
      <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
        Pixels e rastreamento
      </h1>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
        Cole os seus códigos de rastreamento para medir visitas e criar públicos
        de anúncios. Os scripts carregam <strong>só na sua loja pública</strong>
        {storeSlug && (
          <>
            {" "}
            (
            <Link
              href={`/loja/${storeSlug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-landing-primary dark:text-violet-400 hover:underline"
            >
              /loja/{storeSlug}
            </Link>
            )
          </>
        )}
        . Deixe em branco se não usa.
      </p>

      <div className="mt-6 space-y-6">
        {/* Facebook / Meta */}
        <div className="rounded-2xl border border-slate-100 bg-white dark:border-slate-800 dark:bg-slate-900 p-5 shadow-sm">
          <label className="block text-sm font-semibold text-slate-800 dark:text-slate-100">
            Pixel do Facebook / Meta
          </label>
          <input
            type="text"
            inputMode="numeric"
            value={fbId}
            onChange={(e) =>
              setFbId(e.target.value.replace(/\D/g, "").slice(0, 20))
            }
            className="mt-2 w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 text-sm font-mono"
            placeholder="Ex.: 123456789012345"
          />
          <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
            É o número do Pixel no Gerenciador de Eventos do Meta (só dígitos).
            Ele dispara o evento <strong>PageView</strong> na sua loja.
          </p>
        </div>

        {/* Google */}
        <div className="rounded-2xl border border-slate-100 bg-white dark:border-slate-800 dark:bg-slate-900 p-5 shadow-sm">
          <label className="block text-sm font-semibold text-slate-800 dark:text-slate-100">
            Tag do Google
          </label>
          <input
            type="text"
            value={gId}
            onChange={(e) =>
              setGId(
                e.target.value
                  .toUpperCase()
                  .replace(/[^A-Z0-9-]/g, "")
                  .slice(0, 30)
              )
            }
            className="mt-2 w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 text-sm font-mono"
            placeholder="Ex.: G-XXXXXXXXXX"
          />
          <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
            Aceita Google Analytics 4 (<strong>G-…</strong>), Google Ads (
            <strong>AW-…</strong>) ou Tag Manager (<strong>GTM-…</strong>).
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="mt-8 w-full rounded-2xl bg-landing-primary py-4 text-center text-base font-bold text-white shadow-md transition hover:bg-landing-primary-hover disabled:opacity-50"
      >
        {saving ? "Salvando..." : "Salvar"}
      </button>
    </main>
  );
}
