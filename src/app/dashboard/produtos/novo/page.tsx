"use client";

import { useState, useEffect, useMemo, useRef } from "react";
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
  PRODUCT_CATEGORY_MIGRATION_HINT,
  PRODUCT_IMAGE_POSITION_MIGRATION_HINT,
  COLOR_HEXES_MIGRATION_HINT,
  isMissingColumnError,
  isMissingOptionsOrVariantStockColumn,
  isRlsPolicyError,
} from "@/lib/dbColumnErrors";
import { ProductChooseCategoryModal } from "@/components/ProductChooseCategoryModal";
import { CategoryAutocompleteField } from "@/components/dashboard/CategoryAutocompleteField";
import {
  type VariantStockRow,
  buildVariantCombinations,
  mergeVariantStockMap,
  rowsFromMap,
  sumVariantStockRows,
} from "@/lib/productVariants";
import { normalizeHex } from "@/lib/productColorHexes";
import {
  priceMoneyInputHandlers,
  priceNumberNoSpinnerClass,
} from "@/lib/priceInputBehavior";
import {
  IMAGE_OBJECT_POSITION_PRESETS,
  normalizeImageObjectPosition,
} from "@/lib/productImagePosition";

type ProductTab = "produto" | "variacoes" | "estoque";

const INITIAL_FORM = {
  name: "",
  productReference: "",
  description: "",
  price: "",
  compareAtPrice: "",
  stock: "0",
  category: "",
  imageObjectPosition: "center",
};

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

