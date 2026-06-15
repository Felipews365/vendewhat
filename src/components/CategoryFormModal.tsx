"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";
import { CATEGORY_PRESETS, emojiCategoryImage } from "@/lib/categoryPresets";

const pillInputClass =
  "w-full rounded-full border-0 bg-slate-100 px-4 py-3 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-landing-primary/35";

export type CategoryFormSaveData = {
  name: string;
  imageUrl: string;
  /** Só loja: categoria “pai” já existente nesta lista. */
  parentLabel?: string;
};

export type CategoryFormModalProps = {
  open: boolean;
  onClose: () => void;
  /** Produto: só nome. Loja: nome + URL ou ficheiro (enviado ao Storage). */
  variant: "product" | "store";
  /** Para variant store: necessário ao escolher ficheiro (upload para product-images). */
  storeId?: string | null;
  initialName?: string;
  initialImageUrl?: string;
  /** Só loja: pai já gravado. */
  initialParentLabel?: string;
  /** Só loja: nomes de outras categorias para o select “Categoria pai”. */
  parentCategoryOptions?: string[];
  /** Título ao lado da seta (ex.: edição). */
  title?: string;
  onSave: (data: CategoryFormSaveData) => void;
  /** Só ao editar uma categoria existente: mostra o botão "Excluir categoria". */
  onDelete?: () => void;
};

