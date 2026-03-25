"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { ProductImageCropModal } from "./ProductImageCropModal";
import {
  clampFocus,
  DEFAULT_IMAGE_FOCUS,
  type ImageFocusPoint,
} from "@/lib/productImageFocus";

export type PhotoItem =
  | { id: string; kind: "remote"; url: string; focus?: ImageFocusPoint }
  | {
      id: string;
      kind: "local";
      file: File;
      preview: string;
      focus?: ImageFocusPoint;
    };

const MAX_PHOTOS = 10;
const MAX_BYTES = 5 * 1024 * 1024;

function newId() {
  return crypto.randomUUID();
}

function photoFocus(p: PhotoItem): ImageFocusPoint {
  return p.focus ?? DEFAULT_IMAGE_FOCUS;
}

/** Quadrado com object-cover; arrastar ajusta object-position (dedo ou rato). */
function DraggablePhotoFraming({
  src,
  focus,
  onFocusChange,
}: {
  src: string;
  focus: ImageFocusPoint;
  onFocusChange: (next: ImageFocusPoint) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const lastRef = useRef({ x: 0, y: 0 });
  const focusRef = useRef(focus);
  const onFocusChangeRef = useRef(onFocusChange);
  focusRef.current = focus;
  onFocusChangeRef.current = onFocusChange;

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;

    function onPointerDown(e: PointerEvent) {
      const node = wrapRef.current;
      if (!node) return;
      if (e.button !== 0 && e.pointerType === "mouse") return;
      draggingRef.current = true;
      lastRef.current = { x: e.clientX, y: e.clientY };
      try {
        node.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    }

    function onPointerMove(e: PointerEvent) {
      if (!draggingRef.current || !wrapRef.current) return;
      const rect = wrapRef.current.getBoundingClientRect();
      if (rect.width < 8 || rect.height < 8) return;
      const dx = e.clientX - lastRef.current.x;
      const dy = e.clientY - lastRef.current.y;
      lastRef.current = { x: e.clientX, y: e.clientY };
      const cur = focusRef.current;
      // Arrastar para a direita → mostrar mais à esquerda da foto → diminuir x%
      const nx = cur.x - (dx / rect.width) * 100;
      const ny = cur.y - (dy / rect.height) * 100;
      onFocusChangeRef.current(clampFocus({ x: nx, y: ny }));
    }

    function endDrag(e: PointerEvent) {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      const node = wrapRef.current;
      if (!node) return;
      try {
        node.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    }

    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("pointermove", onPointerMove);
    el.addEventListener("pointerup", endDrag);
    el.addEventListener("pointercancel", endDrag);
    return () => {
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerup", endDrag);
      el.removeEventListener("pointercancel", endDrag);
    };
  }, []);

  return (
    <div
      ref={wrapRef}
      className="absolute inset-0 cursor-grab active:cursor-grabbing touch-none"
      style={{ touchAction: "none" }}
      role="presentation"
      aria-label="Arraste para centralizar o recorte da foto"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        draggable={false}
        className="h-full w-full object-cover select-none pointer-events-none"
        style={{
          objectPosition: `${focus.x}% ${focus.y}%`,
        }}
      />
    </div>
  );
}

export function ProductPhotosPicker({
  items,
  onItemsChange,
  label = "Fotos do produto",
  variant = "default",
}: {
  items: PhotoItem[];
  onItemsChange: (next: PhotoItem[]) => void;
  label?: string;
  /** Grelha 2×5 com + em cada vazio (estilo editor visual) */
  variant?: "default" | "editor";
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

  const setFocusForId = useCallback(
    (id: string, next: ImageFocusPoint) => {
      const clamped = clampFocus(next);
      onItemsChange(
        itemsRef.current.map((it) =>
          it.id === id ? { ...it, focus: clamped } : it
        )
      );
    },
    [onItemsChange]
  );

  function appendLocalFile(file: File) {
    const prev = itemsRef.current;
    if (prev.length >= MAX_PHOTOS) return;
    const preview = URL.createObjectURL(file);
    onItemsChange([
      ...prev,
      {
        id: newId(),
        kind: "local",
        file,
        preview,
        focus: DEFAULT_IMAGE_FOCUS,
      },
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
        next.push({
          id: newId(),
          kind: "local",
          file,
          preview,
          focus: DEFAULT_IMAGE_FOCUS,
        });
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

  const accentRing =
    variant === "editor"
      ? "text-landing-primary focus:ring-landing-primary"
      : "text-whatsapp focus:ring-whatsapp";

  if (variant === "editor") {
    return (
      <div>
        <label className="block text-sm font-semibold text-slate-800 mb-1">
          {label}
        </label>
        <p className="text-xs text-slate-500 mb-2">
          Até {MAX_PHOTOS} fotos · máx. 5MB cada. Toque no{" "}
          <strong className="text-landing-primary">+</strong> para enviar.
        </p>
        <p className="text-xs text-slate-500 mb-3">
          <strong className="text-slate-600">Enquadramento:</strong> arraste a foto
          dentro do quadrado (rato ou dedo) para ajustar o que aparece no catálogo
          com recorte.
        </p>

        <label className="flex items-center gap-2 mb-3 text-xs text-slate-600 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={skipCrop}
            onChange={(e) => setSkipCrop(e.target.checked)}
            className={`rounded border-slate-300 ${accentRing}`}
          />
          Adicionar sem recorte (foto inteira)
        </label>

        <div className="grid grid-cols-2 gap-2">
          {Array.from({ length: MAX_PHOTOS }).map((_, i) => {
            const item = items[i];
            if (item) {
              const src = item.kind === "remote" ? item.url : item.preview;
              return (
                <div
                  key={item.id}
                  className="relative aspect-square rounded-lg overflow-hidden bg-slate-100 border border-slate-200"
                >
                  <DraggablePhotoFraming
                    src={src}
                    focus={photoFocus(item)}
                    onFocusChange={(f) => setFocusForId(item.id, f)}
                  />
                  <button
                    type="button"
                    onClick={() => remove(item.id)}
                    onPointerDown={(e) => e.stopPropagation()}
                    className="absolute top-1.5 right-1.5 w-7 h-7 rounded-full bg-black/60 text-white text-sm font-bold leading-none hover:bg-black/80 shadow-md z-10"
                    aria-label="Remover foto"
                  >
                    ×
                  </button>
                </div>
              );
            }
            return (
              <button
                key={`slot-${i}`}
                type="button"
                onClick={() => fileRef.current?.click()}
                className="relative aspect-square rounded-lg border-2 border-dashed border-slate-200 bg-slate-50 hover:border-landing-primary/50 hover:bg-teal-50/30 transition-colors flex flex-col items-center justify-center text-slate-400"
              >
                <span className="text-2xl opacity-40 mb-0.5" aria-hidden>
                  🖼
                </span>
                <span className="text-[10px] text-center px-1 text-slate-400">
                  Adicione aqui
                </span>
                <span
                  className="absolute top-1.5 right-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-landing-primary text-white text-lg font-light leading-none shadow-md ring-2 ring-white"
                  aria-hidden
                >
                  +
                </span>
              </button>
            );
          })}
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => addFiles(e.target.files)}
        />

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

  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-2">
        {label}{" "}
        <span className="text-slate-400 font-normal">
          (até {MAX_PHOTOS} fotos, máx. 5MB cada)
        </span>
      </label>

      <p className="text-xs text-slate-500 mb-2">
        Arraste cada foto dentro do quadrado para ajustar o enquadramento no
        catálogo.
      </p>

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
        {items.map((item) => {
          const src = item.kind === "remote" ? item.url : item.preview;
          return (
            <div
              key={item.id}
              className="relative aspect-square rounded-xl overflow-hidden bg-slate-100 border border-slate-200 group"
            >
              <DraggablePhotoFraming
                src={src}
                focus={photoFocus(item)}
                onFocusChange={(f) => setFocusForId(item.id, f)}
              />
              <button
                type="button"
                onClick={() => remove(item.id)}
                onPointerDown={(e) => e.stopPropagation()}
                className="absolute top-2 right-2 w-8 h-8 rounded-full bg-red-500 text-white text-lg font-bold leading-none opacity-90 hover:opacity-100 shadow-md z-10"
                aria-label="Remover foto"
              >
                ×
              </button>
            </div>
          );
        })}

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
