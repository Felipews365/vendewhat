"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
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
  PRODUCT_CATEGORY_MIGRATION_HINT,
  PRODUCT_IMAGE_POSITION_MIGRATION_HINT,
  COLOR_HEXES_MIGRATION_HINT,
  PRODUCTS_SELECT_WITHOUT_PRODUCT_REFERENCE,
  isMissingColumnError,
  isMissingOptionsOrVariantStockColumn,
} from "@/lib/dbColumnErrors";
import { ProductChooseCategoryModal } from "@/components/ProductChooseCategoryModal";
import { CategoryAutocompleteField } from "@/components/dashboard/CategoryAutocompleteField";
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
import {
  priceMoneyInputHandlers,
  priceNumberNoSpinnerClass,
} from "@/lib/priceInputBehavior";
import { defaultPickerHex } from "@/lib/colorSwatch";
import {
  IMAGE_OBJECT_POSITION_PRESETS,
  normalizeImageObjectPosition,
} from "@/lib/productImagePosition";

function remotePhotoId(url: string) {
  return `remote-${url}`;
}

type ProductTab = "produto" | "variacoes" | "estoque";

function TabButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`pb-3 px-1 text-sm font-semibold border-b-2 transition-colors ${
        active
          ? "border-landing-primary text-landing-primary"
          : "border-transparent text-slate-500 hover:text-slate-700"
      }`}
    >
      {children}
    </button>
  );
}

