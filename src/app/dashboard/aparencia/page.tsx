"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  storefrontFromDb,
  storefrontToDb,
  type StorefrontSettings,
} from "@/lib/storefront";
import {
  STORE_THEMES,
  applyStoreTheme,
  detectActiveTheme,
  readableText,
  type StoreTheme,
} from "@/lib/storeThemes";
import { useToast } from "@/components/Toast";

/**
 * Mini-vitrine que mostra como o tema fica: barra de avisos, cabeçalho com
 * busca, fundo da página e um card de produto com botão (accent) e selo (escuro).
 * Renderiza com as cores do tema inline — é uma prévia fiel do que a loja monta.
 */
function ThemeMockup({ theme }: { theme: StoreTheme }) {
  const t = theme.tokens;
  return (
    <div
      className="overflow-hidden rounded-xl ring-1 ring-black/5 shadow-sm select-none"
      style={{ background: t.pageBackground }}
    >
      {/* Barra de avisos */}
      <div
        className="px-3 py-1 text-[9px] font-medium tracking-wide text-center"
        style={{
          background: t.announcementBarBg,
          color: readableText(t.announcementBarBg),
        }}
      >
        Frete grátis acima de R$ 79
      </div>
      {/* Cabeçalho */}
      <div
        className="flex items-center gap-2 px-3 py-2.5"
        style={{
          background: t.headerBackground,
          color: readableText(t.headerBackground),
        }}
      >
        <div
          className="h-5 w-5 shrink-0 rounded-full"
          style={{ background: t.themePrimary }}
        />
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-bold leading-none">Sua Loja</div>
          <div
            className="mt-0.5 text-[7px] font-semibold uppercase tracking-wider"
            style={{ color: t.themePrimary }}
          >
            Moda & Estilo
          </div>
        </div>
        <div className="h-4 w-14 rounded-full bg-white/85" />
      </div>
      {/* Corpo: card de produto */}
      <div className="p-3">
        <div className="rounded-lg bg-white p-2 ring-1 ring-black/5">
          <div className="mb-2 flex items-center justify-between">
            <div
              className="rounded px-1.5 py-0.5 text-[8px] font-bold text-white"
              style={{ background: t.themeSecondary }}
            >
              -20%
            </div>
            <div className="text-[8px] text-slate-400">Vestido</div>
          </div>
          <div className="h-10 rounded bg-slate-100" />
          <div className="mt-2 flex items-center justify-between">
            <div
              className="text-[11px] font-extrabold"
              style={{ color: t.themePrimary }}
            >
              R$ 89
            </div>
            <div
              className="rounded-md px-2 py-1 text-[8px] font-bold text-white"
              style={{ background: t.themePrimary }}
            >
              Comprar
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AparenciaPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [storeId, setStoreId] = useState<string | null>(null);
  const [storeSlug, setStoreSlug] = useState("");
  const [sf, setSf] = useState<StorefrontSettings | null>(null);
  /** Tema salvo/aplicado no banco. */
  const [appliedId, setAppliedId] = useState("");
  /** Tema em pré-visualização (clicado, ainda não salvo). */
  const [previewId, setPreviewId] = useState("");

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
      const active = detectActiveTheme(parsed);
      setStoreId(store.id);
      setStoreSlug(typeof store.slug === "string" ? store.slug : "");
      setSf(parsed);
      setAppliedId(active);
      setPreviewId(active);
      setLoading(false);
    }
    load();
  }, [router]);

  const previewTheme = useMemo(
    () => STORE_THEMES.find((t) => t.id === previewId) ?? null,
    [previewId]
  );

  const dirty = previewId !== appliedId && previewId !== "";

  async function handleApply() {
    if (!storeId || !sf || !previewId) return;
    setSaving(true);
    try {
      const supabase = createClient();
      const next = applyStoreTheme(sf, previewId);
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
      setAppliedId(previewId);
      showToast("Tema aplicado na sua loja!");
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
    <main className="max-w-4xl mx-auto px-4 py-8 pb-28">
      <div className="flex items-center gap-2 mb-1">
        <Link
          href="/dashboard/conta"
          className="text-sm text-landing-primary dark:text-violet-400 font-medium hover:underline"
        >
          ← Conta
        </Link>
      </div>
      <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
        Aparência da loja
      </h1>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
        Escolha um dos temas prontos abaixo. Cada um já vem com uma combinação de
        cores pensada para ficar bonita — é só clicar para ver a prévia e{" "}
        <strong>aplicar na sua loja</strong>
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
              ver loja
            </Link>
            )
          </>
        )}
        .
      </p>

      {/* Prévia grande do tema em foco */}
      {previewTheme && (
        <div className="mt-6 rounded-2xl border border-slate-100 bg-white dark:border-slate-800 dark:bg-slate-900 p-4 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="w-full sm:w-64 shrink-0">
              <ThemeMockup theme={previewTheme} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                  {previewTheme.name}
                </h2>
                {previewId === appliedId && (
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                    Tema atual
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                {previewTheme.description}
              </p>
              <div className="mt-3 flex items-center gap-1.5">
                {[
                  previewTheme.tokens.themePrimary,
                  previewTheme.tokens.themeSecondary,
                  previewTheme.tokens.headerBackground,
                  previewTheme.tokens.pageBackground,
                ].map((c) => (
                  <span
                    key={c}
                    className="h-6 w-6 rounded-full ring-1 ring-black/10"
                    style={{ background: c }}
                    title={c}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Grade de temas */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {STORE_THEMES.map((theme) => {
          const isApplied = theme.id === appliedId;
          const isPreview = theme.id === previewId;
          return (
            <button
              key={theme.id}
              type="button"
              onClick={() => setPreviewId(theme.id)}
              className={`group relative text-left rounded-2xl border bg-white dark:bg-slate-900 p-2 transition focus:outline-none ${
                isPreview
                  ? "border-landing-primary ring-2 ring-landing-primary/40 shadow-md"
                  : "border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 hover:shadow-sm"
              }`}
              aria-pressed={isPreview}
            >
              {isApplied && (
                <span className="absolute right-3 top-3 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white shadow">
                  <svg
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className="h-3.5 w-3.5"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.7 5.3a1 1 0 010 1.4l-8 8a1 1 0 01-1.4 0l-4-4a1 1 0 111.4-1.4l3.3 3.29 7.3-7.29a1 1 0 011.4 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                </span>
              )}
              <ThemeMockup theme={theme} />
              <div className="px-1 pb-0.5 pt-2">
                <div className="text-[13px] font-semibold text-slate-900 dark:text-slate-100">
                  {theme.name}
                </div>
                <div className="mt-0.5 line-clamp-1 text-[11px] text-slate-500 dark:text-slate-400">
                  {theme.description}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Barra de ação fixa */}
      <div className="fixed inset-x-0 bottom-16 md:bottom-0 z-20 border-t border-slate-200 bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0 text-sm text-slate-600 dark:text-slate-300">
            {dirty ? (
              <>
                Prévia:{" "}
                <strong className="text-slate-900 dark:text-slate-100">
                  {previewTheme?.name}
                </strong>
              </>
            ) : (
              <>Tema atual aplicado.</>
            )}
          </div>
          <button
            type="button"
            onClick={handleApply}
            disabled={saving || !dirty}
            className="shrink-0 rounded-xl bg-landing-primary px-6 py-3 text-sm font-bold text-white shadow-md transition hover:bg-landing-primary-hover disabled:opacity-50"
          >
            {saving ? "Aplicando..." : "Aplicar tema"}
          </button>
        </div>
      </div>
    </main>
  );
}
