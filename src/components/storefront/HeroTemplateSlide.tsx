"use client";

/**
 * Renderiza UM slide do banner num dos "templates" (estilos) inspirados no
 * projeto de referência: gradiente, diagonal, fashion, magazine, spring, sale.
 *
 * É dependency-free (sem framer-motion/magicui): o destaque cursivo usa
 * `.vw-anim-gradient`/`.font-script` (já no globals.css) e os badges
 * giratório/pulsante usam `.vw-spin-slow`/`.vw-pulse-soft` (globals.css),
 * respeitando `prefers-reduced-motion`.
 *
 * O container (altura, carrossel, setas, bolinhas) é responsabilidade de quem
 * usa (HeroBannerBlock na loja / a prévia no editor). Aqui é só `absolute inset-0`.
 */

import Image from "next/image";
import type { HeroSlide, HeroTemplate } from "@/lib/storefront";
import { ShimmerButton } from "@/components/magicui/shimmer-button";

/** Conteúdo textual já resolvido (slide ou fallback geral). */
export type HeroSlideContent = {
  badge: string;
  title: string;
  highlight: string;
  subtitle: string;
  ctaLabel: string;
  ctaHref: string;
};

/** Clareia (amount>0) ou escurece (amount<0) uma cor #rrggbb. */
function adjustHex(hex: string, amount: number): string {
  const clean = hex.replace("#", "");
  if (clean.length < 6) return hex;
  const adj = (c: number) =>
    Math.min(
      255,
      Math.max(
        0,
        amount >= 0 ? Math.round(c + (255 - c) * amount) : Math.round(c * (1 + amount))
      )
    );
  const r = adj(parseInt(clean.slice(0, 2), 16));
  const g = adj(parseInt(clean.slice(2, 4), 16));
  const b = adj(parseInt(clean.slice(4, 6), 16));
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

export function HeroTemplateSlide({
  slide,
  content,
  primary,
  onCta,
  forceLayout,
}: {
  slide: HeroSlide;
  content: HeroSlideContent;
  /** Cor primária da loja (fallback quando o slide não tem gradiente/cor de botão). */
  primary: string;
  onCta: (e: React.MouseEvent, href: string) => void;
  /**
   * Força um layout ignorando o viewport (usado nas PRÉVIAS do editor, que
   * mostram "como fica no celular" e "no PC" lado a lado num mesmo PC).
   * Sem valor = responsivo (empilha no celular, lado a lado no `sm+`).
   */
  forceLayout?: "mobile" | "desktop";
}) {
  const template = (slide.template ?? "overlay") as HeroTemplate;
  const bgFrom = slide.bgFrom || primary;
  const bgTo = slide.bgTo || adjustHex(bgFrom, -0.4);
  const bgVia = slide.bgVia || "";
  const btnBase = slide.ctaBgColor || primary;
  const btnDark = adjustHex(btnBase, -0.15);
  const photoLeft = slide.photoSide === "left";
  const img = slide.url;
  const accent = btnBase;
  // Todas as fotos do slide (a principal + extras dos estilos strips/duo).
  const allPhotos = [img, ...(slide.images ?? [])].filter(Boolean) as string[];

  /**
   * Preenche a área de foto de um estilo. Com 1 foto = comportamento antigo
   * (uma imagem preenchendo o container). Com 2-3 fotos = divide o espaço em
   * colunas (mosaico), então o mesmo modelo se adapta a 1, 2 ou 3 fotos.
   */
  const MultiPhoto = ({ className, sizes }: { className: string; sizes: string }) => {
    if (allPhotos.length <= 1) {
      return allPhotos.length === 1 ? (
        <Image src={allPhotos[0]!} alt={content.title} fill className={className} sizes={sizes} priority />
      ) : null;
    }
    return (
      <div className="absolute inset-0 flex gap-[2px]">
        {allPhotos.slice(0, 3).map((src, k) => (
          <div key={k} className="relative h-full flex-1 overflow-hidden">
            <Image src={src} alt="" fill className={className} sizes={sizes} />
          </div>
        ))}
      </div>
    );
  };

  const gradient = bgVia
    ? `linear-gradient(135deg, ${bgFrom}, ${bgVia}, ${bgTo})`
    : `linear-gradient(135deg, ${bgFrom}, ${bgTo})`;
  const shape = (deg: number) =>
    bgVia
      ? `linear-gradient(${deg}deg, ${bgFrom}, ${bgVia}, ${bgTo})`
      : `linear-gradient(${deg}deg, ${bgFrom}, ${bgTo})`;

  /** Destaque cursivo em degradê animado (dourado→branco→azul claro). */
  const Hl = ({ t }: { t: string }) => (
    <span
      className="vw-anim-gradient font-script font-bold"
      style={{
        backgroundImage: "linear-gradient(to right, #FFD600, #ffffff, #9DC4FF)",
      }}
    >
      {t}
    </span>
  );

  /** Botão CTA — ShimmerButton (brilho deslizante), com o degradê da cor escolhida. */
  const btnLight = adjustHex(btnBase, 0.28);
  const Cta = () =>
    content.ctaLabel ? (
      <a href={content.ctaHref} onClick={(e) => onCta(e, content.ctaHref)} className="w-fit">
        <ShimmerButton
          className="gap-1.5 px-5 py-2.5 text-xs font-bold sm:text-sm"
          background={`radial-gradient(ellipse 80% 50% at 50% 120%, ${btnBase}, ${btnDark})`}
          hoverBackground={`radial-gradient(ellipse 80% 50% at 50% 120%, ${btnLight}, ${btnBase})`}
          shimmerColor="#ffffff"
        >
          {content.ctaLabel}
          <span aria-hidden>→</span>
        </ShimmerButton>
      </a>
    ) : null;

  // ── Bloco de texto sobre fundo colorido (branco) ──────────────────────
  const TextOnColor = ({ highlightScript = false }: { highlightScript?: boolean }) => (
    <>
      {content.badge && (
        <div className="mb-3 inline-flex w-fit items-center gap-1.5 rounded-full bg-white/20 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-white">
          ✦ {content.badge}
        </div>
      )}
      <h2 className="font-display mb-3 text-3xl font-bold leading-tight text-white sm:text-4xl lg:text-5xl">
        {content.title}
        {content.highlight &&
          (highlightScript ? (
            <>
              <br />
              <span className="text-4xl sm:text-5xl lg:text-6xl">
                <Hl t={content.highlight} />
              </span>
            </>
          ) : (
            <>
              <br />
              <Hl t={content.highlight} />
            </>
          ))}
      </h2>
      {content.subtitle && (
        <p className="mb-5 line-clamp-3 max-w-[34ch] text-sm text-white/80 sm:text-base">
          {content.subtitle}
        </p>
      )}
      <Cta />
    </>
  );

  // ── Texto compacto para o EMPILHADO do celular (adapta a cor ao fundo) ─
  const MobileCopy = ({ light }: { light: boolean }) => (
    <>
      {content.badge && (
        <p
          className="text-[10px] font-bold uppercase tracking-widest"
          style={{ color: light ? accent : "rgba(255,255,255,0.85)" }}
        >
          {content.badge}
        </p>
      )}
      {content.title && (
        <h2
          className="font-display text-lg font-black leading-tight"
          style={{ color: light ? "#1a1a2e" : "#ffffff" }}
        >
          {content.title}
        </h2>
      )}
      {content.highlight && (
        <p className="leading-none">
          <span
            className="vw-anim-gradient font-script text-xl font-bold"
            style={{
              backgroundImage: light
                ? `linear-gradient(110deg, ${accent} 0%, ${accent} 38%, ${adjustHex(accent, 0.85)} 50%, ${accent} 62%, ${accent} 100%)`
                : "linear-gradient(to right, #FFD600, #ffffff, #9DC4FF)",
            }}
          >
            {content.highlight}
          </span>
        </p>
      )}
      {content.subtitle && (
        <p className={`mt-0.5 line-clamp-1 text-xs ${light ? "text-gray-500" : "text-white/80"}`}>
          {content.subtitle}
        </p>
      )}
    </>
  );

  // ── EMPILHADO no celular: foto(s) em cima (largura total) + texto embaixo ─
  // Evita espremer as fotos numa telinha estreita. No desktop (sm+) volta o
  // layout lado a lado de cada estilo. O texto e o botão ficam na MESMA linha
  // (texto à esquerda, "Ver produtos" à direita) — painel baixo, sem sobra
  // branca embaixo, e a foto ganha altura.
  const MobileStack = ({ light }: { light: boolean }) => (
    <div
      className="flex h-full w-full flex-col"
      style={{ background: light ? "#ffffff" : gradient }}
    >
      <div className="relative w-full flex-1 overflow-hidden">
        {allPhotos.length > 1 ? (
          <div className="absolute inset-0 flex gap-[3px]">
            {allPhotos.slice(0, 3).map((src, k) => (
              <div key={k} className="relative flex-1 overflow-hidden">
                <Image src={src} alt="" fill className="vw-photo-in object-cover object-center" sizes="50vw" />
              </div>
            ))}
          </div>
        ) : img ? (
          <Image src={img} alt={content.title} fill className="vw-photo-in object-cover object-top" sizes="100vw" priority />
        ) : null}
      </div>
      <div className="vw-reveal-stagger flex items-center justify-between gap-3 px-5 py-3">
        <div className="flex min-w-0 flex-col">
          <MobileCopy light={light} />
        </div>
        {content.ctaLabel && <div className="shrink-0"><Cta /></div>}
      </div>
    </div>
  );

  // Envolve o layout de desktop de cada estilo: esconde no celular e mostra o
  // MobileStack empilhado no lugar. `light` = texto escuro sobre fundo claro.
  // `forceLayout` (prévias do editor) fixa um dos dois, ignorando o viewport.
  const wrap = (desktop: React.ReactNode, light: boolean) => {
    if (forceLayout === "mobile") {
      return (
        <div className="absolute inset-0">
          <MobileStack light={light} />
        </div>
      );
    }
    if (forceLayout === "desktop") {
      return <div className="absolute inset-0">{desktop}</div>;
    }
    return (
      <>
        <div className="absolute inset-0 sm:hidden">
          <MobileStack light={light} />
        </div>
        <div className="absolute inset-0 hidden sm:block">{desktop}</div>
      </>
    );
  };

  // ── GRADIENTE (fundo colorido inteiro, foto opcional de um lado) ──────
  if (template === "gradient") {
    return wrap((
      <div className="absolute inset-0" style={{ background: gradient }}>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_75%_40%,rgba(255,255,255,0.08)_0%,transparent_55%)]" />
        {img && (
          <div
            className={`absolute ${photoLeft ? "left-0" : "right-0"} top-0 bottom-0 w-[42%] sm:w-[38%]`}
          >
            <div
              className={`absolute inset-y-0 ${photoLeft ? "right-0" : "left-0"} z-10 w-16 sm:w-24`}
              style={{
                background: `linear-gradient(to ${photoLeft ? "right" : "left"}, ${photoLeft ? bgFrom : bgTo}, transparent)`,
              }}
            />
            <MultiPhoto className="vw-photo-in object-cover object-top" sizes="42vw" />
          </div>
        )}
        <div
          className={`vw-reveal-stagger relative z-10 flex h-full flex-col justify-center p-6 sm:p-10 ${
            img ? "w-[58%]" : "w-full max-w-2xl"
          } ${photoLeft && img ? "ml-auto" : ""}`}
        >
          <TextOnColor />
        </div>
      </div>
    ), false);
  }

  // ── DIAGONAL (foto + painel colorido com recorte diagonal) ────────────
  if (template === "diagonal") {
    const shapeClip = photoLeft
      ? "polygon(22% 0, 100% 0, 100% 100%, 0 100%)"
      : "polygon(0 0, 78% 0, 100% 100%, 0 100%)";
    const photoClip = photoLeft
      ? "polygon(0 0, 100% 0, 82% 100%, 0 100%)"
      : "polygon(18% 0, 100% 0, 100% 100%, 0 100%)";
    return wrap((
      <div className="absolute inset-0 overflow-hidden bg-white">
        {img && (
          <div
            className={`absolute inset-y-0 ${photoLeft ? "left-0" : "right-0"} w-[54%]`}
            style={{ clipPath: photoClip }}
          >
            <MultiPhoto className="vw-photo-in object-cover object-center" sizes="54vw" />
          </div>
        )}
        <div
          className={`absolute inset-y-0 ${photoLeft ? "right-0" : "left-0"} z-10 w-[60%]`}
          style={{ background: gradient, clipPath: shapeClip }}
        />
        <div
          className={`vw-reveal-stagger absolute inset-y-0 ${photoLeft ? "right-0" : "left-0"} z-20 flex w-[52%] flex-col justify-center px-5 sm:px-8 lg:px-12`}
        >
          <TextOnColor />
        </div>
      </div>
    ), false);
  }

  // ── FASHION (foto retangular + painel + badge círculo) ────────────────
  if (template === "fashion") {
    const shapeClip = photoLeft
      ? "polygon(18% 0, 100% 0, 100% 100%, 0 100%)"
      : "polygon(0 0, 82% 0, 100% 100%, 0 100%)";
    return wrap((
      <div className="absolute inset-0 overflow-hidden" style={{ background: "#f5f0ec" }}>
        <div
          className={`absolute inset-y-0 ${photoLeft ? "right-0" : "left-0"} w-[68%]`}
          style={{ background: shape(150), clipPath: shapeClip }}
        />
        {img && (
          <div className={`absolute inset-y-0 ${photoLeft ? "left-0" : "right-0"} w-[46%]`}>
            <Image src={img} alt={content.title} fill className="vw-photo-in object-cover object-center" sizes="46vw" priority />
          </div>
        )}
        {content.badge && (
          <div
            className="absolute z-20"
            style={{
              [photoLeft ? "left" : "right"]: img ? "43%" : "18%",
              top: "50%",
              transform: `translate(${photoLeft ? "-50%" : "50%"},-50%)`,
            }}
          >
            <div
              className="flex h-16 w-16 flex-col items-center justify-center rounded-full bg-white p-2 text-center shadow-xl sm:h-20 sm:w-20 lg:h-24 lg:w-24"
              style={{ border: `3px solid ${adjustHex(bgFrom, 0.4)}` }}
            >
              <span className="text-[0.55rem] font-black uppercase leading-tight lg:text-[0.6rem]" style={{ color: bgFrom }}>
                {content.badge}
              </span>
            </div>
          </div>
        )}
        <div
          className={`vw-reveal-stagger absolute inset-y-0 ${photoLeft ? "right-0" : "left-0"} z-10 flex w-[56%] flex-col justify-center px-5 sm:px-8 lg:px-14`}
        >
          {content.title && (
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-white/65 sm:text-sm">
              {content.title}
            </p>
          )}
          <h2 className="font-display mb-3 text-3xl font-black leading-none text-white sm:text-5xl lg:text-6xl">
            <Hl t={content.highlight || content.title || "DESTAQUE"} />
          </h2>
          {content.subtitle && (
            <p className="mb-4 line-clamp-2 max-w-[30ch] text-sm text-white/75 sm:text-base">{content.subtitle}</p>
          )}
          <Cta />
        </div>
      </div>
    ), false);
  }

  // ── MAGAZINE (texto colorido sobre branco + foto recortada) ───────────
  if (template === "magazine") {
    const panelClip = photoLeft
      ? "polygon(0 0, 86% 0, 100% 100%, 0 100%)"
      : "polygon(14% 0, 100% 0, 100% 100%, 0 100%)";
    const photoClip = photoLeft
      ? "polygon(0 0, 83% 0, 97% 100%, 0 100%)"
      : "polygon(17% 0, 100% 0, 100% 100%, 3% 100%)";
    return wrap((
      <div className="absolute inset-0 overflow-hidden bg-white">
        <div
          className={`absolute inset-y-0 ${photoLeft ? "left-0" : "right-0"} w-[60%]`}
          style={{ background: shape(160), clipPath: panelClip }}
        />
        {img && (
          <div
            className={`absolute inset-y-0 ${photoLeft ? "left-0" : "right-0"} z-10 w-[57%]`}
            style={{ clipPath: photoClip }}
          >
            <Image src={img} alt={content.title} fill className="vw-photo-in object-cover object-center" sizes="57vw" priority />
          </div>
        )}
        <div
          className={`vw-reveal-stagger absolute inset-y-0 ${photoLeft ? "right-0" : "left-0"} z-20 flex w-[50%] flex-col justify-center px-5 sm:px-8 lg:px-14`}
        >
          {content.badge && (
            <p className="mb-1 text-xs font-bold uppercase tracking-widest sm:text-sm" style={{ color: bgFrom }}>
              {content.badge}
            </p>
          )}
          <h2 className="font-display text-2xl font-black leading-none sm:text-4xl lg:text-5xl" style={{ color: bgFrom }}>
            {content.title}
          </h2>
          {content.highlight && (
            <p className="font-display mt-1 text-xl font-bold leading-tight sm:text-2xl lg:text-3xl" style={{ color: bgTo }}>
              {content.highlight}
            </p>
          )}
          {content.subtitle && (
            <p className="mb-5 mt-2 line-clamp-3 max-w-[34ch] text-sm text-gray-500 sm:text-base">{content.subtitle}</p>
          )}
          <Cta />
        </div>
      </div>
    ), true);
  }

  // ── SPRING (fundo branco + forma diagonal + badge giratório) ──────────
  if (template === "spring") {
    return wrap((
      <div className="absolute inset-0 overflow-hidden bg-white">
        <div
          className={`absolute inset-y-0 ${!photoLeft ? "left-0" : "right-0"} w-[55%]`}
          style={{
            background: shape(150),
            clipPath: !photoLeft ? "polygon(0 0, 78% 0, 100% 100%, 0 100%)" : "polygon(22% 0, 100% 0, 100% 100%, 0 100%)",
          }}
        />
        {img && (
          <div
            className={`absolute inset-y-0 ${!photoLeft ? "left-0" : "right-0"} w-[50%]`}
            style={{
              clipPath: !photoLeft ? "polygon(0 0, 75% 0, 100% 100%, 0 100%)" : "polygon(25% 0, 100% 0, 100% 100%, 0 100%)",
            }}
          >
            <Image src={img} alt={content.title} fill className="vw-photo-in object-cover object-center" sizes="50vw" priority />
          </div>
        )}
        {content.badge && (
          <div
            className="absolute z-20"
            style={{ [!photoLeft ? "left" : "right"]: "42%", top: "50%", transform: "translate(50%,-50%)" }}
          >
            <div
              className="vw-spin-slow flex h-20 w-20 flex-col items-center justify-center rounded-full bg-white p-2 text-center shadow-xl lg:h-24 lg:w-24"
              style={{ border: `3px solid ${adjustHex(bgFrom, 0.3)}` }}
            >
              <span className="text-[0.5rem] font-black uppercase leading-tight lg:text-[0.58rem]" style={{ color: bgFrom }}>
                {content.badge}
              </span>
            </div>
          </div>
        )}
        <div
          className={`vw-reveal-stagger absolute inset-y-0 ${!photoLeft ? "right-0" : "left-0"} z-10 flex w-[48%] flex-col justify-center px-5 sm:px-8 lg:px-14`}
        >
          {content.title && (
            <p className="mb-1 text-xs font-bold uppercase tracking-[0.2em] sm:text-sm" style={{ color: bgFrom }}>
              {content.title}
            </p>
          )}
          <h2 className="font-display mb-3 text-2xl font-black leading-none sm:text-4xl lg:text-5xl" style={{ color: "#1a1a2e" }}>
            <Hl t={content.highlight || content.title || "DESTAQUE"} />
          </h2>
          {content.subtitle && (
            <p className="mb-4 line-clamp-3 max-w-[32ch] text-sm text-gray-500 sm:text-base">{content.subtitle}</p>
          )}
          <Cta />
        </div>
      </div>
    ), true);
  }

  // ── SALE (foto + badge % OFF pulsante no centro) ──────────────────────
  if (template === "sale") {
    return wrap((
      <div className="absolute inset-0 overflow-hidden bg-white">
        <div
          className={`absolute inset-y-0 ${!photoLeft ? "right-0" : "left-0"} w-[58%]`}
          style={{
            background: shape(150),
            clipPath: !photoLeft ? "polygon(20% 0, 100% 0, 100% 100%, 0 100%)" : "polygon(0 0, 80% 0, 100% 100%, 0 100%)",
          }}
        />
        {img && (
          <div
            className={`absolute inset-y-0 ${!photoLeft ? "left-0" : "right-0"} w-[48%]`}
            style={{
              clipPath: !photoLeft ? "polygon(0 0, 100% 0, 82% 100%, 0 100%)" : "polygon(18% 0, 100% 0, 100% 100%, 0 100%)",
            }}
          >
            <Image src={img} alt={content.title} fill className="vw-photo-in object-cover object-center" sizes="48vw" priority />
          </div>
        )}
        {content.badge && (
          <div className="absolute z-20" style={{ left: "50%", top: "50%", transform: "translate(-50%,-50%)" }}>
            <div
              className="vw-pulse-soft flex h-24 w-24 flex-col items-center justify-center rounded-full bg-white p-3 text-center shadow-2xl lg:h-28 lg:w-28"
              style={{ border: `4px solid ${adjustHex(bgFrom, 0.35)}` }}
            >
              <span className="text-[0.6rem] font-black uppercase leading-none lg:text-[0.65rem]" style={{ color: bgFrom }}>
                DISC.
              </span>
              <span className="text-lg font-black leading-none lg:text-2xl" style={{ color: bgFrom }}>
                {content.badge}
              </span>
              <span className="text-[0.5rem] font-semibold uppercase lg:text-[0.58rem]" style={{ color: bgFrom }}>
                ALL ITEM
              </span>
            </div>
          </div>
        )}
        <div
          className={`vw-reveal-stagger absolute inset-y-0 ${!photoLeft ? "right-0" : "left-0"} z-10 flex w-[50%] flex-col justify-center px-5 sm:px-8 lg:px-14`}
        >
          {content.title && (
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-white/70 sm:text-sm">{content.title}</p>
          )}
          <h2 className="font-display mb-4 text-3xl font-black leading-none text-white sm:text-5xl lg:text-6xl">
            <Hl t={content.highlight || content.title || "SALE"} />
          </h2>
          {content.subtitle && (
            <p className="mb-5 line-clamp-2 max-w-[28ch] text-sm text-white/75 sm:text-base">{content.subtitle}</p>
          )}
          <Cta />
        </div>
      </div>
    ), false);
  }

  // ── STRIPS (3 faixas diagonais + painel de texto CLARO, como a referência) ─
  if (template === "strips") {
    const photos = [img, ...(slide.images ?? [])].filter(Boolean);
    const strips = photos.length
      ? Array.from({ length: 3 }, (_, k) => photos[k % photos.length]!)
      : [];
    // Cor de destaque (eyebrow/cursivo/botão) = `accent` (cor do botão / primária).
    return wrap((
      <div className="absolute inset-0 overflow-hidden bg-white">
        {/* Faixas de foto: a borda esquerda (inclinada) contra o branco vira a
            diagonal — por isso o painel NÃO cobre as fotos (sem sobreposição). */}
        {strips.length > 0 && (
          <div
            className="absolute inset-y-0 flex w-[62%] gap-[3px] overflow-hidden"
            style={{
              transform: "skewX(-9deg)",
              left: photoLeft ? "-6%" : undefined,
              right: photoLeft ? undefined : "-6%",
            }}
          >
            {strips.map((src, k) => (
              <div
                key={k}
                className="vw-strip-drift relative -mt-[8%] h-[116%] flex-1 overflow-hidden"
                style={{ animationDelay: `${k * 0.55}s` }}
              >
                <div
                  className="absolute inset-0"
                  style={{ transform: "skewX(9deg) scale(1.35)" }}
                >
                  <Image src={src} alt="" fill className="object-cover object-center" sizes="30vw" />
                </div>
              </div>
            ))}
            <div className="vw-strip-shine pointer-events-none absolute inset-y-0 left-0 w-1/4 bg-gradient-to-r from-transparent via-white/40 to-transparent" />
          </div>
        )}
        <div
          className={`vw-reveal-stagger absolute inset-y-0 ${photoLeft ? "right-0" : "left-0"} z-10 flex w-[40%] flex-col justify-center px-3 sm:w-[44%] sm:px-8 lg:px-12`}
        >
          {content.badge && (
            <p className="mb-1 text-[10px] font-bold uppercase tracking-widest sm:mb-2 sm:text-sm" style={{ color: accent }}>
              {content.badge}
            </p>
          )}
          {content.title && (
            <h2 className="font-display text-lg font-black leading-[1.1] text-gray-900 sm:text-4xl sm:leading-[1.05] lg:text-5xl">
              {content.title}
            </h2>
          )}
          {content.highlight && (
            <p className="mt-0.5 leading-none sm:mt-1">
              {/* Cursivo com brilho que varre o texto (shine) — visível no
                  painel claro: rosa → tom claro do rosa → rosa, deslizando. */}
              <span
                className="vw-anim-gradient font-script text-2xl font-bold sm:text-5xl lg:text-6xl"
                style={{
                  backgroundImage: `linear-gradient(110deg, ${accent} 0%, ${accent} 38%, ${adjustHex(accent, 0.85)} 50%, ${accent} 62%, ${accent} 100%)`,
                }}
              >
                {content.highlight}
              </span>
            </p>
          )}
          {content.subtitle && (
            <p className="mb-3 mt-1.5 line-clamp-2 max-w-[32ch] text-xs text-gray-500 sm:mb-6 sm:mt-3 sm:line-clamp-3 sm:text-base">
              {content.subtitle}
            </p>
          )}
          <Cta />
        </div>
      </div>
    ), true);
  }

  // ── DUO (2 fotos lado a lado + painel claro com destaque cursivo) ──────
  if (template === "duo") {
    // 1 foto = preenche a área; 2 fotos = divide em duas colunas (adaptativo).
    const pair = allPhotos.slice(0, 2);
    return wrap((
      <div className="absolute inset-0 overflow-hidden bg-white">
        {pair.length > 0 && (
          <div
            className={`absolute inset-y-0 ${photoLeft ? "left-0" : "right-0"} flex w-[52%] gap-1`}
          >
            {pair.map((src, k) => (
              <div key={k} className="relative flex-1 overflow-hidden">
                <Image src={src} alt="" fill className="vw-photo-in object-cover object-center" sizes="26vw" />
              </div>
            ))}
          </div>
        )}
        <div
          className={`vw-reveal-stagger absolute inset-y-0 ${photoLeft ? "right-0" : "left-0"} z-10 flex w-[50%] flex-col justify-center px-3 sm:px-8 lg:px-14`}
        >
          {content.badge && (
            <p className="mb-1 text-[10px] font-bold uppercase tracking-widest sm:text-sm" style={{ color: accent }}>
              {content.badge}
            </p>
          )}
          {content.title && (
            <h2 className="font-display text-lg font-black leading-tight sm:text-4xl lg:text-5xl" style={{ color: "#1a1a2e" }}>
              {content.title}
            </h2>
          )}
          {content.highlight && (
            <p className="mt-0.5 leading-none sm:mt-1">
              {/* Cursivo com brilho que varre o texto (shine). */}
              <span
                className="vw-anim-gradient font-script text-2xl font-bold sm:text-4xl lg:text-5xl"
                style={{
                  backgroundImage: `linear-gradient(110deg, ${accent} 0%, ${accent} 38%, ${adjustHex(accent, 0.85)} 50%, ${accent} 62%, ${accent} 100%)`,
                }}
              >
                {content.highlight}
              </span>
            </p>
          )}
          {content.subtitle && (
            <p className="mb-3 mt-1.5 line-clamp-2 max-w-[34ch] text-xs text-gray-500 sm:mb-5 sm:mt-2 sm:line-clamp-3 sm:text-base">
              {content.subtitle}
            </p>
          )}
          <Cta />
        </div>
      </div>
    ), true);
  }

  // Fallback (não deveria chegar aqui — overlay/split são tratados fora).
  return (
    <div className="absolute inset-0" style={{ background: gradient }}>
      <div className="relative z-10 flex h-full flex-col justify-center p-6 sm:p-10">
        <TextOnColor />
      </div>
    </div>
  );
}
