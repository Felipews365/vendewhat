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
}: {
  slide: HeroSlide;
  content: HeroSlideContent;
  /** Cor primária da loja (fallback quando o slide não tem gradiente/cor de botão). */
  primary: string;
  onCta: (e: React.MouseEvent, href: string) => void;
}) {
  const template = (slide.template ?? "overlay") as HeroTemplate;
  const bgFrom = slide.bgFrom || primary;
  const bgTo = slide.bgTo || adjustHex(bgFrom, -0.4);
  const bgVia = slide.bgVia || "";
  const btnBase = slide.ctaBgColor || primary;
  const btnDark = adjustHex(btnBase, -0.15);
  const photoLeft = slide.photoSide === "left";
  const img = slide.url;

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

  /** Botão CTA (com degradê da cor escolhida). */
  const Cta = () =>
    content.ctaLabel ? (
      <a
        href={content.ctaHref}
        onClick={(e) => onCta(e, content.ctaHref)}
        className="inline-flex w-fit items-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold text-white shadow-md transition-transform hover:-translate-y-0.5 sm:px-5 sm:py-2.5 sm:text-sm"
        style={{ background: `linear-gradient(135deg, ${btnBase}, ${btnDark})` }}
      >
        {content.ctaLabel}
        <span aria-hidden>→</span>
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

  // ── GRADIENTE (fundo colorido inteiro, foto opcional de um lado) ──────
  if (template === "gradient") {
    return (
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
            <Image src={img} alt={content.title} fill className="object-cover object-top" sizes="42vw" priority />
          </div>
        )}
        <div
          className={`relative z-10 flex h-full flex-col justify-center p-6 sm:p-10 ${
            img ? "w-[58%]" : "w-full max-w-2xl"
          } ${photoLeft && img ? "ml-auto" : ""}`}
        >
          <TextOnColor />
        </div>
      </div>
    );
  }

  // ── DIAGONAL (foto + painel colorido com recorte diagonal) ────────────
  if (template === "diagonal") {
    const shapeClip = photoLeft
      ? "polygon(22% 0, 100% 0, 100% 100%, 0 100%)"
      : "polygon(0 0, 78% 0, 100% 100%, 0 100%)";
    const photoClip = photoLeft
      ? "polygon(0 0, 100% 0, 82% 100%, 0 100%)"
      : "polygon(18% 0, 100% 0, 100% 100%, 0 100%)";
    return (
      <div className="absolute inset-0 overflow-hidden bg-white">
        {img && (
          <div
            className={`absolute inset-y-0 ${photoLeft ? "left-0" : "right-0"} w-[54%]`}
            style={{ clipPath: photoClip }}
          >
            <Image src={img} alt={content.title} fill className="object-cover object-center" sizes="54vw" priority />
          </div>
        )}
        <div
          className={`absolute inset-y-0 ${photoLeft ? "right-0" : "left-0"} z-10 w-[60%]`}
          style={{ background: gradient, clipPath: shapeClip }}
        />
        <div
          className={`absolute inset-y-0 ${photoLeft ? "right-0" : "left-0"} z-20 flex w-[52%] flex-col justify-center px-5 sm:px-8 lg:px-12`}
        >
          <TextOnColor />
        </div>
      </div>
    );
  }

  // ── FASHION (foto retangular + painel + badge círculo) ────────────────
  if (template === "fashion") {
    const shapeClip = photoLeft
      ? "polygon(18% 0, 100% 0, 100% 100%, 0 100%)"
      : "polygon(0 0, 82% 0, 100% 100%, 0 100%)";
    return (
      <div className="absolute inset-0 overflow-hidden" style={{ background: "#f5f0ec" }}>
        <div
          className={`absolute inset-y-0 ${photoLeft ? "right-0" : "left-0"} w-[68%]`}
          style={{ background: shape(150), clipPath: shapeClip }}
        />
        {img && (
          <div className={`absolute inset-y-0 ${photoLeft ? "left-0" : "right-0"} w-[46%]`}>
            <Image src={img} alt={content.title} fill className="object-cover object-center" sizes="46vw" priority />
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
          className={`absolute inset-y-0 ${photoLeft ? "right-0" : "left-0"} z-10 flex w-[56%] flex-col justify-center px-5 sm:px-8 lg:px-14`}
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
    );
  }

  // ── MAGAZINE (texto colorido sobre branco + foto recortada) ───────────
  if (template === "magazine") {
    const panelClip = photoLeft
      ? "polygon(0 0, 86% 0, 100% 100%, 0 100%)"
      : "polygon(14% 0, 100% 0, 100% 100%, 0 100%)";
    const photoClip = photoLeft
      ? "polygon(0 0, 83% 0, 97% 100%, 0 100%)"
      : "polygon(17% 0, 100% 0, 100% 100%, 3% 100%)";
    return (
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
            <Image src={img} alt={content.title} fill className="object-cover object-center" sizes="57vw" priority />
          </div>
        )}
        <div
          className={`absolute inset-y-0 ${photoLeft ? "right-0" : "left-0"} z-20 flex w-[50%] flex-col justify-center px-5 sm:px-8 lg:px-14`}
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
    );
  }

  // ── SPRING (fundo branco + forma diagonal + badge giratório) ──────────
  if (template === "spring") {
    return (
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
            <Image src={img} alt={content.title} fill className="object-cover object-center" sizes="50vw" priority />
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
          className={`absolute inset-y-0 ${!photoLeft ? "right-0" : "left-0"} z-10 flex w-[48%] flex-col justify-center px-5 sm:px-8 lg:px-14`}
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
    );
  }

  // ── SALE (foto + badge % OFF pulsante no centro) ──────────────────────
  if (template === "sale") {
    return (
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
            <Image src={img} alt={content.title} fill className="object-cover object-center" sizes="48vw" priority />
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
          className={`absolute inset-y-0 ${!photoLeft ? "right-0" : "left-0"} z-10 flex w-[50%] flex-col justify-center px-5 sm:px-8 lg:px-14`}
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
    );
  }

  // ── STRIPS (3 faixas diagonais + painel de texto CLARO, como a referência) ─
  if (template === "strips") {
    const photos = [img, ...(slide.images ?? [])].filter(Boolean);
    const strips = photos.length
      ? Array.from({ length: 3 }, (_, k) => photos[k % photos.length]!)
      : [];
    // Cor de destaque (eyebrow/cursivo/botão) = cor do botão ou a primária da loja.
    const accent = btnBase;
    return (
      <div className="absolute inset-0 overflow-hidden bg-white">
        {/* Faixas de foto: a borda esquerda (inclinada) contra o branco vira a
            diagonal — por isso o painel NÃO cobre as fotos (sem sobreposição). */}
        {strips.length > 0 && (
          <div
            className="absolute inset-y-0 flex w-[60%] gap-[3px] overflow-hidden"
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
          className={`absolute inset-y-0 ${photoLeft ? "right-0" : "left-0"} z-10 flex w-[46%] flex-col justify-center px-3 sm:w-[44%] sm:px-8 lg:px-12`}
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
    );
  }

  // ── DUO (2 fotos lado a lado + painel claro com destaque cursivo) ──────
  if (template === "duo") {
    const photos = [img, ...(slide.images ?? [])].filter(Boolean);
    const pair = photos.length
      ? Array.from({ length: 2 }, (_, k) => photos[k % photos.length]!)
      : [];
    const accent = btnBase;
    return (
      <div className="absolute inset-0 overflow-hidden bg-white">
        {pair.length > 0 && (
          <div
            className={`absolute inset-y-0 ${photoLeft ? "left-0" : "right-0"} flex w-[52%] gap-1`}
          >
            {pair.map((src, k) => (
              <div key={k} className="relative flex-1 overflow-hidden">
                <Image src={src} alt="" fill className="object-cover object-center" sizes="26vw" />
              </div>
            ))}
          </div>
        )}
        <div
          className={`absolute inset-y-0 ${photoLeft ? "right-0" : "left-0"} z-10 flex w-[50%] flex-col justify-center px-3 sm:px-8 lg:px-14`}
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
    );
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
