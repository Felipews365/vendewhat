/** Extrai o caminho no bucket a partir da URL pública do Supabase Storage */
export function storagePathFromPublicUrl(url: string): string | null {
  const marker = "/product-images/";
  const i = url.indexOf(marker);
  if (i === -1) return null;
  return decodeURIComponent(url.slice(i + marker.length).split("?")[0]);
}

/** Lista de URLs do produto: usa `images` (jsonb) ou cai no `image` legado */
export function getProductImageUrls(product: {
  image?: string | null;
  images?: unknown;
}): string[] {
  const raw = product.images;
  if (Array.isArray(raw)) {
    const urls = raw.filter(
      (x): x is string => typeof x === "string" && x.length > 0
    );
    if (urls.length > 0) return urls;
  }
  if (product.image && typeof product.image === "string") {
    return [product.image];
  }
  return [];
}

export function storagePathsFromProductUrls(urls: string[]): string[] {
  return urls.map(storagePathFromPublicUrl).filter((p): p is string => !!p);
}
