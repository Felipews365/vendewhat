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
  /** Seção da galeria (a ordem da lista define a ordem das seções). */
  group: string;
  /**
   * Imagem (data URI) desenhada manualmente que substitui o emoji. Usada para
   * peças onde o emoji do sistema tem cor fixa (ex.: o short 🩳 é sempre verde)
   * e precisamos de cores próprias para diferenciar variantes.
   */
  image?: string;
};

export const CATEGORY_PRESETS: CategoryPreset[] = [
  // ---------- Roupas ----------
  { group: "Roupas", label: "Vestidos", emoji: "👗", bg: "#e0e7ff" },
  { group: "Roupas", label: "Vestido longo", emoji: "👗", bg: "#f3e8ff" },
  { group: "Roupas", label: "Blusas", emoji: "👚", bg: "#fce7f3" },
  { group: "Roupas", label: "Cropped", emoji: "👚", bg: "#ffe4e6" },
  { group: "Roupas", label: "Conjunto", emoji: "👚", bg: "#ede9fe" },
  { group: "Roupas", label: "Camisetas", emoji: "👕", bg: "#dcfce7" },
  { group: "Roupas", label: "Vestuário", emoji: "👕", bg: "#fce7f3" },
  { group: "Roupas", label: "Camisa", emoji: "👔", bg: "#e0f2fe" },
  { group: "Roupas", label: "Regata", emoji: "🎽", bg: "#dbeafe" },
  { group: "Roupas", label: "Body", emoji: "🩱", bg: "#f3e8ff" },
  { group: "Roupas", label: "Saias", emoji: "🥻", bg: "#fce7f3" },
  { group: "Roupas", label: "Moletons", emoji: "🧥", bg: "#f3e8ff" },
  { group: "Roupas", label: "Jaquetas", emoji: "🧥", bg: "#ffedd5" },
  { group: "Roupas", label: "Casacos", emoji: "🧥", bg: "#e2e8f0" },
  { group: "Roupas", label: "Macacão", emoji: "🧥", bg: "#fae8ff" },
  {
    group: "Roupas",
    label: "Calças",
    emoji: "👖",
    bg: "#dbeafe",
    image: pantsCategoryImage("#64748b", "#dbeafe"),
  },
  {
    group: "Roupas",
    label: "Calça jeans",
    emoji: "👖",
    bg: "#e0f2fe",
    image: pantsCategoryImage("#3b82f6", "#e0f2fe", true),
  },
  {
    group: "Roupas",
    label: "Legging",
    emoji: "👖",
    bg: "#e2e8f0",
    image: pantsCategoryImage("#1f2937", "#e2e8f0"),
  },
  {
    group: "Roupas",
    label: "Short",
    emoji: "🩳",
    bg: "#fce7f3",
    image: shortsCategoryImage("#f472b6", "#fce7f3"),
  },
  {
    group: "Roupas",
    label: "Bermuda",
    emoji: "🩳",
    bg: "#dcfce7",
    image: shortsCategoryImage("#22c55e", "#dcfce7"),
  },
  {
    group: "Roupas",
    label: "Short jeans",
    emoji: "🩳",
    bg: "#dbeafe",
    image: shortsCategoryImage("#60a5fa", "#dbeafe", true),
  },
  {
    group: "Roupas",
    label: "Bermuda jeans",
    emoji: "🩳",
    bg: "#e0e7ff",
    image: shortsCategoryImage("#2563eb", "#e0e7ff", true),
  },
  { group: "Roupas", label: "Roupa íntima", emoji: "🩲", bg: "#fce7f3" },
  { group: "Roupas", label: "Lingerie", emoji: "👙", bg: "#fae8ff" },
  { group: "Roupas", label: "Pijamas", emoji: "🛌", bg: "#e0e7ff" },
  { group: "Roupas", label: "Meias", emoji: "🧦", bg: "#ede9fe" },

  // ---------- Fitness e praia ----------
  { group: "Fitness e praia", label: "Moda fitness", emoji: "🏋️", bg: "#ede9fe" },
  { group: "Fitness e praia", label: "Academia", emoji: "💪", bg: "#dcfce7" },
  { group: "Fitness e praia", label: "Top fitness", emoji: "🎽", bg: "#fce7f3" },
  {
    group: "Fitness e praia",
    label: "Legging fitness",
    emoji: "👖",
    bg: "#f3e8ff",
    image: pantsCategoryImage("#7c3aed", "#f3e8ff"),
  },
  { group: "Fitness e praia", label: "Biquíni", emoji: "👙", bg: "#cffafe" },
  { group: "Fitness e praia", label: "Moda praia", emoji: "🏖️", bg: "#e0f2fe" },
  {
    group: "Fitness e praia",
    label: "Sunga",
    emoji: "🩳",
    bg: "#cffafe",
    image: shortsCategoryImage("#0ea5e9", "#cffafe"),
  },
  { group: "Fitness e praia", label: "Esporte", emoji: "⚽", bg: "#dcfce7" },

  // ---------- Calçados e acessórios ----------
  { group: "Calçados e acessórios", label: "Calçados", emoji: "👟", bg: "#ede9fe" },
  { group: "Calçados e acessórios", label: "Tênis", emoji: "👟", bg: "#e0f2fe" },
  { group: "Calçados e acessórios", label: "Sandálias", emoji: "👡", bg: "#ffe4e6" },
  { group: "Calçados e acessórios", label: "Salto alto", emoji: "👠", bg: "#fce7f3" },
  { group: "Calçados e acessórios", label: "Botas", emoji: "👢", bg: "#fae8d7" },
  { group: "Calçados e acessórios", label: "Chinelos", emoji: "🩴", bg: "#cffafe" },
  { group: "Calçados e acessórios", label: "Bolsas", emoji: "👜", bg: "#fee2e2" },
  { group: "Calçados e acessórios", label: "Acessórios", emoji: "👜", bg: "#fae8d7" },
  { group: "Calçados e acessórios", label: "Óculos", emoji: "🕶️", bg: "#e2e8f0" },
  { group: "Calçados e acessórios", label: "Chapéus", emoji: "🧢", bg: "#fef3c7" },
  { group: "Calçados e acessórios", label: "Relógios", emoji: "⌚", bg: "#e2e8f0" },
  { group: "Calçados e acessórios", label: "Joias", emoji: "💍", bg: "#fae8ff" },
  { group: "Calçados e acessórios", label: "Bijuterias", emoji: "📿", bg: "#ffe4e6" },

  // ---------- Infantil ----------
  { group: "Infantil", label: "Moda bebê", emoji: "👶", bg: "#ffe4e6" },
  { group: "Infantil", label: "Bebê", emoji: "🍼", bg: "#fce7f3" },
  { group: "Infantil", label: "Infantil", emoji: "🧒", bg: "#fef3c7" },
  { group: "Infantil", label: "Brinquedos", emoji: "🧸", bg: "#fee2e2" },
  { group: "Infantil", label: "Escolar", emoji: "🎒", bg: "#dbeafe" },

  // ---------- Beleza e saúde ----------
  { group: "Beleza e saúde", label: "Beleza", emoji: "💄", bg: "#fce7f3" },
  { group: "Beleza e saúde", label: "Cosméticos", emoji: "🧴", bg: "#ffe4e6" },
  { group: "Beleza e saúde", label: "Perfumaria", emoji: "🌸", bg: "#fae8ff" },
  { group: "Beleza e saúde", label: "Cabelo", emoji: "💇", bg: "#f3e8ff" },
  { group: "Beleza e saúde", label: "Unhas", emoji: "💅", bg: "#fce7f3" },
  { group: "Beleza e saúde", label: "Saúde", emoji: "💊", bg: "#dcfce7" },
  { group: "Beleza e saúde", label: "Suplementos", emoji: "💊", bg: "#d1fae5" },

  // ---------- Casa ----------
  { group: "Casa", label: "Casa", emoji: "🏠", bg: "#dcfce7" },
  { group: "Casa", label: "Decoração", emoji: "🖼️", bg: "#fef3c7" },
  { group: "Casa", label: "Móveis", emoji: "🛋️", bg: "#fae8d7" },
  { group: "Casa", label: "Cama e banho", emoji: "🛏️", bg: "#e0e7ff" },
  { group: "Casa", label: "Cozinha", emoji: "🍽️", bg: "#ffedd5" },
  { group: "Casa", label: "Utilidades", emoji: "🧹", bg: "#ecfccb" },
  { group: "Casa", label: "Limpeza", emoji: "🧼", bg: "#cffafe" },
  { group: "Casa", label: "Jardim", emoji: "🪴", bg: "#dcfce7" },
  { group: "Casa", label: "Ferramentas", emoji: "🛠️", bg: "#fef3c7" },
  { group: "Casa", label: "Eletrodomésticos", emoji: "🔌", bg: "#e0e7ff" },

  // ---------- Tecnologia ----------
  { group: "Tecnologia", label: "Eletrônicos", emoji: "📱", bg: "#e0f2fe" },
  { group: "Tecnologia", label: "Informática", emoji: "💻", bg: "#e2e8f0" },
  { group: "Tecnologia", label: "Fones", emoji: "🎧", bg: "#ede9fe" },
  { group: "Tecnologia", label: "Games", emoji: "🎮", bg: "#f3e8ff" },
  { group: "Tecnologia", label: "Automotivo", emoji: "🚗", bg: "#e2e8f0" },

  // ---------- Alimentos ----------
  { group: "Alimentos", label: "Alimentos", emoji: "🍔", bg: "#ffedd5" },
  { group: "Alimentos", label: "Bebidas", emoji: "🥤", bg: "#cffafe" },
  { group: "Alimentos", label: "Doces", emoji: "🍬", bg: "#fce7f3" },
  { group: "Alimentos", label: "Café", emoji: "☕", bg: "#fae8d7" },
  { group: "Alimentos", label: "Hortifruti", emoji: "🥦", bg: "#dcfce7" },
  { group: "Alimentos", label: "Padaria", emoji: "🥐", bg: "#fef3c7" },

  // ---------- Outros ----------
  { group: "Outros", label: "Pet", emoji: "🐾", bg: "#fef9c3" },
  { group: "Outros", label: "Livros", emoji: "📚", bg: "#dbeafe" },
  { group: "Outros", label: "Papelaria", emoji: "✏️", bg: "#fef3c7" },
  { group: "Outros", label: "Artesanato", emoji: "🧵", bg: "#ffe4e6" },
  { group: "Outros", label: "Flores", emoji: "💐", bg: "#fce7f3" },
  { group: "Outros", label: "Presentes", emoji: "🎁", bg: "#fee2e2" },
  { group: "Outros", label: "Festas", emoji: "🎉", bg: "#fae8ff" },
  { group: "Outros", label: "Novidades", emoji: "✨", bg: "#fef9c3" },
  { group: "Outros", label: "Mais vendidos", emoji: "⭐", bg: "#fef3c7" },
  { group: "Outros", label: "Kits e combos", emoji: "📦", bg: "#fae8d7" },
  { group: "Outros", label: "Ofertas", emoji: "🏷️", bg: "#fee2e2" },
];

