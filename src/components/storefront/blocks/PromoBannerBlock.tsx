/**
 * BLOCO: Banner principal promocional
 * Finalidade: primeira dobra da loja — chama a promoção do momento.
 * Suporta 2 formatos: foto de fundo (texto por cima) ou foto ao lado (dividido).
 */
import type { PromoBannerConfig } from "./types";
import { limitText, BLOCK_LIMITS } from "./types";
import { BlockImage } from "./primitives";

const L = BLOCK_LIMITS.promoBanner;

export function PromoBannerBlock({
  config,
  editing = false,
}: {
  config: PromoBannerConfig;
  /** Na prévia do editor mostramos o bloco mesmo "vazio". */
  editing?: boolean;
}) {
  // 🖊️ Tudo abaixo é o que o LOJISTA edita (via formulário do painel):
  const eyebrow = limitText(config.eyebrow, L.eyebrow.max);
  const title = limitText(config.title, L.title.max) || "Sua promoção aqui";
  const subtitle = limitText(config.subtitle, L.subtitle.max);
  const ctaLabel = limitText(config.ctaLabel, L.ctaLabel.max) || "Ver produtos";
  const coupon = limitText(config.couponCode, L.couponCode.max);
  const href = config.ctaHref?.trim() || "#catalogo";
  const layout = config.layout === "split" ? "split" : "overlay";
  const photoSide = config.photoSide === "left" ? "left" : "right";

  // Conteúdo textual reaproveitado nos 2 formatos (texto sempre claro):
  const textContent = (
    <>
      {eyebrow && (
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/80 sm:text-sm">
          {eyebrow}
        </p>
      )}
      <h2 className="mt-2 font-serif text-3xl font-bold leading-[1.1] text-white drop-shadow-md sm:text-4xl md:text-5xl">
        {title}
      </h2>
      {subtitle && (
        <p className="mt-3 max-w-md text-sm leading-relaxed text-white/85 drop-shadow sm:text-base">
          {subtitle}
        </p>
      )}
      {coupon && (
        <div className="mt-4 inline-flex items-center gap-2 self-start">
          <span className="text-xs font-semibold uppercase tracking-widest text-white/80">
            Use o código
          </span>
          <span className="rounded border border-white/30 bg-white/15 px-3 py-1 text-sm font-bold tracking-wider text-white backdrop-blur-sm">
            {coupon}
          </span>
        </div>
      )}
      <a
        href={href}
        className="mt-6 inline-flex items-center justify-center self-start rounded-md px-8 py-3 text-sm font-bold uppercase tracking-widest text-white shadow-lg transition-opacity hover:opacity-90"
        style={{
          backgroundColor:
            layout === "split" ? "var(--store-primary)" : "var(--store-secondary)",
        }}
      >
        {ctaLabel}
      </a>
    </>
  );

  /* ---------------- Formato DIVIDIDO: foto de um lado, texto do outro ------- */
  if (layout === "split") {
    const photo = (
      // Mobile: foto em cima (aspect fixo). Desktop: metade da largura, altura da linha.
      <div className="relative aspect-[16/10] w-full overflow-hidden md:aspect-auto md:w-1/2 md:self-stretch">
        <BlockImage src={config.imageUrl} emoji="🛍️" priority />
      </div>
    );
    const text = (
      <div
        className="flex w-full flex-col justify-center px-6 py-8 sm:px-10 md:w-1/2 md:py-12"
        style={{ backgroundColor: "var(--store-secondary)" }}
      >
        {textContent}
      </div>
    );
    return (
      <section className="flex w-full flex-col overflow-hidden md:min-h-[340px] md:flex-row lg:min-h-[420px]">
        {photoSide === "left" ? (
          <>
            {photo}
            {text}
          </>
        ) : (
          <>
            {text}
            {photo}
          </>
        )}
      </section>
    );
  }

  /* ---------------- Formato OVERLAY: foto de fundo, texto por cima ---------- */
  return (
    <section className="relative w-full overflow-hidden aspect-[16/10] sm:aspect-[2/1] md:aspect-[21/9] lg:aspect-[1920/600]">
      <BlockImage src={config.imageUrl} emoji="🛍️" priority />
      {/* Gradiente garante leitura do texto sobre qualquer foto */}
      <div className="pointer-events-none absolute inset-0 z-10 bg-gradient-to-r from-black/55 via-black/25 to-transparent" />
      <div className="absolute inset-0 z-20 flex max-w-3xl flex-col justify-end px-6 pb-6 sm:px-10 sm:pb-10 md:px-14 md:pb-12">
        {textContent}
      </div>
      {editing && !config.imageUrl && (
        <span className="absolute left-3 top-3 z-30 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-semibold text-white">
          Adicione uma foto para destacar a promoção
        </span>
      )}
    </section>
  );
}
