"use client";

/**
 * Página dedicada dos PRODUTOS EM DESTAQUE — a faixa (carrossel contínuo) que
 * aparece na loja pública logo abaixo dos cards promocionais.
 *
 * O lojista escolhe: (1) mostrar ou não a faixa (`featuredEnabled`); (2) quais
 * produtos aparecem e (3) em que ordem (`featuredProductIds`, uma lista de IDs
 * na ordem de exibição). Lista vazia = a loja monta a vitrine sozinha
 * (promoções → novidades → demais) — o "modo automático".
 *
 * Os produtos são REFERÊNCIA (só o ID): foto/nome/preço saem do cadastro na
 * hora de renderizar. Tudo mora no JSONB `stores.storefront`, sem migration.
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import {
  DEFAULT_STOREFRONT,
  MAX_FEATURED_PRODUCTS,
  formatBRL,
  type StorefrontSettings,
  storefrontFromDb,
  storefrontToDb,
} from "@/lib/storefront";
import { getProductImageUrls } from "@/lib/productImages";
import { useToast } from "@/components/Toast";

type PickerProduct = {
  id: string;
  name: string;
  price: number;
  image: string | null;
};

export default function DestaquesPage() {
  const router = useRouter();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [storeId, setStoreId] = useState<string | null>(null);
  const [sf, setSf] = useState<StorefrontSettings>(DEFAULT_STOREFRONT);
  const [products, setProducts] = useState<PickerProduct[]>([]);

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

      const { data: rows } = await supabase
        .from("products")
        .select("*")
        .eq("store_id", store.id)
        .order("created_at", { ascending: false });
      setProducts(
        (rows ?? []).map((p) => ({
          id: p.id as string,
          name: (p.name as string) ?? "",
          price: Number(p.price) || 0,
          image:
            getProductImageUrls({
              image: (p as { image?: string | null }).image,
              images: (p as { images?: unknown }).images,
            })[0] ?? null,
        }))
      );
      setLoading(false);
    }
    load();
  }, [router]);

  const productById = useMemo(
    () => new Map(products.map((p) => [p.id, p])),
    [products]
  );
  const ids = sf.featuredProductIds;
  /** Produtos escolhidos, na ordem — ignora IDs de produtos já apagados. */
  const chosen = useMemo(
    () => ids.map((id) => productById.get(id)).filter((p): p is PickerProduct => Boolean(p)),
    [ids, productById]
  );
  const available = useMemo(
    () => products.filter((p) => !ids.includes(p.id)),
    [products, ids]
  );
  const atLimit = ids.length >= MAX_FEATURED_PRODUCTS;

  const setIds = (next: string[]) =>
    setSf((s) => ({ ...s, featuredProductIds: next.slice(0, MAX_FEATURED_PRODUCTS) }));
  const addProduct = (id: string) => {
    if (!id || ids.includes(id) || atLimit) return;
    setIds([...ids, id]);
  };
  const removeProduct = (id: string) => setIds(ids.filter((x) => x !== id));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    const next = [...ids];
    [next[i], next[j]] = [next[j]!, next[i]!];
    setIds(next);
  };

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
      showToast("Produtos em destaque salvos!");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16 text-center text-slate-500 dark:text-slate-400">
        Carregando…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <div className="mb-4">
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
          Produtos em destaque
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Uma faixa que passa sozinha (carrossel) aparece na sua loja logo abaixo dos
          cards coloridos, mostrando os produtos que você quer dar destaque.
        </p>
      </div>

      {/* Liga/desliga — esconde a faixa sem perder a escolha dos produtos. */}
      <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <input
          type="checkbox"
          checked={sf.featuredEnabled}
          onChange={(e) => setSf((s) => ({ ...s, featuredEnabled: e.target.checked }))}
          className="h-5 w-5 accent-landing-primary"
        />
        <span>
          <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100">
            Mostrar a faixa de destaques na loja
          </span>
          <span className="block text-xs text-slate-500 dark:text-slate-400">
            Desmarque para esconder a faixa sem perder os produtos escolhidos.
          </span>
        </span>
      </label>

      {/* Modo automático × escolha manual */}
      <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              Quais produtos aparecem ({chosen.length}/{MAX_FEATURED_PRODUCTS})
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {chosen.length === 0
                ? "Nenhum produto escolhido — a loja mostra sozinha as promoções e novidades (modo automático)."
                : "Passam na ordem da lista. Use ▲▼ para reordenar."}
            </p>
          </div>
          {chosen.length > 0 && (
            <button
              type="button"
              onClick={() => setIds([])}
              className="shrink-0 rounded-lg px-2 py-1 text-xs font-medium text-slate-500 underline hover:text-slate-700 dark:text-slate-400"
            >
              Voltar ao automático
            </button>
          )}
        </div>

        {/* Adicionar produto */}
        <div className="mb-4 flex flex-col gap-2 sm:flex-row">
          <select
            value=""
            onChange={(e) => addProduct(e.target.value)}
            disabled={atLimit || available.length === 0}
            className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          >
            <option value="">
              {atLimit
                ? `Limite de ${MAX_FEATURED_PRODUCTS} produtos`
                : available.length === 0
                  ? "Todos os produtos já estão na faixa"
                  : "+ Adicionar um produto à faixa…"}
            </option>
            {available.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} — {formatBRL(p.price)}
              </option>
            ))}
          </select>
        </div>

        {chosen.length === 0 ? (
          <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">
            Escolha produtos acima para montar a faixa você mesmo. Enquanto estiver
            vazia, a loja destaca sozinha as promoções e os lançamentos.
          </p>
        ) : (
          <ul className="space-y-2">
            {chosen.map((p, i) => (
              <li
                key={p.id}
                className="flex items-center gap-3 rounded-xl border border-slate-200 p-2 dark:border-slate-700"
              >
                <span className="w-5 shrink-0 text-center text-xs font-bold text-slate-400">
                  {i + 1}
                </span>
                <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-slate-100 dark:bg-slate-800">
                  {p.image ? (
                    <Image
                      src={p.image}
                      alt=""
                      fill
                      className="object-cover"
                      sizes="56px"
                    />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-lg opacity-40">
                      📦
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                    {p.name}
                  </p>
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                    {formatBRL(p.price)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => move(i, -1)}
                    disabled={i === 0}
                    className="h-7 w-7 rounded border border-slate-200 text-slate-600 disabled:opacity-30 dark:border-slate-700 dark:text-slate-300"
                    aria-label="Subir"
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    onClick={() => move(i, 1)}
                    disabled={i === chosen.length - 1}
                    className="h-7 w-7 rounded border border-slate-200 text-slate-600 disabled:opacity-30 dark:border-slate-700 dark:text-slate-300"
                    aria-label="Descer"
                  >
                    ▼
                  </button>
                  <button
                    type="button"
                    onClick={() => removeProduct(p.id)}
                    className="h-7 w-7 rounded border border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900"
                    aria-label="Remover"
                  >
                    ✕
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {products.length === 0 && (
          <p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
            Você ainda não tem produtos cadastrados.{" "}
            <Link href="/dashboard/produtos/novo" className="font-semibold underline">
              Cadastrar um produto
            </Link>
          </p>
        )}
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
          {saving ? "Salvando…" : "Salvar alterações"}
        </button>
      </div>
    </div>
  );
}
