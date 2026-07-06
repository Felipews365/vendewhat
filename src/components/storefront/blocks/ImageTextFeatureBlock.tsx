/**
 * BLOCO: Destaque com imagem + texto
 * Finalidade: contar uma história (nova coleção, sobre a loja) com uma
 * imagem grande de um lado e texto do outro. Alterna o lado no desktop.
 */
import type { ImageTextFeatureConfig } from "./types";
import { limitText, BLOCK_LIMITS } from "./types";
import { BlockContainer, BlockImage, BlockButton } from "./primitives";

const L = BLOCK_LIMITS.imageTextFeature;

export function ImageTextFeatureBlock({
  config,
  editing = false,
}: {
  config: ImageTextFeatureConfig;
  editing?: boolean;
}) {
  // 🖊️ Lojista edita:
  const eyebrow = limitText(config.eyebrow, L.eyebrow.max);
  const title = limitText(config.title, L.title.max) || "Um destaque da loja";
  const body = limitText(config.body, L.body.max);
  const ctaLabel = limitText(config.ctaLabel, L.ctaLabel.max);
  const imageSide = config.imageSide === "left" ? "left" : "right";

  // Bloco sem nada útil: só título padrão e sem imagem → some na loja pública.
  const isEmpty = !config.title?.trim() && !body && !config.imageUrl?.trim();
  if (isEmpty && !editing) return null;

  const imageEl = (
    <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-stone-100 md:aspect-auto md:min-h-[280px] md:w-1/2">
      <BlockImage src={config.imageUrl} emoji="🖼️" rounded="rounded-2xl" />
    </div>
  );

  const textEl = (
    <div className="flex w-full flex-col justify-center md:w-1/2">
      {eyebrow && (
        <p
          className="text-xs font-semibold uppercase tracking-[0.2em]"
          style={{ color: "var(--store-primary)" }}
        >
          {eyebrow}
        </p>
      )}
      <h2 className="mt-2 font-serif text-2xl font-bold leading-tight text-stone-900 sm:text-3xl md:text-4xl">
        {title}
      </h2>
      {body && (
        <p className="mt-3 text-sm leading-relaxed text-stone-600 sm:text-base">
          {body}
        </p>
      )}
      {ctaLabel && (
        <div className="mt-6">
          <BlockButton href={config.ctaHref} variant="secondary">
            {ctaLabel}
          </BlockButton>
        </div>
      )}
    </div>
  );

  return (
    <BlockContainer>
      {/* Mobile: sempre imagem em cima, texto embaixo. Desktop: lado a lado. */}
      <div className="flex flex-col gap-6 md:flex-row md:items-center md:gap-10">
        {imageSide === "left" ? (
          <>
            {imageEl}
            {textEl}
          </>
        ) : (
          <>
            {textEl}
            {imageEl}
          </>
        )}
      </div>
    </BlockContainer>
  );
}