export function CategoryFormModal({
  open,
  onClose,
  variant,
  storeId = null,
  initialName = "",
  initialImageUrl = "",
  initialParentLabel = "",
  parentCategoryOptions = [],
  title = "Adicionar Categoria",
  onSave,
  onDelete,
}: CategoryFormModalProps) {
  const titleId = useId();
  const { showToast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const pendingImageFileRef = useRef<File | null>(null);
  const [name, setName] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [parentKey, setParentKey] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [blobPreview, setBlobPreview] = useState<string | null>(null);
  const [touchedSave, setTouchedSave] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    if (!open) return;
    setName(initialName.trim());
    setImageUrl(initialImageUrl.trim());
    setParentKey(initialParentLabel.trim());
    setAdvancedOpen(false);
    setTouchedSave(false);
    setFormError("");
    setUploading(false);
    pendingImageFileRef.current = null;
    setBlobPreview((prev) => {
      if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
      return null;
    });
  }, [open, initialName, initialImageUrl, initialParentLabel]);

  useEffect(() => {
    return () => {
      if (blobPreview?.startsWith("blob:")) URL.revokeObjectURL(blobPreview);
    };
  }, [blobPreview]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  function handleImagePick(fileList: FileList | null) {
    const file = fileList?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    pendingImageFileRef.current = file;
    setFormError("");
    setBlobPreview((old) => {
      if (old?.startsWith("blob:")) URL.revokeObjectURL(old);
      return URL.createObjectURL(file);
    });
    if (variant === "store") setImageUrl("");
  }

  async function handleSalvar() {
    setTouchedSave(true);
    setFormError("");
    const t = name.trim();
    if (!t) return;

    let url = variant === "store" ? imageUrl.trim() : "";

    if (variant === "store" && pendingImageFileRef.current) {
      const sid = storeId?.trim();
      if (!sid) {
        setFormError(
          "Não foi possível identificar a loja. Recarregue a página e tente de novo."
        );
        return;
      }
      setUploading(true);
      try {
        const supabase = createClient();
        const file = pendingImageFileRef.current;
        const ext = file.name.split(".").pop() || "jpg";
        const path = `${sid}/storefront-category-${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("product-images")
          .upload(path, file);
        if (upErr) {
          setFormError("Erro ao enviar imagem: " + upErr.message);
          return;
        }
        const { data: pub } = supabase.storage
          .from("product-images")
          .getPublicUrl(path);
        url = pub.publicUrl;
        pendingImageFileRef.current = null;
        setBlobPreview((old) => {
          if (old?.startsWith("blob:")) URL.revokeObjectURL(old);
          return null;
        });
        setImageUrl(pub.publicUrl);
      } finally {
        setUploading(false);
      }
    }

    let parentLabel: string | undefined;
    if (variant === "store") {
      const pk = parentKey.trim();
      if (
        pk &&
        pk.localeCompare(t, "pt", { sensitivity: "base" }) !== 0
      ) {
        parentLabel = pk;
      }
    }

    onSave({ name: t, imageUrl: url, parentLabel });
    showToast(`Categoria “${t}” salva!`);
    onClose();
  }

  const nameError = touchedSave && !name.trim();
  const urlLooksLikeImage = /^(https?:\/\/|data:image\/)/i.test(imageUrl.trim());
  const circleImg =
    blobPreview ||
    (variant === "store" && urlLooksLikeImage ? imageUrl.trim() : null);

  function handlePresetPick(presetLabel: string, dataUri: string) {
    pendingImageFileRef.current = null;
    setBlobPreview((old) => {
      if (old?.startsWith("blob:")) URL.revokeObjectURL(old);
      return null;
    });
    setImageUrl(dataUri);
    setFormError("");
    if (!name.trim()) setName(presetLabel);
  }

  return (
    <div
      className="fixed inset-0 z-[140] flex items-end sm:items-center justify-center sm:p-4 bg-slate-600/50 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Fechar"
        onClick={onClose}
      />
      <div
        className="relative w-full max-w-md max-h-[92vh] overflow-y-auto rounded-t-[28px] sm:rounded-[28px] bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 pt-5 pb-6 space-y-5">
          <p className="text-[11px] text-slate-400 font-medium tracking-wide">
            Categorias ›
          </p>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 flex h-9 w-9 items-center justify-center rounded-full text-landing-primary hover:bg-violet-50 transition-colors text-xl font-semibold leading-none"
              aria-label="Voltar"
            >
              ‹
            </button>
            <h2
              id={titleId}
              className="text-lg font-bold text-slate-600 tracking-tight"
            >
              {title}
            </h2>
          </div>

          <div>
            <label className="block text-sm text-slate-500 mb-2 font-medium">
              Nome da categoria
            </label>
            <div className="flex gap-3 items-center">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nome da categoria"
                className={`flex-1 min-w-0 ${pillInputClass} ${
                  nameError ? "ring-2 ring-red-200" : ""
                }`}
              />
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(e) => {
                  handleImagePick(e.target.files);
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className={`shrink-0 h-[52px] w-[52px] rounded-full flex flex-col items-center justify-center transition-colors overflow-hidden ${
                  circleImg
                    ? "border border-slate-200 bg-slate-100"
                    : "border-2 border-dashed border-landing-primary/40 bg-violet-50 text-landing-primary hover:bg-violet-100"
                }`}
                title={
                  variant === "store"
                    ? "Adicionar foto — será enviada ao salvar (ou cole a URL abaixo)"
                    : "Imagem (opcional, não salva no produto)"
                }
              >
                {circleImg ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={circleImg}
                    alt=""
                    className="h-full w-full object-cover object-center"
                  />
                ) : (
                  <>
                    <span className="text-lg leading-none" aria-hidden>
                      📷
                    </span>
                    <span className="text-[9px] font-semibold leading-tight mt-0.5">
                      Foto
                    </span>
                  </>
                )}
              </button>
            </div>
            {nameError && (
              <p className="text-xs text-red-600 mt-1.5">Informe o nome.</p>
            )}
          </div>

          {variant === "store" && (
            <div>
              <label className="block text-sm text-slate-500 mb-2 font-medium">
                Imagens prontas{" "}
                <span className="text-slate-400 font-normal">
                  (toque para usar)
                </span>
              </label>
              <div className="grid grid-cols-5 gap-2 sm:grid-cols-6">
                {CATEGORY_PRESETS.map((p) => {
                  const uri = emojiCategoryImage(p.emoji, p.bg);
                  const selected = imageUrl.trim() === uri;
                  return (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => handlePresetPick(p.label, uri)}
                      title={p.label}
                      className={`aspect-square rounded-full flex items-center justify-center text-xl transition-transform hover:scale-105 ${
                        selected
                          ? "ring-2 ring-landing-primary ring-offset-2"
                          : "ring-1 ring-slate-200"
                      }`}
                      style={{ backgroundColor: p.bg }}
                    >
                      <span aria-hidden>{p.emoji}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {variant === "store" && (
            <div>
              <label className="block text-sm text-slate-500 mb-2 font-medium">
                Ou cole o link de uma imagem{" "}
                <span className="text-slate-400 font-normal">(opcional)</span>
              </label>
              <input
                type="url"
                value={imageUrl.startsWith("data:") ? "" : imageUrl}
                onChange={(e) => {
                  setImageUrl(e.target.value);
                  pendingImageFileRef.current = null;
                  setBlobPreview((old) => {
                    if (old?.startsWith("blob:")) URL.revokeObjectURL(old);
                    return null;
                  });
                }}
                placeholder="https://… (cole o link de uma imagem)"
                className={pillInputClass}
              />
            </div>
          )}

          {variant === "store" && (
            <div>
              <label className="block text-sm text-slate-500 mb-1 font-medium">
                Agrupar dentro de outra categoria
              </label>
              <p className="text-[11px] text-slate-400 mb-2 leading-snug">
                Opcional: coloque esta categoria <strong>dentro de outra</strong>{" "}
                que você já criou (ex.: “Camisetas” dentro de “Roupas”). Serve só
                para organizar; deixe em “Nenhuma” se não quiser agrupar.
              </p>
              <div className="relative">
                <select
                  value={parentKey}
                  onChange={(e) => setParentKey(e.target.value)}
                  className={`${pillInputClass} appearance-none cursor-pointer pr-10 w-full text-slate-600`}
                >
                  <option value="">Nenhuma (categoria principal)</option>
                  {parentCategoryOptions.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
                <span
                  className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 text-xs"
                  aria-hidden
                >
                  ▼
                </span>
              </div>
              {parentCategoryOptions.length === 0 && (
                <p className="text-[11px] text-slate-400 mt-1.5">
                  Guarde pelo menos duas categorias para poder escolher uma como
                  pai da outra.
                </p>
              )}
            </div>
          )}

          <div className="rounded-2xl overflow-hidden border border-slate-100 bg-slate-50/60">
            <button
              type="button"
              onClick={() => setAdvancedOpen((o) => !o)}
              className="w-full flex items-center justify-between gap-2 px-4 py-3.5 text-left text-sm font-semibold text-slate-600 hover:bg-slate-100/80 transition-colors"
            >
              <span>Avançado</span>
              <span
                className="text-landing-primary text-base leading-none w-5 text-center"
                aria-hidden
              >
                {advancedOpen ? "⌃" : "⌄"}
              </span>
            </button>
            {advancedOpen && (
              <button
                type="button"
                disabled
                className="w-full flex items-center justify-between gap-3 mx-2 mb-2 px-4 py-3 rounded-full bg-slate-100 text-left opacity-70 cursor-not-allowed"
              >
                <span className="flex items-center gap-2 min-w-0 text-sm text-slate-600">
                  <span className="text-landing-primary shrink-0" aria-hidden>
                    📏
                  </span>
                  <span className="truncate">Dimensões para frete</span>
                </span>
                <span className="text-landing-primary shrink-0" aria-hidden>
                  ›
                </span>
              </button>
            )}
          </div>

          {formError && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
              {formError}
            </p>
          )}

          <div className="space-y-3 pt-1">
            <button
              type="button"
              disabled={uploading}
              onClick={() => void handleSalvar()}
              className="w-full rounded-full bg-landing-primary py-3.5 text-center text-sm font-bold text-white shadow-md hover:opacity-95 transition-opacity disabled:opacity-60"
            >
              {uploading ? "A enviar imagem…" : "Salvar"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-full border-2 border-cyan-500 py-3.5 text-center text-sm font-bold text-cyan-600 bg-white hover:bg-cyan-50/70 transition-colors"
            >
              Voltar
            </button>
            {onDelete && (
              <button
                type="button"
                disabled={uploading}
                onClick={() => {
                  if (
                    window.confirm(
                      "Excluir esta categoria? Os produtos não são apagados, só deixam de aparecer agrupados por ela."
                    )
                  ) {
                    onDelete();
                    onClose();
                  }
                }}
                className="w-full rounded-full py-3.5 text-center text-sm font-bold text-red-600 hover:bg-red-50 transition-colors disabled:opacity-60"
              >
                Excluir categoria
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
