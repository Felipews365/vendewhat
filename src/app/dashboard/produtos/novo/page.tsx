"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  ProductPhotosPicker,
  type PhotoItem,
} from "@/components/ProductPhotosPicker";
import {
  ProductOptionsEditor,
  SIZE_PRESET_GROUPS,
} from "@/components/ProductOptionsEditor";
import {
  ProductColorsEditor,
  type ColorOptionEntry,
} from "@/components/ProductColorsEditor";
import { VariantStockEditor } from "@/components/VariantStockEditor";
import { storefrontFromDb } from "@/lib/storefront";
import {
  IMAGES_MIGRATION_HINT,
  OPTIONS_MIGRATION_HINT,
  VARIANT_STOCK_MIGRATION_HINT,
  PRODUCTS_RLS_INSERT_HINT,
  PRODUCT_REFERENCE_MIGRATION_HINT,
  PRODUCT_CATEGORY_MIGRATION_HINT,
  PRODUCT_IMAGE_POSITION_MIGRATION_HINT,
  PRODUCT_IMAGE_POSITIONS_ARRAY_MIGRATION_HINT,
  COLOR_HEXES_MIGRATION_HINT,
  PRODUCT_DETAILS_MIGRATION_HINT,
  isMissingColumnError,
  isMissingOptionsOrVariantStockColumn,
  isMissingProductDetailColumn,
  isRlsPolicyError,
} from "@/lib/dbColumnErrors";
import {
  UNIT_TYPES,
  DEFAULT_UNIT_TYPE,
  sanitizeTags,
  sanitizeBarcode,
  dimensionFromInput,
} from "@/lib/productDetails";
import { ProductChooseCategoryModal } from "@/components/ProductChooseCategoryModal";
import { CategoryAutocompleteField } from "@/components/dashboard/CategoryAutocompleteField";
import {
  SaleModeFields,
  saleModeToDbColumns,
  INITIAL_SALE_MODE,
  type SaleModeValue,
} from "@/components/dashboard/SaleModeFields";
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
import { useToast } from "@/components/Toast";
import {
  IMAGE_OBJECT_POSITION_PRESETS,
  normalizeImageObjectPosition,
} from "@/lib/productImagePosition";
import {
  focusFromImageObjectPreset,
  serializeImageObjectPositions,
} from "@/lib/productImageFocus";

type ProductTab = "produto" | "variacoes" | "estoque";

// Limite prático para o vídeo do produto (upload ao bucket product-images).
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