export default function NovoProdutoPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [saveOk, setSaveOk] = useState(false);
  const [tab, setTab] = useState<ProductTab>("produto");
  const saveNavRef = useRef<"stay" | "list">("list");
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
  const [form, setForm] = useState({ ...INITIAL_FORM });
  const [isPromotion, setIsPromotion] = useState(false);
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [storeId, setStoreId] = useState<string | null>(null);
  const [categorySuggestionsRefresh, setCategorySuggestionsRefresh] = useState(0);

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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      const { data: store } = await supabase
        .from("stores")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!cancelled && store?.id) setStoreId(store.id as string);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    setForm({ ...form, [e.target.name]: e.target.value });
    setError("");
    setSaveOk(false);
  }

  function resetAll() {
    setForm({ ...INITIAL_FORM });
    setPhotos([]);
    setColorEntries([]);
    setSizes([]);
    setVariantStockMap({});
    setIsPromotion(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const navigateToList = saveNavRef.current === "list";
    setLoading(true);
    setError("");
    setSaveOk(false);

    try {
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
        category: form.category.trim() || null,
        image_object_position: normalizeImageObjectPosition(
          form.imageObjectPosition
        ),
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

      if (
        insertError &&
        isMissingColumnError(
          insertError.message,
          "category",
          insertError.code
        )
      ) {
        const { category: _cat, ...withoutCat } = payload;
        insertError = (await supabase.from("products").insert(withoutCat))
          .error;
      }

      if (
        insertError &&
        isMissingColumnError(
          insertError.message,
          "image_object_position",
          insertError.code
        )
      ) {
        const { image_object_position: _iop, ...withoutPos } = payload;
        insertError = (await supabase.from("products").insert(withoutPos))
          .error;
      }

      if (insertError && !isRlsPolicyError(insertError.message, insertError.code)) {
        const minimal: Record<string, unknown> = {
          store_id: store.id,
          name: form.name.trim(),
          description: form.description.trim() || null,
          price: priceNum,
          stock: stockNum,
          active: true,
          image: imageUrls[0] ?? null,
          category: form.category.trim() || null,
          image_object_position: normalizeImageObjectPosition(
            form.imageObjectPosition
          ),
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
        } else if (isMissingColumnError(msg, "category", code)) {
          setError(`${PRODUCT_CATEGORY_MIGRATION_HINT}\n\nDetalhe: ${msg}`);
        } else if (isMissingColumnError(msg, "image_object_position", code)) {
          setError(`${PRODUCT_IMAGE_POSITION_MIGRATION_HINT}\n\nDetalhe: ${msg}`);
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

      if (navigateToList) {
        router.push("/dashboard/produtos");
        router.refresh();
      } else {
        resetAll();
        setSaveOk(true);
        setTab("produto");
      }
    } catch {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  const inputClass =
    "w-full px-3 py-2.5 rounded-lg border border-slate-200 bg-slate-50/50 text-sm focus:outline-none focus:ring-2 focus:ring-landing-primary/30 focus:border-landing-primary";

  return (
    <div className="min-h-screen bg-[#f4f4f5]">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <Link
            href="/dashboard"
            className="text-lg font-bold text-landing-primary tracking-tight"
          >
            VendeWhat
          </Link>
          <div className="flex items-center gap-3 text-slate-400 text-sm">
            <span className="hidden sm:inline" title="Ajuda">
              ❓
            </span>
            <span className="hidden sm:inline" title="Lista">
              ☰
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 pb-24">
        <Link
          href="/dashboard/produtos"
          className="inline-flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-landing-primary transition-colors"
        >
          <span aria-hidden>‹</span> Adicionar produto
        </Link>

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
        {saveOk && (
          <div className="mt-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-sm">
            Produto salvo. Pode cadastrar outro.
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-6">
          {tab === "produto" && (
            <div className="grid lg:grid-cols-3 gap-8 lg:gap-0">
              {/* Coluna esquerda */}
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
                    placeholder="Ex: Camiseta básica"
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
                    htmlFor="vw-new-image-object-position"
                    className="block text-sm font-medium text-slate-700 mb-1.5"
                  >
                    Enquadramento na loja (1.ª foto)
                  </label>
                  <select
                    id="vw-new-image-object-position"
                    value={form.imageObjectPosition}
                    onChange={(e) => {
                      setForm((f) => ({
                        ...f,
                        imageObjectPosition: e.target.value,
                      }));
                      setError("");
                      setSaveOk(false);
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

              {/* Coluna central */}
              <div className="lg:px-8 lg:border-r border-slate-200 space-y-5 pt-8 lg:pt-0">
                <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wide">
                  Informações opcionais
                </h2>

                <div>
                  <label
                    htmlFor="vw-new-product-category"
                    className="block text-sm font-medium text-slate-700 mb-1.5"
                  >
                    Categorias
                  </label>
                  <CategoryAutocompleteField
                    id="vw-new-product-category"
                    value={form.category}
                    onChange={(v) => {
                      setForm((f) => ({ ...f, category: v }));
                      setError("");
                      setSaveOk(false);
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

              {/* Coluna direita */}
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

          <div className="fixed bottom-0 left-0 right-0 bg-white/95 border-t border-slate-200 backdrop-blur-sm z-40">
            <div className="max-w-7xl mx-auto px-4 py-4 flex flex-col sm:flex-row gap-3 sm:justify-end sm:items-center">
              <button
                type="submit"
                disabled={loading}
                onMouseDown={() => {
                  saveNavRef.current = "stay";
                }}
                className="px-8 py-3 rounded-xl bg-landing-primary text-white font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 shadow-md"
              >
                {loading ? "Salvando…" : "Salvar"}
              </button>
              <button
                type="submit"
                disabled={loading}
                onMouseDown={() => {
                  saveNavRef.current = "list";
                }}
                className="px-6 py-3 rounded-xl border-2 border-landing-primary text-landing-primary font-semibold hover:bg-teal-50 transition-colors disabled:opacity-50"
              >
                {loading ? "Salvando…" : "Salvar e visualizar produtos"}
              </button>
            </div>
          </div>
        </form>
      </main>

      <ProductChooseCategoryModal
        open={categoryModalOpen}
        onClose={() => setCategoryModalOpen(false)}
        initialName={form.category}
        onSave={(name) => {
          setForm((f) => ({ ...f, category: name }));
          setCategorySuggestionsRefresh((n) => n + 1);
          setError("");
          setSaveOk(false);
        }}
      />
    </div>
  );
}
