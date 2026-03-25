import type { CSSProperties } from "react";
import { catalogCardImageObjectStyle } from "@/lib/productImagePosition";

export type ImageFocusPoint = { x: number; y: number };

export const DEFAULT_IMAGE_FOCUS: ImageFocusPoint = { x: 50, y: 50 };

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export function clampFocus(f: ImageFocusPoint): ImageFocusPoint {
  return { x: clamp(f.x, 0, 100), y: clamp(f.y, 0, 100) };
}

/** Alinha ao select «Enquadramento na loja» quando não há array na base. */
export function focusFromImageObjectPreset(preset: string): ImageFocusPoint {
  const key = preset.trim().toLowerCase();
  const map: Record<string, ImageFocusPoint> = {
    center: { x: 50, y: 50 },
    top: { x: 50, y: 0 },
    bottom: { x: 50, y: 100 },
    left: { x: 0, y: 50 },
    right: { x: 100, y: 50 },
    "top left": { x: 0, y: 0 },
    "top right": { x: 100, y: 0 },
    "bottom left": { x: 0, y: 100 },
    "bottom right": { x: 100, y: 100 },
  };
  return map[key] ?? DEFAULT_IMAGE_FOCUS;
}

function parseFocusEntry(raw: unknown): ImageFocusPoint | null {
  if (raw && typeof raw === "object" && "x" in raw && "y" in raw) {
    const x = Number((raw as { x: unknown }).x);
    const y = Number((raw as { y: unknown }).y);
    if (Number.isFinite(x) && Number.isFinite(y)) {
      return clampFocus({ x, y });
    }
  }
  if (Array.isArray(raw) && raw.length >= 2) {
    const x = Number(raw[0]);
    const y = Number(raw[1]);
    if (Number.isFinite(x) && Number.isFinite(y)) {
      return clampFocus({ x, y });
    }
  }
  return null;
}

/**
 * Um ponto por imagem, na mesma ordem que `images`.
 * Sem JSON na base: usa o preset legado só no índice 0.
 */
export function parseImageObjectPositionsDb(
  raw: unknown,
  imageCount: number,
  legacyPreset: string
): ImageFocusPoint[] {
  const out: ImageFocusPoint[] = [];
  for (let i = 0; i < imageCount; i++) {
    out.push(DEFAULT_IMAGE_FOCUS);
  }
  if (imageCount <= 0) return out;

  let anyFromDb = false;
  if (Array.isArray(raw)) {
    for (let i = 0; i < Math.min(raw.length, imageCount); i++) {
      const p = parseFocusEntry(raw[i]);
      if (p) {
        out[i] = p;
        anyFromDb = true;
      }
    }
  }

  if (!anyFromDb) {
    out[0] = focusFromImageObjectPreset(legacyPreset);
  }
  return out;
}

export function serializeImageObjectPositions(
  photos: { focus?: ImageFocusPoint }[]
): ImageFocusPoint[] {
  return photos.map((p) => clampFocus(p.focus ?? DEFAULT_IMAGE_FOCUS));
}

export function focusToObjectStyle(
  f: ImageFocusPoint | undefined | null
): CSSProperties | undefined {
  if (!f) return undefined;
  const c = clampFocus(f);
  return { objectPosition: `${c.x}% ${c.y}%` };
}

/** Cartão / miniaturas com cover: foco por foto, senão preset só na 1.ª (legado). */
export function coverImageStyleAt(
  index: number,
  positions: ImageFocusPoint[] | undefined,
  legacyPreset: string
): CSSProperties | undefined {
  const p = positions?.[index];
  if (p) return focusToObjectStyle(p);
  if (index === 0) return catalogCardImageObjectStyle(legacyPreset);
  return undefined;
}
