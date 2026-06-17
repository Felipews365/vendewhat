/**
 * Imagens prontas de categoria para o lojista escolher no painel
 * (sem precisar enviar foto própria). Cada item vira uma imagem SVG
 * embutida (data URI) com um emoji centralizado, então funciona em
 * qualquer <img> — tanto na pré-visualização quanto na vitrine pública.
 */

export type CategoryPreset = {
  /** Nome sugerido (preenche o campo se estiver vazio). */
  label: string;
  /** Emoji desenhado dentro do círculo. */
  emoji: string;
  /** Cor de fundo suave do círculo. */
  bg: string;
  /**
   * Imagem (data URI) desenhada manualmente que substitui o emoji. Usada para
   * peças onde o emoji do sistema tem cor fixa (ex.: o short 🩳 é sempre verde)
   * e precisamos de cores próprias para diferenciar variantes.
   */
  image?: string;
};

export const CATEGORY_PRESETS: CategoryPreset[] = [
  { label: "Eletrônicos", emoji: "📱", bg: "#e0f2fe" },
  { label: "Camisetas", emoji: "👕", bg: "#dcfce7" },
  { label: "Calças", emoji: "👖", bg: "#dbeafe" },
  { label: "Vestidos", emoji: "👗", bg: "#e0e7ff" },
  { label: "Moletons", emoji: "🧥", bg: "#f3e8ff" },
  { label: "Short", emoji: "🩳", bg: "#fce7f3", image: shortsCategoryImage("#f472b6", "#fce7f3") },
  { label: "Bermuda", emoji: "🩳", bg: "#dcfce7", image: shortsCategoryImage("#22c55e", "#dcfce7") },
  { label: "Short jeans", emoji: "🩳", bg: "#dbeafe", image: shortsCategoryImage("#60a5fa", "#dbeafe", true) },
  { label: "Bermuda jeans", emoji: "🩳", bg: "#e0e7ff", image: shortsCategoryImage("#2563eb", "#e0e7ff", true) },
  { label: "Jaquetas", emoji: "🧥", bg: "#ffedd5" },
  { label: "Acessórios", emoji: "👜", bg: "#fae8d7" },
  { label: "Bolsas", emoji: "👜", bg: "#fee2e2" },
  { label: "Roupa íntima", emoji: "🩲", bg: "#fce7f3" },
  { label: "Saias", emoji: "🥻", bg: "#fce7f3" },
  { label: "Pijamas", emoji: "🩴", bg: "#cffafe" },
  { label: "Óculos", emoji: "🕶️", bg: "#e2e8f0" },
  { label: "Chapéus", emoji: "🧢", bg: "#fef3c7" },
  { label: "Relógios", emoji: "⌚", bg: "#e2e8f0" },
  { label: "Vestuário", emoji: "👕", bg: "#fce7f3" },
  { label: "Calçados", emoji: "👟", bg: "#ede9fe" },
  { label: "Ferramentas", emoji: "🛠️", bg: "#fef3c7" },
  { label: "Casa", emoji: "🏠", bg: "#dcfce7" },
  { label: "Móveis", emoji: "🛋️", bg: "#fae8d7" },
  { label: "Eletrodomésticos", emoji: "🔌", bg: "#e0e7ff" },
  { label: "Beleza", emoji: "💄", bg: "#fce7f3" },
  { label: "Brinquedos", emoji: "🧸", bg: "#fee2e2" },
  { label: "Esporte", emoji: "⚽", bg: "#dcfce7" },
  { label: "Automotivo", emoji: "🚗", bg: "#e2e8f0" },
  { label: "Pet", emoji: "🐾", bg: "#fef9c3" },
  { label: "Alimentos", emoji: "🍔", bg: "#ffedd5" },
  { label: "Bebidas", emoji: "🥤", bg: "#cffafe" },
  { label: "Bebê", emoji: "🍼", bg: "#fce7f3" },
  { label: "Livros", emoji: "📚", bg: "#dbeafe" },
  { label: "Papelaria", emoji: "✏️", bg: "#fef3c7" },
  { label: "Joias", emoji: "💍", bg: "#fae8ff" },
  { label: "Saúde", emoji: "💊", bg: "#dcfce7" },
  { label: "Jardim", emoji: "🪴", bg: "#dcfce7" },
  { label: "Festas", emoji: "🎉", bg: "#fce7f3" },
  { label: "Ofertas", emoji: "🏷️", bg: "#fee2e2" },
];

/**
 * Gera uma imagem (data URI SVG) com o emoji centralizado sobre um fundo
 * colorido e arredondado. Pequena o bastante para guardar no JSON da loja.
 */
export function emojiCategoryImage(emoji: string, bg = "#f1f5f9"): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120"><rect width="120" height="120" rx="60" fill="${bg}"/><text x="60" y="62" font-size="60" text-anchor="middle" dominant-baseline="central">${emoji}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/**
 * Desenha um short/bermuda num SVG com a cor que quisermos (o emoji 🩳 é
 * sempre verde, então não dá pra diferenciar bermuda × short × jeans só pelo
 * fundo). `denim` adiciona costuras claras para o visual jeans.
 */
export function shortsCategoryImage(
  color: string,
  bg = "#f1f5f9",
  denim = false
): string {
  const stitches = denim
    ? `<g fill="none" stroke="#fde68a" stroke-width="1.6" stroke-linecap="round" stroke-dasharray="3 2.5"><line x1="38" y1="48" x2="82" y2="48"/><path d="M44 60 q7 7 0 13"/></g>`
    : "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120"><rect width="120" height="120" rx="60" fill="${bg}"/><g stroke="rgba(15,23,42,0.22)" stroke-width="2" stroke-linejoin="round"><path d="M38 54 L82 54 L82 86 L66 86 L60 62 L54 86 L38 86 Z" fill="${color}"/><rect x="36" y="42" width="48" height="12" rx="3" fill="${color}"/></g>${stitches}</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
