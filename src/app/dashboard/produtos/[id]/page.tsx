"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  ProductPhotosPicker,
  type PhotoItem,
} from "@/components/ProductPhotosPicker";
import {
  getProductImageUrls,
  storagePathsFromProductUrls,
} from "@/lib/productImages";
import { optionArrayFromDb } from "@/lib/productOptions";
import {
  IMAGES_MIGRATION_HINT,
  OPTIONS_MIGRATION_HINT,
  VARIANT_STOCK_MIGRATION_HINT,
  PRODUCT_REFERENCE_MIGRATION_HINT,
  COLOR_HEXES_MIGRATION_HINT,
  isMissingColumnError,
  isMissingOptionsOrVariantStockColumn,
} from "@/lib/dbColumnErrors";
import {
  type VariantStockRow,
  buildVariantCombinations,
  mapFromVariantRows,
  mergeVariantStockMap,
  rowsFromMap,
  sumVariantStockRows,
  variantStockFromDb,
} from "@/lib/productVariants";
import { ProductOptionsEditor } from "@/components/ProductOptionsEditor";
import {
  ProductColorsEditor,
  type ColorOptionEntry,
} from "@/components/ProductColorsEditor";
import { VariantStockEditor } from "@/components/VariantStockEditor";
import { colorHexesFromDb, normalizeHex } from "@/lib/productColorHexes";
import { defaultPickerHex } from "@/lib/colorSwatch";

function remotePhotoId(url: string) {
  return `remote-${url}`;
}

