/**
 * BLOCO: Vitrine de categorias
 * Finalidade: atalhos visuais (estilo "stories") para as categorias da loja.
 * Cada item tem nome + foto opcional (sem foto = inicial em círculo colorido).
 */
import type { CategoryShowcaseConfig, CategoryShowcaseItem } from "./types";
import { limitText, BLOCK_LIMITS } from "./types";
import { BlockContainer, BlockHeading, BlockImage, BlockEmpty } from "./primitives";

const L = BLOCK_LIMITS.categoryShowcase;

function CategoryChip({ item }: { item: CategoryShowcaseItem }) {
  const label = limitText(item.label, L.itemLabel.max);
  const initial = label.charAt(0).toUpperCase() || "?";
  const inner = (
    <>
      <div className="relative h-16 w-16 overflow-hidden rounded-full border-2 border-white shadow-sm sm:h-20 sm:w-20">
        {item.imageUrl?.trim() ? (
          <BlockImage src={item.imageUrl} emoji="🏷️" rounded="rounded-full" />
        ) : (
          // Fallback sem foto: círculo com a cor da loja e a inicial
          <div
            className="flex h-full w-full items-center justify-center text-xl font-bold text-white"
            style={{ backgroundColor: "var(--store-primary)" }}
          >
            {initial}
          </div>
        )}
      </div>
      {/* Nome centralizado, no máx. 2 linhas para não empurrar os vizinhos */}
      <span className="mt-2 line-clamp-2 w-16 text-center text-xs font-medium text-stone-700 sm:w-20">
        {label}
      </span>
    </>
  );

  const cls =
    "flex shrink-0 snap-start flex-col items-center focus:outline-none";
  return item.href?.trim() ? (
    <a href={item.href} className={cls}>
      {inner}
    </a>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

export function CategoryShowcaseBlock({
  config,
  editing = false,
}: {
  config: CategoryShowcaseConfig;
  editing?: boolean;
}) {
  const title = limitText(config.title, L.title.max) || "Categorias";
  // 🖊️ Lojista edita a lista (até 8). Filtra itens sem nome.
  const items = (config.items ?? [])
    .filter((i) => i.label?.trim())
    .slice(0, L.maxItems.max);

  if (items.length === 0) {
    if (!editing) return null; // loja pública: some quando vazio
    return (
      <BlockContainer>
        <BlockHeading title={title} />
        <div className="mt-4">
          <BlockEmpty
            emoji="🏷️"
            title="Nenhuma categoria ainda"
            hint="Adicione categorias para organizar sua vitrine."
          />
        </div>
      </BlockContainer>
    );
  }

  return (
    <BlockContainer>
      <BlockHeading title={title} />
      {/* Rola na horizontal no celular; em telas grandes fica centralizado */}
      <div className="mt-4 flex gap-4 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] sm:justify-center sm:flex-wrap [&::-webkit-scrollbar]:hidden">
        {items.map((item, i) => (
          <CategoryChip key={`${item.label}-${i}`} item={item} />
        ))}
      </div>
    </BlockContainer>
  );
}
