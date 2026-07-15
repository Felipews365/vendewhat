/**
 * Barra de avisos do topo da loja (pedido mínimo, frete grátis, troca…).
 *
 * **Compartilhada** pela loja pública ([LojaClient](src/app/loja/[slug]/LojaClient.tsx)) e pela
 * prévia do editor ([StoreVisualEditor](src/components/dashboard/StoreVisualEditor.tsx)) — mesmo
 * componente, então o que o lojista vê montando a loja é o que o cliente vê de verdade (mesmo
 * padrão do `HeroTemplateSlide`). Se mudar aqui, muda nos dois.
 *
 * É um **carrossel contínuo** (marquee), igual no celular e no desktop: os avisos entram pela
 * direita e somem na esquerda. Antes era texto parado e no celular só a 1ª frase cabia.
 *
 * O track são DUAS metades idênticas e a animação anda `-50%`, então o laço é imperceptível. Cada
 * metade repete a lista `repeats` vezes para ficar mais larga que a tela (senão sobraria um vão
 * andando na barra). A largura é ESTIMADA por nº de caracteres, não medida no DOM: assim o
 * servidor e o cliente renderizam igual, sem flash na hidratação.
 */

const MARQUEE_CHAR_PX = 7; // largura média por char no tamanho da barra
const MARQUEE_ITEM_GAP_PX = 40; // = gap-x-10
const MARQUEE_MIN_HALF_PX = 1600; // cobre telas largas
const MARQUEE_SPEED_PX_S = 60;

/** Renderiza um aviso com trechos entre **…** em dourado. */
export function AnnouncementText({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("**") && p.endsWith("**") ? (
          <span key={i} className="font-bold" style={{ color: "#FFDA6C" }}>
            {p.slice(2, -2)}
          </span>
        ) : (
          <span key={i}>{p}</span>
        )
      )}
    </>
  );
}

export function AnnouncementBar({ items, bg }: { items: string[]; bg: string }) {
  if (items.length === 0) return null;

  const cyclePx = items.reduce(
    (sum, it) =>
      sum + it.replace(/\*\*/g, "").length * MARQUEE_CHAR_PX + MARQUEE_ITEM_GAP_PX,
    0
  );
  const repeats = Math.max(1, Math.ceil(MARQUEE_MIN_HALF_PX / Math.max(cyclePx, 1)));
  const halfPx = cyclePx * repeats;
  const duration = Math.min(90, Math.max(20, Math.round(halfPx / MARQUEE_SPEED_PX_S)));

  const half = (hidden: boolean) => (
    <div className="flex shrink-0 items-center gap-x-10 pr-10" aria-hidden={hidden}>
      {Array.from({ length: repeats }).flatMap((_, r) =>
        items.map((it, i) => (
          <span key={`${r}-${i}`} className="whitespace-nowrap">
            <AnnouncementText text={it} />
          </span>
        ))
      )}
    </div>
  );

  return (
    <div
      className="w-full text-white text-[11px] sm:text-xs font-medium tracking-wide py-2"
      style={{ backgroundColor: bg }}
    >
      {/* A máscara vai AQUI (não no pai): esmaece só o texto nas pontas — no pai
          ela apagaria também a cor de fundo da barra. É a `-mask` (sem o pause no
          hover da `.vw-marquee`): a barra é fina e colada no topo, então o
          ponteiro passa por ela toda hora e a faixa viveria congelada. */}
      <div className="vw-marquee-mask overflow-hidden">
        <div
          className="vw-marquee-track vw-marquee-always flex w-max"
          style={
            { "--vw-marquee-duration": `${duration}s` } as React.CSSProperties
          }
        >
          {half(false)}
          {half(true)}
        </div>
      </div>
    </div>
  );
}