export default function EditarProdutoPage() {
  const router = useRouter();
  const params = useParams();
  const productId = params.id as string;
  const initialRemoteUrlsRef = useRef<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
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

  useEffect(() => {
    loadProduct();
  }, [productId]);

  async function loadProduct() {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.push("/login");
      return;
    }

    const { data: product } = await supabase
      .from("products")
      .select("*")
      .eq("id", productId)
      .single();

    if (!product) {
      router.push("/dashboard/produtos");
      return;
    }

    const row = product as {
      is_promotion?: boolean;
      compare_at_price?: number | null;
      product_reference?: string | null;
      color_hexes?: unknown;
    };
    setForm({
      name: product.name,
      productReference: row.product_reference?.trim() ?? "",
      description: product.description || "",
      price: product.price.toString(),
      compareAtPrice:
        row.compare_at_price != null ? String(row.compare_at_price) : "",
      stock: product.stock.toString(),
    });
    setIsPromotion(Boolean(row.is_promotion));
    const cols = optionArrayFromDb(product.colors);
    const szs = optionArrayFromDb(product.sizes);
    const hexes = colorHexesFromDb(row.color_hexes);
    setColorEntries(
      cols.map((name) => ({
        name,
        hex: hexes[name] || defaultPickerHex(name),
      }))
    );
    setSizes(szs);
    const combos = buildVariantCombinations(cols, szs);
    const rows = variantStockFromDb(product.variant_stock);
    setVariantStockMap(
      combos.length > 0 ? mapFromVariantRows(combos, rows) : {}
    );

    const urls = getProductImageUrls(product);
    initialRemoteUrlsRef.current = [...urls];
    setPhotos(
      urls.map((url) => ({
        id: remotePhotoId(url),
        kind: "remote" as const,
        url,
      }))
    );
    setPageLoading(false);
  }

  const hasVariantOptions = colors.length > 0 || sizes.length > 0;
  const colorsKey = colors.join("\0");
  const sizesKey = sizes.join("\0");

  useEffect(() => {
    if (pageLoading) return;
    if (colors.length === 0 && sizes.length === 0) {
      setVariantStockMap({});
      return;
    }
    setVariantStockMap((prev) => mergeVariantStockMap(prev, colors, sizes));
  }, [colorsKey, sizesKey, pageLoading]);

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

      const finalUrls: string[] = [];

      for (const item of photos) {
        if (item.kind === "remote") {
          finalUrls.push(item.url);
          continue;
        }

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

        finalUrls.push(urlData.publicUrl);
      }

      const removedUrls = initialRemoteUrlsRef.current.filter(
        (u) => !finalUrls.includes(u)
      );
      const pathsToRemove = storagePathsFromProductUrls(removedUrls);
      if (pathsToRemove.length > 0) {
        await supabase.storage.from("product-images").remove(pathsToRemove);
      }

      const hasOpts = colors.length > 0 || sizes.length > 0;
      let stockNum: number;
      let variant_stock: VariantStockRow[] = [];
      if (hasOpts) {
        const combos = buildVariantCombinations(colors, sizes);
        variant_stock = rowsFromMap(combos, variantStockMap);
        stockNum = sumVariantStockRows(variant_stock);
      } else {
        stockNum = parseInt(form.stock, 10);
        if (Number.isNaN(stockNum) || stockNum < 0) stockNum = 0;
      }

      let compareAt: number | null = null;
      if (isPromotion && form.compareAtPrice.trim()) {
        const c = parseFloat(form.compareAtPrice);
        if (!Number.isNaN(c) && c > 0) compareAt = c;
      }

      const refTrim = form.productReference.trim();
      const color_hexes: Record<string, string> = {};
      for (const e of colorEntries) {
        const n = e.name.trim();
        if (!n) continue;
        color_hexes[n] = normalizeHex(e.hex);
      }

      const updatePayload: Record<string, unknown> = {
        name: form.name,
        product_reference: refTrim || null,
        description: form.description || null,
        price: parseFloat(form.price),
        stock: stockNum,
        image: finalUrls[0] ?? null,
        images: finalUrls,
        colors,
        color_hexes,
        sizes,
        variant_stock,
        is_promotion: isPromotion,
        compare_at_price: compareAt,
        updated_at: new Date().toISOString(),
      };

      let updateError = (
        await supabase
          .from("products")
          .update(updatePayload)
          .eq("id", productId)
      ).error;

      if (
        updateError &&
        isMissingColumnError(updateError.message, "images", updateError.code)
      ) {
        const { images: _i, ...withoutImages } = updatePayload;
        updateError = (
          await supabase
            .from("products")
            .update(withoutImages)
            .eq("id", productId)
        ).error;
      }

      if (
        updateError &&
        !hasOpts &&
        isMissingOptionsOrVariantStockColumn(
          updateError.message,
          updateError.code
        )
      ) {
        const {
          colors: _c,
          sizes: _s,
          variant_stock: _v,
          color_hexes: _ch,
          ...withoutOpts
        } = updatePayload;
        updateError = (
          await supabase
            .from("products")
            .update(withoutOpts)
            .eq("id", productId)
        ).error;
      }

      if (
        updateError &&
        isMissingColumnError(
          updateError.message,
          "color_hexes",
          updateError.code
        )
      ) {
        const { color_hexes: _ch2, ...withoutHexes } = updatePayload;
        updateError = (
          await supabase
            .from("products")
            .update(withoutHexes)
            .eq("id", productId)
        ).error;
      }

      if (
        updateError &&
        (isMissingColumnError(
          updateError.message,
          "is_promotion",
          updateError.code
        ) ||
          isMissingColumnError(
            updateError.message,
            "compare_at_price",
            updateError.code
          ))
      ) {
        const {
          is_promotion: _p,
          compare_at_price: _ca,
          ...withoutPromo
        } = updatePayload;
        updateError = (
          await supabase
            .from("products")
            .update(withoutPromo)
            .eq("id", productId)
        ).error;
      }

      if (
        updateError &&
        isMissingColumnError(
          updateError.message,
          "product_reference",
          updateError.code
        )
      ) {
        const { product_reference: _pr, ...withoutRef } = updatePayload;
        updateError = (
          await supabase
            .from("products")
            .update(withoutRef)
            .eq("id", productId)
        ).error;
      }

      if (updateError) {
        const msg = updateError.message || "";
        const code = updateError.code;
        if (isMissingColumnError(msg, "images", code)) {
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
          setError("Erro ao atualizar produto: " + updateError.message);
        }
        return;
      }

      router.push("/dashboard/produtos");
    } catch {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  if (pageLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin w-8 h-8 border-4 border-whatsapp border-t-transparent rounded-full" />
      </div>
    );
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
          Editar produto
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
              placeholder="Ex: REF-2024-01"
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
                Cadastre as <strong>cores</strong> e <strong>tamanhos</strong> que
                este produto tem. Na loja, o cliente escolhe nas listas. Deixe
                vazio se o item não tem variação (um único SKU).
              </p>
            </div>

            <ProductColorsEditor
              entries={colorEntries}
              onEntriesChange={setColorEntries}
            />

            <ProductOptionsEditor
              title="Tamanhos disponíveis"
              description='P, M, G ou números — o que você usar na etiqueta.'
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
                  placeholder="Ex: 35.00"
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
              O estoque total do produto é a soma das quantidades da grade
              (usado na listagem).
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
              {loading ? "Salvando..." : "Salvar alterações"}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
