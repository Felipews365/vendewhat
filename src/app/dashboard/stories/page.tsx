"use client";

/**
 * Página dedicada dos STORIES da loja (a bolinha flutuante que abre um vídeo/
 * foto em tela cheia com o card de um produto embaixo, estilo Instagram).
 *
 * O produto é escolhido numa lista do catálogo e guardado como REFERÊNCIA
 * (`productId`), não como cópia — foto/nome/preço saem do cadastro na hora de
 * renderizar, então o lojista não precisa voltar aqui quando muda o preço.
 *
 * Tudo mora no JSONB `stores.storefront` (`stories` + `storiesEnabled`), sem
 * migration; a mídia vai para o bucket `product-images` (o mesmo do banner).
 */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  DEFAULT_STOREFRONT,
  MAX_STORIES,
  formatBRL,
  type StoreStory,
  type StorefrontSettings,
  storefrontFromDb,
  storefrontToDb,
} from "@/lib/storefront";
import { getProductImageUrls } from "@/lib/productImages";
import { useToast } from "@/components/Toast";

/** Teto do vídeo do story — o mesmo do vídeo de produto. */
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
/** Teto da foto do story. */
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

type PickerProduct = { id: string; name: string; price: number; image: string | null };

export default function StoriesPage() {
  const router = useRouter();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [storeId, setStoreId] = useState<string | null>(null);
  const [sf, setSf] = useState<StorefrontSettings>(DEFAULT_STOREFRONT);
  const [products, setProducts] = useState<PickerProduct[]>([]);
  const fileRef = useRef<HTMLInputElement | null>(null);

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

  const stories = sf.stories;

  const patchStory = (i: number, patch: Partial<StoreStory>) =>
    setSf((s) => ({
      ...s,
      stories: s.stories.map((st, j) => (j === i ? { ...st, ...patch } : st)),
    }));
  const removeStory = (i: number) =>
    setSf((s) => ({ ...s, stories: s.stories.filter((_, j) => j !== i) }));
  const moveStory = (i: number, dir: -1 | 1) =>
    setSf((s) => {
      const j = i + dir;
      if (j < 0 || j >= s.stories.length) return s;
      const next = [...s.stories];
      [next[i], next[j]] = [next[j]!, next[i]!];
      return { ...s, stories: next };
    });

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // permite reenviar o mesmo arquivo
    if (!file || !storeId) return;

    const isVideo = file.type.startsWith("video/");
    const isImage = file.type.startsWith("image/");
    if (!isVideo && !isImage) {
      showToast("Envie um vídeo (MP4) ou uma foto.", "error");
      return;
    }
    const max = isVideo ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
    if (file.size > max) {
      showToast(
        `Arquivo muito grande (máximo ${isVideo ? "50 MB" : "8 MB"}).`,
        "error"
      );
      return;
    }

    setUploading(true);
    try {
      const supabase = createClient();
      const ext = file.name.split(".").pop() || (isVideo ? "mp4" : "jpg");
      const fileName = `${storeId}/stories/${Date.now()}-${Math.round(
        Math.random() * 1e6
      )}.${ext}`;
      const { error } = await supabase.storage
        .from("product-images")
        .upload(fileName, file);
      if (error) {
        showToast("Erro ao enviar: " + error.message, "error");
        return;
      }
      const url = supabase.storage.from("product-images").getPublicUrl(fileName)
        .data.publicUrl;
      setSf((s) => ({
        ...s,
        stories: [
          ...s.stories,
          { mediaUrl: url, mediaType: isVideo ? "video" : "image", productId: "" },
        ],
      }));
      showToast("Story adicionado! Agora escolha o produto.");
    } finally {
      setUploading(false);
    }
  }

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
      showToast("Stories salvos!");
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
          Stories da loja
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Uma bolinha aparece flutuando na lateral da sua loja. O cliente toca e vê o seu
          vídeo (ou foto) em tela cheia, com o produto anunciado logo abaixo e um botão
          “Ver produto”.
        </p>
      </div>

      {/* Interruptor de mostrar/esconder — pedido do lojista: dá para desligar
          sem perder os stories já gravados. */}
      <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <input
          type="checkbox"
          checked={sf.storiesEnabled}
          onChange={(e) => setSf((s) => ({ ...s, storiesEnabled: e.target.checked }))}
          className="h-5 w-5 accent-landing-primary"
        />
        <span>
          <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100">
            Mostrar os stories na loja
          </span>
          <span className="block text-xs text-slate-500 dark:text-slate-400">
            Desmarque para esconder a bolinha sem apagar os stories.
          </span>
        </span>
      </label>

      <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
          Seus stories ({stories.length}/{MAX_STORIES})
        </p>
        <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
          Eles passam na ordem da lista, um depois do outro.
        </p>

        <input
          ref={fileRef}
          type="file"
          accept="video/mp4,video/quicktime,video/*,image/*"
          onChange={handleFile}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading || stories.length >= MAX_STORIES}
          className="mb-4 w-full rounded-xl border-2 border-dashed border-slate-300 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          {uploading
            ? "Enviando…"
            : stories.length >= MAX_STORIES
              ? `Limite de ${MAX_STORIES} stories`
              : "+ Adicionar story (vídeo ou foto)"}
        </button>

        {stories.length === 0 ? (
          <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">
            Nenhum story ainda. Envie um vídeo do produto — é o que mais vende.
          </p>
        ) : (
          <div className="space-y-3">
            {stories.map((story, i) => (
              <div
                key={i}
                className="flex gap-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700"
              >
                {/* Prévia da mídia, no formato vertical do story. */}
                <div className="h-28 w-16 shrink-0 overflow-hidden rounded-lg bg-slate-900">
                  {story.mediaType === "video" ? (
                    <video
                      src={story.mediaUrl}
                      className="h-full w-full object-cover"
                      muted
                      playsInline
                    />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={story.mediaUrl}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                      Story {i + 1} · {story.mediaType === "video" ? "🎬 Vídeo" : "🖼️ Foto"}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => moveStory(i, -1)}
                        disabled={i === 0}
                        className="h-7 w-7 rounded border border-slate-200 text-slate-600 disabled:opacity-30 dark:border-slate-700 dark:text-slate-300"
                        aria-label="Subir"
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        onClick={() => moveStory(i, 1)}
                        disabled={i === stories.length - 1}
                        className="h-7 w-7 rounded border border-slate-200 text-slate-600 disabled:opacity-30 dark:border-slate-700 dark:text-slate-300"
                        aria-label="Descer"
                      >
                        ▼
                      </button>
                      <button
                        type="button"
                        onClick={() => removeStory(i)}
                        className="h-7 w-7 rounded border border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900"
                        aria-label="Remover"
                      >
                        ✕
                      </button>
                    </div>
                  </div>

                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
                      Produto anunciado
                    </span>
                    <select
                      value={story.productId}
                      onChange={(e) => patchStory(i, { productId: e.target.value })}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    >
                      <option value="">Sem produto (só o vídeo/foto)</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} — {formatBRL(p.price)}
                        </option>
                      ))}
                    </select>
                    <span className="mt-1 block text-[11px] text-slate-500 dark:text-slate-400">
                      A foto, o nome e o preço vêm do cadastro do produto — mudou lá, muda
                      aqui.
                    </span>
                  </label>
                </div>
              </div>
            ))}
          </div>
        )}

        {products.length === 0 && (
          <p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
            Você ainda não tem produtos cadastrados, então o story fica sem o card de
            produto.{" "}
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
