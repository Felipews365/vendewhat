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
};

export const CATEGORY_PRESETS: CategoryPreset[] = [
  { label: "Eletrônicos", emoji: "📱", bg: "#e0f2fe" },
  { label: "Camisetas", emoji: "👕", bg: "#dcfce7" },
  { label: "Calças", emoji: "👖", bg: "#dbeafe" },
  { label: "Vestidos", emoji: "👗", bg: "#e0e7ff" },
  { label: "Moletons", emoji: "🧥", bg: "#f3e8ff" },
  { label: "Shorts", emoji: "🩳", bg: "#dcfce7" },
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