const INITIAL_FORM = {
  name: "",
  productReference: "",
  description: "",
  price: "",
  compareAtPrice: "",
  stock: "0",
  category: "",
  imageObjectPosition: "center",
  unitType: DEFAULT_UNIT_TYPE,
  barcode: "",
  cardRatio: "3:4",
  packHeight: "",
  packWidth: "",
  packLength: "",
  packWeight: "",
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
          ? "border-landing-primary text-landing-primary dark:text-violet-400 dark:border-violet-400"
          : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
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
      className="w-full flex items-center justify-between gap-2 py-3 px-3 rounded-xl border border-slate-100 bg-slate-50/80 hover:bg-teal-50/50 hover:border-teal-100 dark:border-slate-800 dark:bg-slate-800/50 dark:hover:bg-slate-800 dark:hover:border-slate-700 text-left text-sm text-slate-700 dark:text-slate-200 transition-colors"
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
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [saveOk, setSaveOk] = useState(false);
  const [tab, setTab] = useState<ProductTab>("produto");
  const [stockControl, setStockControl] = useState(true);
  const saveNavRef = useRef<"stay" | "list">("list");
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [colorEntries, setColorEntries] = useState<ColorOptionEntry[]>([]);
  const [sizes, setSizes] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const colors = useMemo(
    () => colorEntries.map((e) => e.name.trim()).filter(Boolean),
    [colorEntries]
  );
  const [variantStockMap, setVariantStockMap] = useState<Record<string, number>>(
    {}
  );
  const [form, setForm] = useState({ ...INITIAL_FORM });
  // Pergunta o formato da foto (1:1 ou 3:4) logo ao abrir "Novo produto".
  const [askRatio, setAskRatio] = useState(true);
  const [saleMode, setSaleMode] = useState<SaleModeValue>({
    ...INITIAL_SALE_MODE,
  });
  const [isPromotion, setIsPromotion] = useState(false);
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [storeId, setStoreId] = useState<string | null>(null);
  const [categorySuggestionsRefresh, setCategorySuggestionsRefresh] = useState(0);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoUploading, setVideoUploading] = useState(false);

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
        .select("id, storefront")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!cancelled && store?.id) {
        setStoreId(store.id as string);
        setStockControl(storefrontFromDb(store.storefront).stockControlEnabled);
      }
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

  async function handleVideoUpload(file: File) {
    if (!file.type.startsWith("video/")) {
      setError("Envie um arquivo de vídeo.");
      return;
    }
    if (file.size > MAX_VIDEO_BYTES) {
      setError("O vídeo é muito grande (máx. 50MB).");
      return;
    }
    setVideoUploading(true);
    setError("");
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { data: store } = user
        ? await supabase.from("stores").select("id").eq("user_id", user.id).maybeSingle()
        : { data: null };
      const sid = (store?.id as string) || storeId;
      if (!sid) {
        setError("Loja não encontrada para enviar o vídeo.");
        return;
      }
      const ext = file.name.split(".").pop() || "mp4";
      const fileName = `${sid}/videos/${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("product-images")
        .upload(fileName, file, { contentType: file.type });
      if (upErr) {
        setError("Erro ao enviar vídeo: " + upErr.message);
        return;
      }
      const { data: urlData } = supabase.storage
        .from("product-images")
        .getPublicUrl(fileName);
      setVideoUrl(urlData.publicUrl);
      setSaveOk(false);
    } finally {
      setVideoUploading(false);
    }
  }

  function resetAll() {
    setForm({ ...INITIAL_FORM });
    setSaleMode({ ...INITIAL_SALE_MODE });
    setPhotos([]);
    setColorEntries([]);
    setSizes([]);
    setTags([]);
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
        video_url: videoUrl,
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
        image_object_positions: serializeImageObjectPositions(photos),
        tags: sanitizeTags(tags),
        unit_type: form.unitType || DEFAULT_UNIT_TYPE,
        barcode: sanitizeBarcode(form.barcode) || null,
        card_ratio: form.cardRatio || null,
        package_height: dimensionFromInput(form.packHeight),
        package_width: dimensionFromInput(form.packWidth),
        package_length: dimensionFromInput(form.packLength),
        package_weight: dimensionFromInput(form.packWeight),
        ...saleModeToDbColumns(saleMode),
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
        isMissingColumnError(insertError.message, "card_ratio", insertError.code)
      ) {
        const { card_ratio: _cr, ...withoutRatio } = payload;
        insertError = (await supabase.from("products").insert(withoutRatio))
          .error;
      }

      if (
        insertError &&
        isMissingColumnError(insertError.message, "video_url", insertError.code)
      ) {
        const { video_url: _vu, ...withoutVideo } = payload;
        insertError = (await supabase.from("products").insert(withoutVideo))
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

      if (
        insertError &&
        isMissingColumnError(
          insertError.message,
          "image_object_positions",
          insertError.code
        )
      ) {
        const { image_object_positions: _iopa, ...withoutPosArr } = payload;
        insertError = (await supabase.from("products").insert(withoutPosArr))
          .error;
      }

      if (
        insertError &&
        (isMissingColumnError(insertError.message, "sale_mode", insertError.code) ||
          isMissingColumnError(insertError.message, "pack_size", insertError.code) ||
          isMissingColumnError(
            insertError.message,
            "min_quantity",
            insertError.code
          ) ||
          isMissingColumnError(
            insertError.message,
            "price_display",
            insertError.code
          ))
      ) {
        const {
          sale_mode: _sm,
          pack_size: _ps,
          min_quantity: _mq,
          price_display: _pd,
          ...withoutSale
        } = payload;
        insertError = (await supabase.from("products").insert(withoutSale))
          .error;
      }

      // Colunas de detalhes (tags, unidade, EAN, dimensões) — todas da mesma
      // migration, então some/estão juntas: um único fallback tira as 7.
      if (
        insertError &&
        isMissingProductDetailColumn(insertError.message, insertError.code)
      ) {
        const {
          tags: _tg,
          unit_type: _ut,
          barcode: _bc,
          package_height: _ph,
          package_width: _pw,
          package_length: _pl,
          package_weight: _pwt,
          ...withoutDetails
        } = payload;
        insertError = (await supabase.from("products").insert(withoutDetails))
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
        } else if (isMissingColumnError(msg, "image_object_positions", code)) {
          setError(
            `${PRODUCT_IMAGE_POSITIONS_ARRAY_MIGRATION_HINT}\n\nDetalhe: ${msg}`
          );
        } else if (isMissingProductDetailColumn(msg, code)) {
          setError(`${PRODUCT_DETAILS_MIGRATION_HINT}\n\nDetalhe: ${msg}`);
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

      showToast(`Produto “${form.name.trim()}” salvo!`);
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
    "w-full px-3 py-2.5 rounded-lg border border-slate-200 bg-slate-50/50 text-sm focus:outline-none focus:ring-2 focus:ring-landing-primary/30 focus:border-landing-primary dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-100 dark:placeholder:text-slate-500";

  return (
    <div className="min-h-screen bg-[#f4f4f5] dark:bg-slate-950">
      {/* Pergunta o formato da foto ao começar um novo produto. */}
      {askRatio && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-900">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              Formato da foto deste produto
            </h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Como a foto vai aparecer na grade da loja. Dá pra mudar depois na
              aba Produto.
            </p>
            <div className="mt-5 grid grid-cols-2 gap-3">
              {(
                [
                  { v: "3:4", label: "Retrato", ratio: "aspect-[3/4]", hint: "3:4", recommended: true },
                  { v: "1:1", label: "Quadrado", ratio: "aspect-square", hint: "1:1", recommended: false },
                ] as { v: string; label: string; ratio: string; hint: string; recommended: boolean }[]
              ).map((opt) => (
                <button
                  key={opt.v}
                  type="button"
                  onClick={() => {
                    setForm((f) => ({ ...f, cardRatio: opt.v }));
                    setAskRatio(false);
                  }}
                  className={`relative flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-colors hover:bg-teal-50 dark:hover:bg-teal-900/20 ${
                    opt.recommended
                      ? "border-landing-primary bg-teal-50/50 dark:bg-teal-900/10"
                      : "border-slate-200 hover:border-landing-primary dark:border-slate-700"
                  }`}
                >
                  {opt.recommended && (
                    <span className="absolute -top-2 right-2 rounded-full bg-landing-primary px-2 py-0.5 text-[10px] font-bold text-white">
                      Recomendado
                    </span>
                  )}
                  <span
                    className={`${opt.ratio} w-16 rounded-lg bg-slate-200 dark:bg-slate-700`}
                  />
                  <span className="text-sm font-bold text-slate-800 dark:text-slate-100">
                    {opt.label}
                  </span>
                  <span className="text-[11px] text-slate-400">{opt.hint}</span>
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => {
                setForm((f) => ({ ...f, cardRatio: "" }));
                setAskRatio(false);
              }}
              className="mt-4 w-full rounded-xl bg-slate-100 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
            >
              Usar o padrão da loja
            </button>
          </div>
        </div>
      )}

      <header className="bg-white border-b border-slate-200 dark:bg-slate-900 dark:border-slate-800 sticky top-0 z-30">
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
          className="inline-flex items-center gap-1 text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-landing-primary dark:hover:text-violet-400 transition-colors"
        >
          <span aria-hidden>‹</span> Adicionar produto
        </Link>

        <div className="flex gap-8 mt-4 border-b border-slate-200 dark:border-slate-800">
          <TabButton active={tab === "produto"} onClick={() => setTab("produto")}>
            Produto
          </TabButton>
          <TabButton
            active={tab === "variacoes"}
            onClick={() => setTab("variacoes")}
          >
            Variações
          </TabButton>
          {stockControl && (
            <TabButton active={tab === "estoque"} onClick={() => setTab("estoque")}>
              Estoque
            </TabButton>
          )}
        </div>

        {error && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 text-red-700 dark:bg-red-950/30 dark:border-red-900 dark:text-red-300 rounded-xl text-sm whitespace-pre-wrap break-words">
            {error}
          </div>
        )}
        {saveOk && (
          <div className="mt-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 dark:bg-emerald-950/30 dark:border-emerald-900 dark:text-emerald-300 rounded-xl text-sm">
            Produto salvo. Pode cadastrar outro.
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-6">
          {tab === "produto" && (
            <div className="grid lg:grid-cols-3 gap-8 lg:gap-0">
              {/* Coluna esquerda */}
              <div className="lg:pr-8 lg:border-r border-slate-200 dark:border-slate-800 space-y-5">
                <div>
                  <label className="block text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1.5">
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
                    <label className="block text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1.5">
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
                    <label className="block text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1.5">
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
                    <label className="flex items-center gap-2 mt-2 text-xs text-slate-600 dark:text-slate-400 cursor-pointer">
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
                  photoAspect={form.cardRatio === "1:1" ? "1:1" : "3:4"}
                  onPhotoAspectChange={(r) =>
                    setForm((f) => ({ ...f, cardRatio: r }))
                  }
                />
                <div>
                  <label
                    htmlFor="vw-new-image-object-position"
                    className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                  >
                    Recorte no quadrado da loja (1.ª foto, 1:1)
                  </label>
                  <select
                    id="vw-new-image-object-position"
                    value={form.imageObjectPosition}
                    onChange={(e) => {
                      const v = e.target.value;
                      setForm((f) => ({ ...f, imageObjectPosition: v }));
                      setPhotos((prev) =>
                        prev.map((it, i) =>
                          i === 0
                            ? { ...it, focus: focusFromImageObjectPreset(v) }
                            : it
                        )
                      );
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
                    Pode arrastar a 1.ª foto na grelha acima ou usar este menu. Cada foto
                    tem o seu enquadramento (guardado ao salvar). Na loja, o detalhe do
                    produto continua a mostrar as imagens completas.
                  </p>
                </div>
              </div>

              {/* Coluna central */}
              <div className="lg:px-8 lg:border-r border-slate-200 dark:border-slate-800 space-y-5 pt-8 lg:pt-0">
                <h2 className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wide">
                  Informações opcionais
                </h2>

                <div>
                  <label
                    htmlFor="vw-new-product-category"
                    className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5"
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
                    placeholder="Toque para ver as suas categorias ou digite"
                  />
                  <p className="text-[11px] text-slate-400 mt-1.5">
                    Sugestões vêm dos outros produtos e das categorias da aparência da loja.
                    O + cria uma categoria da loja (com foto e categoria pai).
                  </p>
                </div>

                <SaleModeFields
                  value={saleMode}
                  onChange={(patch) => {
                    setSaleMode((s) => ({ ...s, ...patch }));
                    setError("");
                    setSaveOk(false);
                  }}
                />

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Detalhes
                  </label>
                  <div className="rounded-t-lg border border-b-0 border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-800 px-2 py-1.5 flex gap-1">
                    <span className="text-xs px-2 py-1 rounded text-slate-500 bg-white border border-slate-200 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-400">
                      B
                    </span>
                    <span className="text-xs px-2 py-1 rounded text-slate-500 bg-white border border-slate-200 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-400">
                      I
                    </span>
                    <span className="text-xs px-2 py-1 rounded text-slate-500 bg-white border border-slate-200 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-400">
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
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
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
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Vídeo do produto
                  </label>
                  {videoUrl ? (
                    <div className="space-y-2">
                      <video
                        src={videoUrl}
                        controls
                        playsInline
                        className="w-full max-h-64 rounded-lg bg-black"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setVideoUrl(null);
                          setSaveOk(false);
                        }}
                        className="text-xs font-medium text-red-600 hover:text-red-700 dark:text-red-400"
                      >
                        Remover vídeo
                      </button>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center justify-center cursor-pointer rounded-lg border-2 border-dashed border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/40 py-8 text-center text-slate-500 dark:text-slate-400 text-sm hover:border-landing-primary/50">
                      <span className="text-2xl block mb-1">🎬</span>
                      {videoUploading ? "Enviando vídeo…" : "Toque para enviar um vídeo"}
                      <span className="text-[11px] text-slate-400 mt-1">
                        MP4/MOV · máx. 50MB
                      </span>
                      <input
                        type="file"
                        accept="video/*"
                        disabled={videoUploading}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleVideoUpload(file);
                          e.target.value = "";
                        }}
                        className="hidden"
                      />
                    </label>
                  )}
                </div>

                <div>
                  <ProductOptionsEditor
                    title="Tags para busca"
                    description="Palavras-chave que ajudam o cliente a achar o produto na busca da loja (ex.: sinônimos, marca, ocasião)."
                    items={tags}
                    onItemsChange={setTags}
                    placeholder="Ex.: verão, presente, algodão"
                    addButtonLabel="Adicionar tag"
                  />
                </div>
              </div>

              {/* Coluna direita */}
              <div className="lg:pl-8 space-y-5 pt-8 lg:pt-0">
                <h2 className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wide">
                  Detalhes técnicos
                </h2>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Tipo de unidade
                  </label>
                  <select
                    value={form.unitType}
                    onChange={(e) => {
                      setForm((f) => ({ ...f, unitType: e.target.value }));
                      setSaveOk(false);
                    }}
                    className={inputClass}
                  >
                    {UNIT_TYPES.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.label}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-[11px] text-slate-400">
                    Como o produto é vendido. Diferente de “Unidade” aparece na loja
                    (ex.: “vendido por Kg”).
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Formato da foto no card
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {(
                      [
                        { v: "", label: "Padrão da loja" },
                        { v: "1:1", label: "1:1 Quadrado" },
                        { v: "3:4", label: "3:4 Retrato" },
                      ] as { v: string; label: string }[]
                    ).map((opt) => {
                      const active = form.cardRatio === opt.v;
                      return (
                        <button
                          key={opt.v || "default"}
                          type="button"
                          onClick={() => {
                            setForm((f) => ({ ...f, cardRatio: opt.v }));
                            setSaveOk(false);
                          }}
                          className={`rounded-lg border-2 px-2 py-2 text-xs font-semibold transition-colors ${
                            active
                              ? "border-landing-primary bg-teal-50 text-slate-800 dark:bg-teal-900/20 dark:text-slate-100"
                              : "border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300"
                          }`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                  <p className="mt-1 text-[11px] text-slate-400">
                    Como a foto deste produto aparece na grade da loja. “Padrão da
                    loja” segue o formato geral da vitrine.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Código de barras (EAN)
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={form.barcode}
                    onChange={(e) => {
                      setForm((f) => ({ ...f, barcode: e.target.value }));
                      setSaveOk(false);
                    }}
                    placeholder="Ex.: 7891234567890"
                    className={inputClass}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Dimensões da embalagem
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {(
                      [
                        { key: "packHeight", label: "Altura (cm)" },
                        { key: "packWidth", label: "Largura (cm)" },
                        { key: "packLength", label: "Comprimento (cm)" },
                        { key: "packWeight", label: "Peso (kg)" },
                      ] as const
                    ).map((d) => (
                      <div key={d.key}>
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={form[d.key]}
                          onChange={(e) => {
                            setForm((f) => ({ ...f, [d.key]: e.target.value }));
                            setSaveOk(false);
                          }}
                          placeholder={d.label}
                          className={`${inputClass} text-sm`}
                        />
                        <span className="mt-0.5 block text-[10px] text-slate-400">
                          {d.label}
                        </span>
                      </div>
                    ))}
                  </div>
                  <p className="mt-1 text-[11px] text-slate-400">
                    Opcional. Guardado para um futuro cálculo de frete.
                  </p>
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
                  {stockControl && (
                    <SidebarRow
                      icon="📦"
                      label="Estoque"
                      onClick={() => setTab("estoque")}
                    />
                  )}
                </div>
              </div>
            </div>
          )}

          {tab === "variacoes" && (
            <div className="max-w-2xl space-y-6">
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Defina cores e tamanhos se o produto tiver variações. Na loja, o
                cliente escolhe antes de comprar.
              </p>
              <section className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 p-5 space-y-4 shadow-sm">
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
                  presetGroups={SIZE_PRESET_GROUPS}
                />
              </section>
              {stockControl && hasVariantOptions && (
                <VariantStockEditor
                  colors={colors}
                  sizes={sizes}
                  value={variantStockMap}
                  onChange={setVariantStockMap}
                />
              )}
            </div>
          )}

          {stockControl && tab === "estoque" && (
            <div className="max-w-lg space-y-4">
              {hasVariantOptions ? (
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  Com variações, as quantidades ficam na aba{" "}
                  <strong>Variações</strong> (grade por cor/tamanho). O total é a
                  soma automática.
                </p>
              ) : (
                <>
                  <label className="block text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1.5">
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

          <div className="fixed bottom-0 left-0 right-0 bg-white/95 border-t border-slate-200 dark:bg-slate-900/95 dark:border-slate-800 backdrop-blur-sm z-40">
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
                className="px-6 py-3 rounded-xl border-2 border-landing-primary text-landing-primary dark:text-teal-300 font-semibold hover:bg-teal-50 dark:hover:bg-teal-950/40 transition-colors disabled:opacity-50"
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
        storeId={storeId}
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