function SidebarRow({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center justify-between gap-2 py-3 px-3 rounded-xl border border-slate-100 bg-slate-50/80 hover:bg-teal-50/50 hover:border-teal-100 text-left text-sm text-slate-700 transition-colors"
    >
      <span className="flex items-center gap-2 min-w-0">
        <span className="text-lg shrink-0" aria-hidden>
          {icon}
        </span>
        <span className="font-medium truncate">{label}</span>
      </span>
      <span className="text-slate-400 shrink-0">›</span>
    </button>
  );
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
    category: "",
    imageObjectPosition: "center",
  });
  const [isPromotion, setIsPromotion] = useState(false);
  const [tab, setTab] = useState<ProductTab>("produto");
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [storeId, setStoreId] = useState<string | null>(null);
  const [categorySuggestionsRefresh, setCategorySuggestionsRefresh] = useState(0);

  const loadProduct = useCallback(
    async (opts?: { silent?: boolean }) => {
      const silent = opts?.silent ?? false;
      if (!silent) {
        setPageLoading(true);
        setError("");
      }

      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          router.push("/login");
          return;
        }

        let productRes = await supabase
          .from("products")
          .select("*")
          .eq("id", productId)
          .single();

        if (
          productRes.error &&
          isMissingColumnError(
            productRes.error.message,
            "product_reference",
            productRes.error.code
          )
        ) {
          productRes = await supabase
            .from("products")
            .select(PRODUCTS_SELECT_WITHOUT_PRODUCT_REFERENCE)
            .eq("id", productId)
            .single();
        }

        const { data: product, error: loadErr } = productRes;

        if (loadErr || !product) {
          if (
            loadErr &&
            isMissingColumnError(
              loadErr.message,
              "product_reference",
              loadErr.code
            )
          ) {
            setError(PRODUCT_REFERENCE_MIGRATION_HINT);
          } else if (!silent) {
            router.push("/dashboard/produtos");
          }
          return;
        }

        const row = product as {
          is_promotion?: boolean;
          compare_at_price?: number | null;
          product_reference?: string | null;
          color_hexes?: unknown;
          category?: string | null;
          image_object_position?: string | null;
        };
        const sid = (product as { store_id?: string }).store_id;
        setStoreId(typeof sid === "string" && sid ? sid : null);

        const catRaw = row.category;
        const categoryStr =
          typeof catRaw === "string"
            ? catRaw.trim()
            : catRaw != null
              ? String(catRaw).trim()
              : "";

        setForm({
          name: product.name,
          productReference: row.product_reference?.trim() ?? "",
          description: product.description || "",
          price: product.price.toString(),
          compareAtPrice:
            row.compare_at_price != null ? String(row.compare_at_price) : "",
          stock: product.stock.toString(),
          category: categoryStr,
          imageObjectPosition: normalizeImageObjectPosition(
            row.image_object_position
          ),
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
      } finally {
        if (!silent) setPageLoading(false);
      }
    },
    [productId, router]
  );

  useEffect(() => {
    void loadProduct();
  }, [loadProduct]);

  /** Voltar com “Anterior” pode restaurar a página do cache com estado velho — recarrega o produto. */
  useEffect(() => {
    function onPageShow(ev: PageTransitionEvent) {
      if (ev.persisted) void loadProduct({ silent: true });
    }
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, [loadProduct]);

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
        category: form.category.trim() || null,
        image_object_position: normalizeImageObjectPosition(
          form.imageObjectPosition
        ),
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

      if (
        updateError &&
        isMissingColumnError(
          updateError.message,
          "category",
          updateError.code
        )
      ) {
        const { category: _cat, ...withoutCat } = updatePayload;
        updateError = (
          await supabase
            .from("products")
            .update(withoutCat)
            .eq("id", productId)
        ).error;
      }

      if (
        updateError &&
        isMissingColumnError(
          updateError.message,
          "image_object_position",
          updateError.code
        )
      ) {
        const { image_object_position: _iop, ...withoutPos } = updatePayload;
        updateError = (
          await supabase
            .from("products")
            .update(withoutPos)
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
        } else if (isMissingColumnError(msg, "category", code)) {
          setError(`${PRODUCT_CATEGORY_MIGRATION_HINT}\n\nDetalhe: ${msg}`);
        } else if (isMissingColumnError(msg, "image_object_position", code)) {
          setError(`${PRODUCT_IMAGE_POSITION_MIGRATION_HINT}\n\nDetalhe: ${msg}`);
        } else {
          setError("Erro ao atualizar produto: " + updateError.message);
        }
        return;
      }

      router.refresh();
      router.push("/dashboard/produtos");
    } catch {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  const inputClass =
    "w-full px-3 py-2.5 rounded-lg border border-slate-200 bg-slate-50/50 text-sm focus:outline-none focus:ring-2 focus:ring-landing-primary/30 focus:border-landing-primary";

  if (pageLoading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center bg-[#f4f4f5]">
        <div className="animate-spin w-8 h-8 border-4 border-landing-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <main className="min-h-full bg-[#f4f4f5] pb-32">
      <div className="max-w-7xl mx-auto px-4 py-6">
        <Link
          href="/dashboard/produtos"
          className="inline-flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-landing-primary transition-colors"
        >
          <span aria-hidden>‹</span> Voltar aos produtos
        </Link>

        <div className="flex flex-wrap items-center gap-3 mt-4">
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">
            Editar produto
          </h1>
        </div>

        <div className="flex gap-8 mt-4 border-b border-slate-200">
          <TabButton active={tab === "produto"} onClick={() => setTab("produto")}>
            Produto
          </TabButton>
          <TabButton
            active={tab === "variacoes"}
            onClick={() => setTab("variacoes")}
          >
            Variações
          </TabButton>
          <TabButton active={tab === "estoque"} onClick={() => setTab("estoque")}>
            Estoque
          </TabButton>
        </div>

        {error && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm whitespace-pre-wrap break-words">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-6">
          {tab === "produto" && (
            <div className="grid lg:grid-cols-3 gap-8 lg:gap-0">
              <div className="lg:pr-8 lg:border-r border-slate-200 space-y-5">
                <div>
                  <label className="block text-sm font-semibold text-slate-800 mb-1.5">
                    Nome do produto <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="name"
                    value={form.name}
                    onChange={handleChange}
                    required
                    className={inputClass}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-semibold text-slate-800 mb-1.5">
                      Preço <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">
                        R$
                      </span>
                      <input
                        type="number"
                        name="price"
                        value={form.price}
                        onChange={handleChange}
                        placeholder="0,00"
                        step="0.01"
                        min="0"
                        required
                        inputMode="decimal"
                        {...priceMoneyInputHandlers({
                          onCommitFormatted: (value) =>
                            setForm((f) => ({ ...f, price: value })),
                        })}
                        className={`${inputClass} pl-10 ${priceNumberNoSpinnerClass}`}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-800 mb-1.5">
                      Promoção
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">
                        R$
                      </span>
                      <input
                        type="number"
                        name="compareAtPrice"
                        value={form.compareAtPrice}
                        onChange={handleChange}
                        placeholder="De (opcional)"
                        step="0.01"
                        min="0"
                        disabled={!isPromotion}
                        inputMode="decimal"
                        {...priceMoneyInputHandlers({
                          onCommitFormatted: (value) =>
                            setForm((f) => ({ ...f, compareAtPrice: value })),
                        })}
                        className={`${inputClass} pl-10 disabled:opacity-50 ${priceNumberNoSpinnerClass}`}
                      />
                    </div>
                    <label className="flex items-center gap-2 mt-2 text-xs text-slate-600 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isPromotion}
                        onChange={(e) => setIsPromotion(e.target.checked)}
                        className="rounded border-slate-300 text-landing-primary focus:ring-landing-primary"
                      />
                      Mostrar como promoção na loja
                    </label>
                  </div>
                </div>

                <ProductPhotosPicker
                  items={photos}
                  onItemsChange={setPhotos}
                  label="Fotos do produto"
                  variant="editor"
                />
                <div>
                  <label
                    htmlFor="vw-image-object-position"
                    className="block text-sm font-medium text-slate-700 mb-1.5"
                  >
                    Enquadramento na loja (1.ª foto)
                  </label>
                  <select
                    id="vw-image-object-position"
                    value={form.imageObjectPosition}
                    onChange={(e) => {
                      setForm((f) => ({
                        ...f,
                        imageObjectPosition: e.target.value,
                      }));
                      setError("");
                    }}
                    className={inputClass}
                  >
                    {IMAGE_OBJECT_POSITION_PRESETS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  <p className="text-[11px] text-slate-400 mt-1.5">
                    Só o cartão na grelha da loja usa recorte; ao abrir o produto, todas
                    as fotos aparecem inteiras.
                  </p>
                </div>
              </div>

              <div className="lg:px-8 lg:border-r border-slate-200 space-y-5 pt-8 lg:pt-0">
                <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wide">
                  Informações opcionais
                </h2>

                <div>
                  <label
                    htmlFor="vw-product-category"
                    className="block text-sm font-medium text-slate-700 mb-1.5"
                  >
                    Categorias
                  </label>
                  <CategoryAutocompleteField
                    id="vw-product-category"
                    value={form.category}
                    onChange={(v) => {
                      setForm((f) => ({ ...f, category: v }));
                      setError("");
                    }}
                    storeId={storeId}
                    suggestionsRefresh={categorySuggestionsRefresh}
                    onOpenAdvanced={() => setCategoryModalOpen(true)}
                    placeholder="Ex.: Bermuda — digite para ver sugestões"
                  />
                  <p className="text-[11px] text-slate-400 mt-1.5">
                    Sugestões vêm dos outros produtos e das categorias da aparência da loja.
                    O + abre o editor com foto e categoria pai.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Detalhes
                  </label>
                  <div className="rounded-t-lg border border-b-0 border-slate-200 bg-slate-100 px-2 py-1.5 flex gap-1">
                    <span className="text-xs px-2 py-1 rounded text-slate-500 bg-white border border-slate-200">
                      B
                    </span>
                    <span className="text-xs px-2 py-1 rounded text-slate-500 bg-white border border-slate-200">
                      I
                    </span>
                    <span className="text-xs px-2 py-1 rounded text-slate-500 bg-white border border-slate-200">
                      •
                    </span>
                  </div>
                  <textarea
                    name="description"
                    value={form.description}
                    onChange={handleChange}
                    placeholder="Descreva o produto para seus clientes…"
                    rows={6}
                    className={`${inputClass} rounded-t-none border-t-0 resize-y min-h-[140px]`}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Código / referência
                  </label>
                  <input
                    type="text"
                    name="productReference"
                    value={form.productReference}
                    onChange={handleChange}
                    placeholder="Ex: REF-2024-01"
                    className={inputClass}
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    Aparece na loja e no pedido do WhatsApp.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Vídeo do produto
                  </label>
                  <div className="rounded-lg border-2 border-dashed border-slate-200 bg-slate-50 py-8 text-center text-slate-400 text-sm">
                    <span className="text-2xl block mb-1">🎬</span>
                    Em breve
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Tags para busca
                  </label>
                  <div className={`${inputClass} text-slate-400 cursor-not-allowed`}>
                    Em breve
                  </div>
                </div>
              </div>

              <div className="lg:pl-8 space-y-5 pt-8 lg:pt-0">
                <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wide">
                  Detalhes técnicos
                </h2>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Tipo de unidade
                  </label>
                  <div className={inputClass}>Unidade</div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Dimensões da embalagem
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <div className={`${inputClass} text-slate-400 text-xs py-2`}>
                      Largura (cm) — em breve
                    </div>
                    <div className={`${inputClass} text-slate-400 text-xs py-2`}>
                      Peso — em breve
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <SidebarRow
                    icon="✎"
                    label="Descrição e código"
                    onClick={() => setTab("produto")}
                  />
                  <SidebarRow
                    icon="👕"
                    label="Variações (cor e tamanho)"
                    onClick={() => setTab("variacoes")}
                  />
                  <SidebarRow
                    icon="📦"
                    label="Estoque"
                    onClick={() => setTab("estoque")}
                  />
                  <SidebarRow
                    icon="▤"
                    label="Código de barras (EAN)"
                    onClick={() => {}}
                  />
                </div>
              </div>
            </div>
          )}

          {tab === "variacoes" && (
            <div className="max-w-2xl space-y-6">
              <p className="text-sm text-slate-600">
                Defina cores e tamanhos se o produto tiver variações. Na loja, o
                cliente escolhe antes de comprar.
              </p>
              <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-4 shadow-sm">
                <ProductColorsEditor
                  entries={colorEntries}
                  onEntriesChange={setColorEntries}
                />
                <ProductOptionsEditor
                  title="Tamanhos disponíveis"
                  description="Ex.: P, M, G ou 36, 38, 40."
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
            </div>
          )}

          {tab === "estoque" && (
            <div className="max-w-lg space-y-4">
              {hasVariantOptions ? (
                <p className="text-sm text-slate-600">
                  Com variações, as quantidades ficam na aba{" "}
                  <strong>Variações</strong> (grade por cor/tamanho). O total é a
                  soma automática.
                </p>
              ) : (
                <>
                  <label className="block text-sm font-semibold text-slate-800 mb-1.5">
                    Quantidade em estoque
                  </label>
                  <input
                    type="number"
                    name="stock"
                    value={form.stock}
                    onChange={handleChange}
                    min="0"
                    required
                    className={inputClass}
                  />
                </>
              )}
            </div>
          )}

          <div className="fixed bottom-0 left-0 right-0 lg:right-[118px] z-40 bg-white/95 border-t border-slate-200 backdrop-blur-sm">
            <div className="max-w-7xl mx-auto px-4 py-4 flex flex-col-reverse sm:flex-row gap-3 sm:justify-end sm:items-center">
              <Link
                href="/dashboard/produtos"
                className="px-6 py-3 rounded-xl border-2 border-slate-200 text-slate-700 font-semibold text-center hover:bg-slate-50 transition-colors"
              >
                Cancelar
              </Link>
              <button
                type="submit"
                disabled={loading}
                className="px-8 py-3 rounded-xl bg-landing-primary text-white font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 shadow-md"
              >
                {loading ? "Salvando…" : "Salvar"}
              </button>
            </div>
          </div>
        </form>
      </div>

      <ProductChooseCategoryModal
        open={categoryModalOpen}
        onClose={() => setCategoryModalOpen(false)}
        initialName={form.category}
        onSave={(name) => {
          setForm((f) => ({ ...f, category: name }));
          setCategorySuggestionsRefresh((n) => n + 1);
          setError("");
        }}
      />
    </main>
  );
}
