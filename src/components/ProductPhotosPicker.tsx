"use client";

import { useRef, useState } from "react";
import { ProductImageCropModal } from "./ProductImageCropModal";

export type PhotoItem =
  | { id: string; kind: "remote"; url: string }
  | { id: string; kind: "local"; file: File; preview: string };

const MAX_PHOTOS = 10;
const MAX_BYTES = 5 * 1024 * 1024;

function newId() {
  return crypto.randomUUID();
}

export function ProductPhotosPicker({
  items,
  onItemsChange,
  label = "Fotos do produto",
}: {
  items: PhotoItem[];
  onItemsChange: (next: PhotoItem[]) => void;
  label?: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const remainderRef = useRef<File[]>([]);
  const [skipCrop, setSkipCrop] = useState(false);
  const [cropSession, setCropSession] = useState<{
    src: string;
    file: File;
  } | null>(null);

  function appendLocalFile(file: File) {
    const prev = itemsRef.current;
    if (prev.length >= MAX_PHOTOS) return;
    const preview = URL.createObjectURL(file);
    onItemsChange([
      ...prev,
      { id: newId(), kind: "local", file, preview },
    ]);
  }

  function openNextFromQueue() {
    const next = remainderRef.current.shift();
    if (!next) return;
    setCropSession({
      file: next,
      src: URL.createObjectURL(next),
    });
  }

  function addFiles(fileList: FileList | null) {
    if (!fileList?.length) return;
    const valid = Array.from(fileList).filter((file) => {
      if (!file.type.startsWith("image/")) return false;
      if (file.size > MAX_BYTES) return false;
      return true;
    });
    if (!valid.length) return;

    const slots = MAX_PHOTOS - itemsRef.current.length;
    const take = valid.slice(0, Math.max(0, slots));
    if (!take.length) {
      if (fileRef.current) fileRef.current.value = "";
      return;
    }

    if (skipCrop) {
      const next = [...itemsRef.current];
      for (const file of take) {
        if (next.length >= MAX_PHOTOS) break;
        const preview = URL.createObjectURL(file);
        next.push({ id: newId(), kind: "local", file, preview });
      }
      onItemsChange(next);
      if (fileRef.current) fileRef.current.value = "";
      return;
    }

    remainderRef.current = take.slice(1);
    setCropSession({
      file: take[0]!,
      src: URL.createObjectURL(take[0]!),
    });
    if (fileRef.current) fileRef.current.value = "";
  }

  function handleCropDone(file: File) {
    if (!cropSession) return;
    URL.revokeObjectURL(cropSession.src);
    setCropSession(null);
    appendLocalFile(file);
    queueMicrotask(() => openNextFromQueue());
  }

  function handleCropCancel() {
    if (cropSession) URL.revokeObjectURL(cropSession.src);
    setCropSession(null);
    remainderRef.current = [];
  }

  function remove(id: string) {
    const item = items.find((i) => i.id === id);
    if (item?.kind === "local") URL.revokeObjectURL(item.preview);
    onItemsChange(items.filter((i) => i.id !== id));
  }

  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-2">
        {label}{" "}
        <span className="text-slate-400 font-normal">
          (até {MAX_PHOTOS} fotos, máx. 5MB cada)
        </span>
      </label>

      <label className="flex items-center gap-2 mb-3 text-sm text-slate-600 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={skipCrop}
          onChange={(e) => setSkipCrop(e.target.checked)}
          className="rounded border-slate-300 text-whatsapp focus:ring-whatsapp"
        />
        Adicionar sem recorte (foto inteira, sem ajuste quadrado)
      </label>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {items.map((item) => (
          <div
            key={item.id}
            className="relative aspect-square rounded-xl overflow-hidden bg-slate-100 border border-slate-200 group"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={item.kind === "remote" ? item.url : item.preview}
              alt=""
              className="w-full h-full object-cover"
            />
            <button
              type="button"
              onClick={() => remove(item.id)}
              className="absolute top-2 right-2 w-8 h-8 rounded-full bg-red-500 text-white text-lg font-bold leading-none opacity-90 hover:opacity-100 shadow-md"
              aria-label="Remover foto"
            >
              ×
            </button>
          </div>
        ))}

        {items.length < MAX_PHOTOS && (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="aspect-square rounded-xl border-2 border-dashed border-slate-200 hover:border-whatsapp flex flex-col items-center justify-center text-slate-400 hover:text-whatsapp transition-colors"
          >
            <span className="text-3xl mb-1">+</span>
            <span className="text-xs font-medium px-2 text-center">
              Adicionar foto
            </span>
          </button>
        )}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => addFiles(e.target.files)}
      />

      {items.length === 0 && (
        <p className="text-xs text-slate-400 mt-2">
          Nenhuma foto obrigatória — você pode cadastrar só nome e preço.
          {!skipCrop &&
            " Ao adicionar imagem, você pode enquadrar em quadrado como na vitrine."}
        </p>
      )}

      {cropSession && (
        <ProductImageCropModal
          imageSrc={cropSession.src}
          sourceFileName={cropSession.file.name}
          originalFile={cropSession.file}
          onCancel={handleCropCancel}
          onComplete={handleCropDone}
        />
      )}
    </div>
  );
}

export { MAX_PHOTOS };
