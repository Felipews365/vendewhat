"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";

interface Store {
  id: string;
  slug: string;
  name: string | null;
}

export default function DashboardCompartilharPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [store, setStore] = useState<Store | null>(null);
  const [origin, setOrigin] = useState("");
  const [hasProducts, setHasProducts] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const downloadRef = useRef<HTMLAnchorElement | null>(null);

  useEffect(() => {
    const supabase = createClient();

    async function load() {
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();

      if (!authUser) {
        router.push("/login");
        return;
      }

      const { data: storeRow } = await supabase
        .from("stores")
        .select("id, slug, name")
        .eq("user_id", authUser.id)
        .single();

      if (storeRow?.id) {
        // Mesmo filtro do gerador do PDF (produtos ativos ou legado sem coluna),
        // para "tem produtos" bater com o que o catálogo realmente inclui.
        const { count } = await supabase
          .from("products")
          .select("id", { count: "exact", head: true })
          .eq("store_id", storeRow.id)
          .or("active.eq.true,active.is.null");
        setHasProducts((count ?? 0) > 0);
      }

      setStore(storeRow as Store | null);
      setOrigin(window.location.origin);
      setLoading(false);
    }

    load();
  }, [router]);

  if (loading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-landing-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!store?.slug) return null;

  const slug = store.slug;
  const storeUrl = `${origin}/loja/${slug}`;
  // Rota que gera/reaproveita o PDF (mesma da IA/humanos). Sem param abre no
  // visualizador; com ?download=1 baixa de fato (ver a rota).
  const catalogOpenUrl = `${origin}/api/loja/${slug}/catalogo`;
  const catalogDownloadUrl = `${catalogOpenUrl}?download=1`;

  const catalogMessage = `Oi! 😊 Segue o nosso catálogo completo em PDF:\n\n${catalogOpenUrl}\n\nDá uma olhada com calma e me chama para fechar o seu pedido! 🛍️`;
  const whatsappShareUrl = `https://wa.me/?text=${encodeURIComponent(
    catalogMessage
  )}`;

  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      showToast(`${label} copiado!`);
    } catch {
      showToast("Não foi possível copiar. Copie manualmente.", "error");
    }
  }

  async function downloadCatalog() {
    if (downloading) return;
    setDownloading(true);
    try {
      const res = await fetch(catalogDownloadUrl);
      if (!res.ok) {
        showToast(
          hasProducts
            ? "Não foi possível gerar o catálogo agora. Tente de novo."
            : "Cadastre produtos para gerar o catálogo.",
          "error"
        );
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = downloadRef.current;
      if (a) {
        a.href = url;
        a.download = `Catálogo - ${store?.name?.trim() || "Loja"}.pdf`;
        a.click();
      }
      // Libera o object URL depois do clique (o download já começou).
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      showToast("Catálogo baixado!");
    } catch {
      showToast("Erro ao baixar o catálogo. Tente de novo.", "error");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <main className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <header>
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">
          Compartilhar sua loja
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Divulgue o link da loja e mande o catálogo em PDF para os seus
          clientes.
        </p>
      </header>

      {/* Link da loja */}
      <section className="bg-white dark:bg-slate-900 dark:ring-1 dark:ring-slate-800 rounded-2xl p-6 shadow-sm">
        <div className="flex items-start gap-3">
          <span className="text-2xl" aria-hidden>
            🔗
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              Link da loja
            </h2>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
              O endereço que abre a sua loja online, com todos os produtos.
            </p>
            <p className="mt-3 truncate rounded-lg bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm text-slate-700 dark:text-slate-200 font-medium">
              {storeUrl}
            </p>
            <div className="mt-3 flex flex-col sm:flex-row gap-2">
              <button
                type="button"
                onClick={() => copy(storeUrl, "Link da loja")}
                className="text-sm font-semibold bg-whatsapp text-white px-4 py-2.5 rounded-lg hover:bg-whatsapp-dark transition-colors"
              >
                Copiar link
              </button>
              <Link
                href={`/loja/${slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-semibold text-center border-2 border-whatsapp text-whatsapp px-4 py-2.5 rounded-lg hover:bg-whatsapp/5 transition-colors"
              >
                Abrir loja
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Catálogo em PDF */}
      <section className="bg-white dark:bg-slate-900 dark:ring-1 dark:ring-slate-800 rounded-2xl p-6 shadow-sm">
        <div className="flex items-start gap-3">
          <span className="text-2xl" aria-hidden>
            📄
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              Catálogo em PDF
            </h2>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
              Um PDF bonito com todos os seus produtos (foto, preço e detalhes),
              pronto para mandar no WhatsApp ou baixar.
            </p>

            {!hasProducts ? (
              <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10 px-3 py-2.5 text-sm text-amber-800 dark:text-amber-200">
                Cadastre pelo menos um produto para gerar o catálogo.{" "}
                <Link
                  href="/dashboard/produtos/novo"
                  className="font-semibold underline underline-offset-2"
                >
                  Cadastrar produto
                </Link>
              </div>
            ) : (
              <>
                <div className="mt-4 flex flex-col sm:flex-row gap-2">
                  <a
                    href={whatsappShareUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-2 text-sm font-semibold bg-whatsapp text-white px-4 py-2.5 rounded-lg hover:bg-whatsapp-dark transition-colors"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      className="h-4 w-4 fill-current"
                      aria-hidden
                    >
                      <path d="M17.5 14.4c-.3-.2-1.7-.9-2-1-.3-.1-.5-.2-.7.2-.2.3-.7 1-.9 1.1-.2.2-.3.2-.6.1-.3-.2-1.2-.5-2.3-1.4-.9-.8-1.4-1.7-1.6-2-.2-.3 0-.5.1-.6l.5-.5c.1-.2.2-.3.3-.5 0-.2 0-.4-.1-.5l-.9-2.1c-.2-.5-.4-.5-.6-.5h-.5c-.2 0-.5.1-.7.3-.3.3-1 .9-1 2.3 0 1.4 1 2.7 1.1 2.9.2.2 2 3.1 4.9 4.3.7.3 1.2.5 1.6.6.7.2 1.3.2 1.8.1.5-.1 1.7-.7 1.9-1.4.2-.7.2-1.2.2-1.4-.1-.1-.3-.2-.6-.4zM12 2a10 10 0 0 0-8.6 15l-1.3 4.7 4.9-1.3A10 10 0 1 0 12 2z" />
                    </svg>
                    Enviar no WhatsApp
                  </a>
                  <button
                    type="button"
                    onClick={downloadCatalog}
                    disabled={downloading}
                    className="inline-flex items-center justify-center gap-2 text-sm font-semibold border-2 border-whatsapp text-whatsapp px-4 py-2.5 rounded-lg hover:bg-whatsapp/5 transition-colors disabled:opacity-60 disabled:pointer-events-none"
                  >
                    {downloading ? (
                      <>
                        <span className="animate-spin w-4 h-4 border-2 border-whatsapp border-t-transparent rounded-full" />
                        Gerando…
                      </>
                    ) : (
                      "Baixar PDF"
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => copy(catalogOpenUrl, "Link do catálogo")}
                    className="inline-flex items-center justify-center text-sm font-semibold text-slate-600 dark:text-slate-300 px-4 py-2.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    Copiar link
                  </button>
                </div>
                <p className="mt-3 text-xs text-slate-400 dark:text-slate-500">
                  Sempre que você muda um produto, o catálogo já sai atualizado
                  no próximo envio ou download. Na primeira vez (ou logo após uma
                  mudança), gerar pode levar alguns segundos.
                </p>
              </>
            )}
          </div>
        </div>
      </section>

      {/* Âncora oculta usada para disparar o download do blob. */}
      <a ref={downloadRef} className="hidden" aria-hidden />
    </main>
  );
}
