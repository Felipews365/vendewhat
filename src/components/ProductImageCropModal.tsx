"use client";

import { useCallback, useState, useRef, useEffect } from "react";
import Cropper, { type Area } from "react-easy-crop";

const MAX_OUTPUT = 1600;

function createImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => resolve(image));
    image.addEventListener("error", (err) => reject(err));
    image.setAttribute("crossOrigin", "anonymous");
    image.src = url;
  });
}

async function getCroppedImageFile(
  imageSrc: string,
  pixelCrop: Area,
  outName: string
): Promise<File> {
  const image = await createImage(imageSrc);
  const scale = Math.min(
    1,
    MAX_OUTPUT / Math.max(pixelCrop.width, pixelCrop.height)
  );
  const w = Math.max(1, Math.round(pixelCrop.width * scale));
  const h = Math.max(1, Math.round(pixelCrop.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas não disponível");

  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    w,
    h
  );

  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Falha ao gerar imagem"))),
      "image/jpeg",
      0.92
    );
  });

  return new File([blob], outName.replace(/\.[^.]+$/i, "") + ".jpg", {
    type: "image/jpeg",
    lastModified: Date.now(),
  });
}

type Props = {
  imageSrc: string;
  sourceFileName: string;
  /** Arquivo original, para “usar sem recortar”. */
  originalFile: File;
  onCancel: () => void;
  onComplete: (file: File) => void;
};

export function ProductImageCropModal({
  imageSrc,
  sourceFileName,
  originalFile,
  onCancel,
  onComplete,
}: Props) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [busy, setBusy] = useState(false);
  const [cropReady, setCropReady] = useState(false);
  const croppedAreaPixelsRef = useRef<Area | null>(null);

  const onCropComplete = useCallback((_area: Area, pixels: Area) => {
    croppedAreaPixelsRef.current = pixels;
    setCropReady(true);
  }, []);

  useEffect(() => {
    croppedAreaPixelsRef.current = null;
    setCropReady(false);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
  }, [imageSrc]);

  async function applyCrop() {
    const pixels = croppedAreaPixelsRef.current;
    if (!pixels) {
      return;
    }
    setBusy(true);
    try {
      const base =
        sourceFileName.replace(/\.[^.]+$/i, "").trim() || "foto-produto";
      const file = await getCroppedImageFile(imageSrc, pixels, `${base}.jpg`);
      onComplete(file);
    } catch {
      onCancel();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      role="dialog"
      aria-modal
      aria-labelledby="crop-title"
    >
      <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] flex flex-col overflow-hidden border border-slate-200">
        <div className="px-4 py-3 border-b border-slate-100">
          <h2 id="crop-title" className="text-lg font-bold text-slate-800">
            Ajustar foto (quadrado)
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Arraste e use o zoom para encaixar como na vitrine (cards 1:1).
          </p>
        </div>

        <div className="relative w-full h-56 sm:h-72 bg-slate-900">
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={1}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
            showGrid={false}
          />
        </div>

        <div className="px-4 py-3 space-y-2 border-t border-slate-100">
          <label className="flex items-center gap-2 text-xs text-slate-600">
            <span className="shrink-0 w-14">Zoom</span>
            <input
              type="range"
              min={1}
              max={3}
              step={0.01}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="flex-1 accent-whatsapp"
            />
          </label>
        </div>

        <div className="px-4 pb-4 pt-1 flex flex-col gap-2">
          <button
            type="button"
            onClick={() => onComplete(originalFile)}
            disabled={busy}
            className="w-full py-2 text-sm text-slate-600 underline-offset-2 hover:underline disabled:opacity-50"
          >
            Usar foto inteira (sem recorte)
          </button>
          <div className="flex flex-col sm:flex-row gap-2 sm:justify-end">
            <button
              type="button"
              onClick={onCancel}
              disabled={busy}
              className="order-2 sm:order-1 py-2.5 px-4 rounded-lg border border-slate-200 text-slate-700 font-medium hover:bg-slate-50 disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={applyCrop}
              disabled={busy || !cropReady}
              className="order-1 sm:order-2 py-2.5 px-4 rounded-lg bg-whatsapp text-white font-semibold hover:bg-whatsapp-dark disabled:opacity-50"
            >
              {busy ? "Gerando…" : "Usar este enquadramento"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
