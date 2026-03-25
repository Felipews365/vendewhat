import type { CSSProperties } from "react";

/**
 * Enquadramento da 1.ª foto no card da grelha: quadrado 1:1 com object-fit: cover.
 * No modal da loja as fotos usam object-contain (foto completa, proporção original).
 */
export const IMAGE_OBJECT_POSITION_PRESETS: { value: string; label: string }[] = [
  { value: "center", label: "Centro (padrão)" },
  { value: "top", label: "Topo" },
  { value: "bottom", label: "Base" },
  { value: "left", label: "Esquerda" },
  { value: "right", label: "Direita" },
  { value: "top left", label: "Topo · esquerda" },
  { value: "top right", label: "Topo · direita" },
  { value: "bottom left", label: "Base · esquerda" },
  { value: "bottom right", label: "Base · direita" },
];

const PRESET_TO_CSS: Record<string, string> = {
  center: "center",
  top: "center top",
  bottom: "center bottom",
  left: "left center",
  right: "right center",
  "top left": "left top",
  "top right": "right top",
  "bottom left": "left bottom",
  "bottom right": "right bottom",
};

/** `style` para Next/Image com object-cover na vitrine (1.ª foto). */
export function catalogCardImageObjectStyle(
  position: string | null | undefined
): CSSProperties | undefined {
  const key = (position ?? "").trim().toLowerCase();
  if (!key || key === "center") return undefined;
  const css = PRESET_TO_CSS[key];
  if (!css) return undefined;
  return { objectPosition: css };
}

export function normalizeImageObjectPosition(raw: unknown): string {
  if (typeof raw !== "string") return "center";
  const t = raw.trim().toLowerCase();
  if (!t) return "center";
  return PRESET_TO_CSS[t] !== undefined ? t : "center";
}