/**
 * Fundo do círculo: cor sólida + um brilho suave de cima para baixo e um aro
 * claro por dentro — dá volume às miniaturas sem pesar o SVG. Compartilhado
 * pelos presets de emoji e pelas peças desenhadas à mão.
 */
function circleBackdrop(bg: string): string {
  return (
    `<defs><linearGradient id="s" x1="0" y1="0" x2="0.3" y2="1">` +
    `<stop offset="0" stop-color="#ffffff" stop-opacity=".8"/>` +
    `<stop offset=".55" stop-color="#ffffff" stop-opacity=".1"/>` +
    `<stop offset="1" stop-color="#0f172a" stop-opacity=".07"/>` +
    `</linearGradient></defs>` +
    `<circle cx="60" cy="60" r="60" fill="${bg}"/>` +
    `<circle cx="60" cy="60" r="60" fill="url(#s)"/>` +
    `<circle cx="60" cy="60" r="58.8" fill="none" stroke="#ffffff" stroke-opacity=".6" stroke-width="2.4"/>`
  );
}

function svgDataUri(inner: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120">${inner}</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/**
 * Gera uma imagem (data URI SVG) com o emoji centralizado sobre um fundo
 * colorido e arredondado. Pequena o bastante para guardar no JSON da loja.
 */
export function emojiCategoryImage(emoji: string, bg = "#f1f5f9"): string {
  return svgDataUri(
    `${circleBackdrop(bg)}<text x="60" y="63" font-size="58" text-anchor="middle" dominant-baseline="central">${emoji}</text>`
  );
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
  return svgDataUri(
    `${circleBackdrop(bg)}<g stroke="rgba(15,23,42,0.22)" stroke-width="2" stroke-linejoin="round"><path d="M38 54 L82 54 L82 86 L66 86 L60 62 L54 86 L38 86 Z" fill="${color}"/><rect x="36" y="42" width="48" height="12" rx="3" fill="${color}"/></g>${stitches}`
  );
}

/**
 * Mesma ideia do short, para peças longas (calça, legging, jeans): o emoji 👖
 * é sempre azul-jeans, então preto/colorido só sai desenhando.
 */
export function pantsCategoryImage(
  color: string,
  bg = "#f1f5f9",
  denim = false
): string {
  const stitches = denim
    ? `<g fill="none" stroke="#fde68a" stroke-width="1.6" stroke-linecap="round" stroke-dasharray="3 2.5"><line x1="41" y1="44" x2="79" y2="44"/><path d="M47 54 q6 6 0 11"/></g>`
    : "";
  return svgDataUri(
    `${circleBackdrop(bg)}<g stroke="rgba(15,23,42,0.22)" stroke-width="2" stroke-linejoin="round"><path d="M40 44 L80 44 L76 96 L64 96 L60 60 L56 96 L44 96 Z" fill="${color}"/><rect x="39" y="32" width="42" height="12" rx="3" fill="${color}"/></g>${stitches}`
  );
}
