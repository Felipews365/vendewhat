"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  ProductPhotosPicker,
  type PhotoItem,
} from "@/components/ProductPhotosPicker";
import { ProductOptionsEditor } from "@/components/ProductOptionsEditor";
import {
  ProductColorsEditor,
  type ColorOptionEntry,
} from "@/components/ProductColorsEditor";
import { VariantStockEditor } from "@/components/VariantStockEditor";
import {
  IMAGES_MIGRATION_HINT,
  OPTIONS_MIGRATION_HINT,
  VARIANT_STOCK_MIGRATION_HINT,
  PRODUCTS_RLS_INSERT_HINT,
  PRODUCT_REFERENCE_MIGRATION_HINT,
  COLOR_HEXES_MIGRATION_HINT,
  isMissingColumnError,
  isMissingOptionsOrVariantStockColumn,
  isRlsPolicyError,
} from "@/lib/dbColumnErrors";
import {
  type VariantStockRow,
  buildVariantCombinations,
  mergeVariantStockMap,
  rowsFromMap,
  sumVariantStockRows,
} from "@/lib/productVariants";
import { normalizeHex } from "@/lib/productColorHexes";

export default function NovoProdutoPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [colorEntries, setColorEntries] = useState<ColorOptionEntry[]>([]);
  const [sizes, setSizes] = useState<string[]>([]);
  const colors = useMemo(
    () => colorEntries.map((e) => e.name.trim()).filter(Boolean),
    [colorEntries]
  );
  const [variantStockMap, setVariantStockMap] = useState<Record<string, number>>(
    {}
  );
  const [form, setForm] = useState({
    name: "",
    productReference: "",
    description: "",
    price: "",
    compareAtPrice: "",
    stock: "0",
  });
  const [isPromotion, setIsPromotion] = useState(false);

  const hasVariantOptions = colors.length > 0 || sizes.length > 0;

  const colorsKey = colors.join("\0");
  const sizesKey = sizes.join("\0");

  useEffect(() => {
    if (!hasVariantOptions) {
      setVariantStockMap({});
      return;
    }
    setVariantStockMap((prev) => mergeVariantStockMap(prev, colors, sizes));
  }, [colorsKey, sizesKey, hasVariantOptions]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    setForm({ ...form, [e.target.name]: e.target.value });
    setError("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        router.push("/login");
        return;
      }

      const { data: store } = await supabase
        .from("stores")
        .select("id")
        .eq("user_id", user.id)
        .single();

      if (!store) {
        setError("Loja não encontrada");
        return;
      }

      const priceRaw = form.price.trim().replace(",", ".");
      const priceNum = parseFloat(priceRaw);
      if (!Number.isFinite(priceNum) || priceNum < 0) {
        setError("Informe um preço válido (ex.: 29,90 ou 29.90).");
        return;
      }

      const imageUrls: string[] = [];

      for (const item of photos) {
        if (item.kind !== "local") continue;
        const ext = item.file.name.split(".").pop() || "jpg";
        const fileName = `${store.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

        const { error: uploadError } = await supabase.storage
          .from("product-images")
          .upload(fileName, item.file);

        if (uploadError) {
          setError("Erro ao enviar imagem: " + uploadError.message);
          return;
        }

        const { data: urlData } = supabase.storage
          .from("product-images")
          .getPublicUrl(fileName);

        imageUrls.push(urlData.publicUrl);
      }

      let stockNum: number;
      let variant_stock: VariantStockRow[] = [];

      if (hasVariantOptions) {
        const combos = buildVariantCombinations(colors, sizes);
        variant_stock = rowsFromMap(combos, variantStockMap);
        stockNum = sumVariantStockRows(variant_stock);
      } else {
        stockNum = parseInt(form.stock, 10);
        if (Number.isNaN(stockNum) || stockNum < 0) stockNum = 0;
      }

      let compareAt: number | null = null;
      if (isPromotion && form.compareAtPrice.trim()) {
        const c = parseFloat(form.compareAtPrice.trim().replace(",", "."));
        if (!Number.isNaN(c) && c > 0) compareAt = c;
      }

      const refTrim = form.productReference.trim();
      const color_hexes: Record<string, string> = {};
      for (const e of colorEntries) {
        const n = e.name.trim();
        if (!n) continue;
        color_hexes[n] = normalizeHex(e.hex);
      }

      const payload: Record<string, unknown> = {
        store_id: store.id,
        name: form.name.trim(),
        product_reference: refTrim || null,
        description: form.description.trim() || null,
        price: priceNum,
        stock: stockNum,
        active: true,
        image: imageUrls[0] ?? null,
        images: imageUrls,
        colors,
        color_hexes,
        sizes,
        variant_stock,
        is_promotion: isPromotion,
        compare_at_price: compareAt,
      };

      let insertError = (await supabase.from("products").insert(payload)).error;

      if (
        insertError &&
        isMissingColumnError(insertError.message, "images", insertError.code)
      ) {
        const { images: _i, ...withoutImages } = payload;
        insertError = (await supabase.from("products").insert(withoutImages))
          .error;
      }

      /* Sem cor/tamanho no formulário: não envia colunas que o banco ainda não tem */
      if (
        insertError &&
        !hasVariantOptions &&
        isMissingOptionsOrVariantStockColumn(
          insertError.message,
          insertError.code
        )
      ) {
        const {
          colors: _c,
          sizes: _s,
          variant_stock: _v,
          color_hexes: _ch,
          ...withoutOpts
        } = payload;
        insertError = (await supabase
          .from("products")
          .insert(withoutOpts)).error;
      }

      if (
        insertError &&
        (isMissingColumnError(
          insertError.message,
          "is_promotion",
          insertError.code
        ) ||
          isMissingColumnError(
            insertError.message,
            "compare_at_price",
            insertError.code
          ))
      ) {
        const {
          is_promotion: _p,
          compare_at_price: _ca,
          ...withoutPromo
        } = payload;
        insertError = (await supabase
          .from("products")
          .insert(withoutPromo)).error;
      }

      if (
        insertError &&
        isMissingColumnError(
          insertError.message,
          "product_reference",
          insertError.code
        )
      ) {
        const { product_reference: _pr, ...withoutRef } = payload;
        insertError = (await supabase.from("products").insert(withoutRef))
          .error;
      }

      if (
        insertError &&
        isMissingColumnError(
          insertError.message,
          "color_hexes",
          insertError.code
        )
      ) {
        const { color_hexes: _ch2, ...withoutHexes } = payload;
        insertError = (await supabase.from("products").insert(withoutHexes))
          .error;
      }

      /* Último recurso: só colunas básicas (banco antigo / colunas opcionais ausentes) */
      if (insertError && !isRlsPolicyError(insertError.message, insertError.code)) {
        const minimal: Record<string, unknown> = {
          store_id: store.id,
          name: form.name.trim(),
          description: form.description.trim() || null,
          price: priceNum,
          stock: stockNum,
          active: true,
          image: imageUrls[0] ?? null,
        };
        const retry = await supabase.from("products").insert(minimal);
        if (!retry.error) {
          insertError = null;
        } else {
          insertError = retry.error;
        }
      }

      if (insertError) {
        const msg = insertError.message || "";
        const code = insertError.code;
        console.error("[novo produto] insert falhou:", insertError);
        if (isRlsPolicyError(msg, code)) {
          setError(`${PRODUCTS_RLS_INSERT_HINT}\n\nDetalhe: ${msg}`);
        } else if (isMissingColumnError(msg, "images", code)) {
          setError(`${IMAGES_MIGRATION_HINT}\n\nDetalhe: ${msg}`);
        } else if (
          isMissingColumnError(msg, "colors", code) ||
          isMissingColumnError(msg, "sizes", code)
        ) {
          setError(
            `${OPTIONS_MIGRATION_HINT}\n\nDetalhe: ${msg}\n\n(Você cadastrou cor ou tamanho: o banco precisa dessas colunas.)`
          );
        } else if (isMissingColumnError(msg, "variant_stock", code)) {
          setError(
            `${VARIANT_STOCK_MIGRATION_HINT}\n\nDetalhe: ${msg}\n\n(Você cadastrou grade de estoque: rode a migração acima.)`
          );
        } else if (
          isMissingColumnError(msg, "is_promotion", code) ||
          isMissingColumnError(msg, "compare_at_price", code)
        ) {
          setError(
            `Ative promoções no banco: rode supabase-migration-storefront-promo.sql\n\nDetalhe: ${msg}`
          );
        } else if (isMissingColumnError(msg, "product_reference", code)) {
          setError(`${PRODUCT_REFERENCE_MIGRATION_HINT}\n\nDetalhe: ${msg}`);
        } else if (isMissingColumnError(msg, "color_hexes", code)) {
          setError(`${COLOR_HEXES_MIGRATION_HINT}\n\nDetalhe: ${msg}`);
        } else {
          const hint = [insertError.hint, insertError.details]
            .filter(Boolean)
            .join("\n");
          setError(
            "Erro ao salvar produto: " +
              insertError.message +
              (hint ? `\n\n${hint}` : "") +
              (code ? `\n(código: ${code})` : "")
          );
        }
        return;
      }

      router.push("/dashboard/produtos");
      router.refresh();
    } catch {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/dashboard" className="text-xl font-bold text-slate-800">
            VendeWhat
          </Link>
          <Link
            href="/dashboard/produtos"
            className="text-sm text-slate-500 hover:text-slate-800 transition-colors"
          >
            ← Voltar aos produtos
          </Link>
        </div>
      </header>

      <main className="max-w-xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-slate-800 mb-8">
          Novo produto
        </h1>

        {error && (
          <div className="mb-6 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm whitespace-pre-wrap break-words">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <ProductPhotosPicker items={photos} onItemsChange={setPhotos} />

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Nome do produto
            </label>
            <input
              type="text"
              name="name"
              value={form.name}
              onChange={handleChange}
              placeholder="Ex: Camiseta Básica"
              required
              className="w-full px-4 py-3 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-whatsapp focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Referência do produto{" "}
              <span className="text-slate-400 font-normal">(opcional)</span>
            </label>
            <input
              type="text"
              name="productReference"
              value={form.productReference}
              onChange={handleChange}
              placeholder="Ex: REF-2024-01 ou código da etiqueta"
              className="w-full px-4 py-3 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-whatsapp focus:border-transparent"
            />
            <p className="text-xs text-slate-500 mt-1">
              Aparece na loja como &quot;Ref.&quot; e no pedido do WhatsApp.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Descrição <span className="text-slate-400">(opcional)</span>
            </label>
            <textarea
              name="description"
              value={form.description}
              onChange={handleChange}
              placeholder="Descreva o produto..."
              rows={3}
              className="w-full px-4 py-3 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-whatsapp focus:border-transparent resize-none"
            />
          </div>

          <section className="space-y-4 rounded-xl border-2 border-slate-200 bg-gradient-to-b from-white to-slate-50/80 p-4">
            <div>
              <h2 className="text-base font-bold text-slate-800">
                Cores e tamanhos deste produto
              </h2>
              <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                <strong>Obrigatório se o produto varia:</strong> cadastre cada
                cor e cada tamanho que você vende (ex.: Preto, Bege / P, M, G).
                Na loja, o cliente escolhe nas listas antes de comprar. Se não
                adicionar nada aqui, o produto é vendido sem escolha de cor ou
                tamanho.
              </p>
            </div>

            <ProductColorsEditor
              entries={colorEntries}
              onEntriesChange={setColorEntries}
            />

            <ProductOptionsEditor
              title="Tamanhos disponíveis"
              description='Ex.: roupas P, M, G, GG — ou numeração 36, 38, 40 — ou Único.'
              items={sizes}
              onItemsChange={setSizes}
              placeholder="Tamanho"
              addButtonLabel="Adicionar tamanho"
            />
          </section>

          {hasVariantOptions && (
            <VariantStockEditor
              colors={colors}
              sizes={sizes}
              value={variantStockMap}
              onChange={setVariantStockMap}
            />
          )}

          <section className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 space-y-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isPromotion}
                onChange={(e) => setIsPromotion(e.target.checked)}
                className="rounded border-slate-300 text-whatsapp focus:ring-whatsapp"
              />
              <span className="text-sm font-semibold text-slate-800">
                Exibir em &quot;Promoções&quot; na loja
              </span>
            </label>
            <p className="text-xs text-slate-500">
              Na vitrine, promoções ficam numa grade à parte, com botão escuro e
              preço &quot;De&quot; riscado (opcional).
            </p>
            {isPromotion && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Preço &quot;De&quot; (R$) <span className="text-slate-400">opcional</span>
                </label>
                <input
                  type="number"
                  name="compareAtPrice"
                  value={form.compareAtPrice}
                  onChange={handleChange}
                  placeholder="Ex: 35.00 (aparece riscado)"
                  step="0.01"
                  min="0"
                  className="w-full px-4 py-3 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-whatsapp focus:border-transparent"
                />
              </div>
            )}
          </section>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Preço atual (R$)
              </label>
              <input
                type="number"
                name="price"
                value={form.price}
                onChange={handleChange}
                placeholder="0.00"
                step="0.01"
                min="0"
                required
                className="w-full px-4 py-3 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-whatsapp focus:border-transparent"
              />
            </div>
            {!hasVariantOptions && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Estoque
                </label>
                <input
                  type="number"
                  name="stock"
                  value={form.stock}
                  onChange={handleChange}
                  min="0"
                  required
                  className="w-full px-4 py-3 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-whatsapp focus:border-transparent"
                />
              </div>
            )}
          </div>

          {hasVariantOptions && (
            <p className="text-xs text-slate-500 -mt-2">
              O campo &quot;Estoque total&quot; é preenchido automaticamente pela soma
              das quantidades da grade (também usado na listagem de produtos).
            </p>
          )}

          <div className="flex gap-3 pt-4">
            <Link
              href="/dashboard/produtos"
              className="flex-1 text-center py-3 bg-slate-100 text-slate-700 rounded-lg font-medium hover:bg-slate-200 transition-colors"
            >
              Cancelar
            </Link>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-3 bg-whatsapp text-white rounded-lg font-semibold hover:bg-whatsapp-dark transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Salvando..." : "Salvar produto"}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
