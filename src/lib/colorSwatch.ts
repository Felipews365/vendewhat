/**
 * Cor de exibição para o nome de cor digitado pelo lojista (vitrine).
 * Mapeamento comum em PT-BR + fallback estável por texto.
 */

const NAMED: Record<string, string> = {
  preto: "#1a1a1a",
  "preto fosco": "#2d2d2d",
  branco: "#ffffff",
  "off white": "#f4f1ea",
  offwhite: "#f4f1ea",
  creme: "#faf5eb",
  bege: "#d4c4a8",
  "bege claro": "#e8dcc8",
  marrom: "#6b4423",
  "marrom claro": "#a67c52",
  chocolate: "#4a2c1a",
  cinza: "#9ca3af",
  "cinza claro": "#d1d5db",
  "cinza escuro": "#4b5563",
  grafite: "#374151",
  prata: "#c0c0c0",
  dourado: "#c9a227",
  amarelo: "#facc15",
  "amarelo claro": "#fef08a",
  laranja: "#fb923c",
  coral: "#ff7f6b",
  vermelho: "#dc2626",
  vinho: "#7f1d1d",
  rosa: "#f472b6",
  "rosa claro": "#fbcfe8",
  magenta: "#d946ef",
  roxo: "#7c3aed",
  lilás: "#a78bfa",
  violeta: "#6d28d9",
  azul: "#2563eb",
  "azul claro": "#93c5fd",
  "azul marinho": "#1e3a5f",
  navy: "#1e3a5f",
  turquesa: "#2dd4bf",
  verde: "#16a34a",
  "verde claro": "#86efac",
  "verde musgo": "#4d7c0f",
  "verde militar": "#3f4f2f",
  menta: "#6ee7b7",
  salmão: "#fca5a5",
  salmao: "#fca5a5",
  mostarda: "#ca8a04",
  terracota: "#c2410c",
  nude: "#e8d5c4",
  camelo: "#b8956a",
  jeans: "#3d5a80",
  denim: "#3d5a80",
};

function normalizeKey(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize("NFD")
    /* Remove marcas de acento (compatível com target ES mais antigo) */
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function hueFromString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) {
    h = s.charCodeAt(i) + ((h << 5) - h);
  }
  return Math.abs(h) % 360;
}

/** Cor de fundo da bolinha (hex ou hsl). */
export function hexForColorLabel(name: string): string {
  const key = normalizeKey(name);
  if (NAMED[key]) return NAMED[key];
  /* Primeira palavra: ex. "Azul royal" → "azul" */
  const first = key.split(/\s+/)[0] ?? key;
  if (first && NAMED[first]) return NAMED[first];
  const h = hueFromString(key);
  return `hsl(${h} 42% 46%)`;
}

/**
 * Valor inicial do seletor (#rrggbb) a partir do nome; se o mapa devolver hsl,
 * usa um cinza médio.
 */
export function defaultPickerHex(name: string): string {
  const x = hexForColorLabel(name);
  const m = /^#([0-9a-f]{6})$/i.exec(x.replace(/\s/g, ""));
  if (m) return `#${m[1]!.toLowerCase()}`;
  return "#64748b";
}

/** Se a cor for muito clara, use borda visível na bolinha. */
export function swatchNeedsStrongBorder(fill: string): boolean {
  if (fill.startsWith("hsl")) return false;
  const m = /^#?([0-9a-f]{6})$/i.exec(fill.replace(/\s/g, ""));
  if (!m) return true;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  const l = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return l > 0.88;
}
