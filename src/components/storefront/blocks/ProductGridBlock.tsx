/**
 * BLOCO: Grade de produtos
 * Finalidade: mostrar uma seleção de produtos (ex.: "Mais vendidos").
 * Os PRODUTOS vêm da página (banco), não do JSON — o lojista só configura
 * título, quantas colunas e o máximo de itens.
 */
import type { BlockProduct, ProductGridConfig } from "./types";
import { limitText, BLOCK_LIMITS } from "./types";
import {
  BlockContainer,
  BlockHeading,
  BlockImage,
  BlockBadge,
  BlockEmpty,
  formatMoneyBRL,
} from "./primitives";

const L = BLOCK_LIMITS.productGrid;

function ProductCard({ product }: { product: BlockProduct }) {
  const hasSale =
    product.compareAtPrice != null && product.compareAtPrice > product.price;
  return (
    <a
      href={`#produto-${product.id}`}
      className="group flex flex-col overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm transition-shadow hover:shadow-md"
    >
      <div className="relative aspect-square w-full overflow-hidden bg-stone-100">
        <BlockImage src={product.image} emoji="📦" />
        {product.badge?.trim() && (
          <BlockBadge className="absolute left-2 top-2 bg-black/70 text-white">
            {product.badge.trim()}
          </BlockBadge>
        )}
      </div>
      <div className="flex flex-1 flex-col p-3">
        {/* Nome com 2 linhas fixas → todos os cards ficam da mesma altura */}
        <h3 className="line-clamp-2 min-h-[2.5rem] text-sm font-medium text-stone-800">
          {product.name}
        </h3>
        <div className="mt-auto pt-2">
          {hasSale && (
            <span className="mr-2 text-xs text-stone-400 line-through">
              {formatMoneyBRL(product.compareAtPrice as number)}
            </span>
          )}
          <span
            className="text-base font-bold"
            style={{ color: "var(--store-secondary)" }}
          >
            {formatMoneyBRL(product.price)}
          </span>
        </div>
      </div>
    </a>
  );
}

export function ProductGridBlock({
  config,
  products,
  editing = false,
}: {
  config: ProductGridConfig;
  /** Produtos injetados pela página. */
  products: BlockProduct[];
  editing?: boolean;
}) {
  const title = limitText(config.title, L.title.max) || "Produtos";
  const columns = config.columns === 4 ? 4 : config.columns === 3 ? 3 : 2;
  const max = Math.min(config.maxItems ?? 8, L.maxItems.max);
  const visible = products.slice(0, max);

  // Colunas: sempre 2 no mobile; o valor escolhido vale de md+ (mobile-first).
  const colClass =
    columns === 4
      ? "grid-cols-2 md:grid-cols-4"
      : columns === 3
        ? "grid-cols-2 md:grid-cols-3"
        : "grid-cols-2";

  if (visible.length === 0) {
    if (!editing) return null;
    return (
      <BlockContainer>
        <BlockHeading title={title} />
        <div className="mt-4">
          <BlockEmpty
            emoji="📦"
            title="Sem produtos para mostrar"
            hint="Cadastre produtos ou ajuste o filtro deste bloco."
          />
        </div>
      </BlockContainer>
    );
  }

  return (
    <BlockContainer>
      <BlockHeading title={title} />
      <div className={`mt-5 grid gap-3 sm:gap-4 ${colClass}`}>
        {visible.map((p) => (
          <ProductCard key={p.id} product={p} />
        ))}
      </div>
    </BlockContainer>
  );
}
