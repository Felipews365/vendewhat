"use client";

/**
 * STORIES DA LOJA (estilo Instagram) — bolinha flutuante na lateral que abre um
 * player em tela cheia com vídeo/foto e o card do produto anunciado.
 *
 * O produto vem por REFERÊNCIA (`story.productId` → catálogo), então foto/nome/
 * preço estão sempre atualizados e "Ver produto" abre o detalhe da própria loja
 * (não manda o cliente para fora). Produto apagado = story sem card.
 *
 * Sem migration: os stories moram no JSONB `storefront.stories`.
 */

import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  MAX_STORIES,
  STORY_IMAGE_MS,
  formatBRL,
  type StoreStory,
} from "@/lib/storefront";

/** Onde o cliente largou a bolinha (por navegador dele, não por loja). */
const BUBBLE_POS_KEY = "vw-story-bubble-pos";
/** Arrasto só começa a valer depois disso — abaixo, é toque para abrir. */
const DRAG_THRESHOLD_PX = 6;
/**
 * Medidas do widget, todas derivadas da foto — mexer no `PHOTO_PX` reajusta o
 * resto junto. As proporções saem da referência (o anel fino, o nome passando
 * rente a ele e o ✕ pequeno encostado no anel, não jogado no canto).
 */
/** Diâmetro da foto. É daqui que sai todo o resto. */
const PHOTO_PX = 76;
/** A bolinha = foto + as duas molduras (o anel colorido e o aro branco). */
const BUBBLE_PX = PHOTO_PX + 10;
/**
 * Raio do círculo em que o selo corre. A folga é pequena de propósito: o texto
 * corre RENTE ao anel (as letras crescem para fora da linha de base, então este
 * raio é o vão até a borda da bolinha).
 */
const RING_R = BUBBLE_PX / 2 + 6;
/** Tamanho da letra do nome girando. */
const RING_FONT_PX = 10;
/** O ✕ é pequeno e fica às ~10h, encostado no anel. */
const CLOSE_PX = 20;
const CLOSE_ANGLE_DEG = 205;
const CLOSE_DIST = BUBBLE_PX / 2 + 6;
/**
 * Lado do widget inteiro: cabe o círculo do nome + a letra dele. Tamanho
 * **explícito** (e não deixado ao "shrink-to-fit") de propósito: encostada na
 * direita, a caixa só teria os poucos px que sobram até a borda como largura
 * disponível e o navegador **espremia a bolinha numa pílula** — era o bug do
 * "achatado no lado direito".
 */
const WIDGET_PX = (RING_R + RING_FONT_PX) * 2;
/** Centro do widget — origem de tudo que é posicionado dentro dele. */
const MID = WIDGET_PX / 2;
/**
 * Distância do centro à borda em que ele gruda. Sai da **BOLINHA**, não do
 * `WIDGET_PX`: a caixa do widget inclui o vão do selo girando, então medir por
 * ela parava a bolinha ~20px antes da beirada e ela parecia **boiando**. A
 * folga é um respiro pequeno — nem colada na ponta, nem flutuando.
 * Também é o trilho do `clamp` do CSS: o centro nunca chega perto o bastante do
 * canto para a bolinha sair da tela, inclusive ao girar o celular.
 */
const BUBBLE_EDGE_PX = BUBBLE_PX / 2 + 14;
/**
 * Faixa do topo/base (em % da altura) onde a bolinha aceita grudar em cima ou
 * embaixo. Fora dela — ou seja, **largada no meio da tela** — ela vai para a
 * ESQUERDA ou a DIREITA, nunca para o topo/base: no meio da altura, o lado é o
 * canto natural, e cima/baixo é para quem mirou cima/baixo.
 */
const TOP_BOTTOM_BAND = 0.18;

/** Em qual borda da tela a bolinha está grudada. */
type BubbleEdge = "left" | "right" | "top" | "bottom";
/** Posição: a borda + onde ela está AO LONGO dessa borda (0..1 da tela). */
type BubblePos = { edge: BubbleEdge; pct: number };

const isEdge = (v: unknown): v is BubbleEdge =>
  v === "left" || v === "right" || v === "top" || v === "bottom";

/**
 * Decide em qual borda a bolinha gruda quando o cliente solta. Ela nunca fica
 * solta no meio da tela — só encostada num dos lados, no topo ou embaixo.
 *
 * **Topo/base só valem se ele MIROU o topo/base** (soltou dentro da faixa
 * `TOP_BOTTOM_BAND`). Largada em qualquer outra altura — o meio da tela — ela
 * vai para a **esquerda ou a direita**, a que estiver mais perto. Não é a borda
 * "mais próxima das quatro" à toa: numa tela alta, soltar no meio ficava perto
 * demais do topo/base e ela subia/descia sem ninguém ter pedido.
 *
 * O que sobra guardar é a posição ao longo da borda escolhida (a altura, se
 * grudou na esquerda/direita; o quanto andou, se grudou no topo/base).
 */
function snapToEdge(x: number, y: number, w: number, h: number): BubblePos {
  const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
  const band = h * TOP_BOTTOM_BAND;
  if (y < band) return { edge: "top", pct: clamp01(x / w) };
  if (y > h - band) return { edge: "bottom", pct: clamp01(x / w) };
  return { edge: x < w / 2 ? "left" : "right", pct: clamp01(y / h) };
}

/**
 * Onde a bolinha fica parada: colada na borda num eixo, livre no outro. O eixo
 * livre passa por um `clamp` para ela não invadir os cantos nem sair da tela
 * quando o cliente gira o celular — como quem calcula é o CSS, isso reajusta
 * sozinho no resize, sem listener.
 */
function edgeStyle({ edge, pct }: BubblePos): React.CSSProperties {
  const near = `${BUBBLE_EDGE_PX}px`;
  const far = `calc(100% - ${BUBBLE_EDGE_PX}px)`;
  const along = `clamp(${near}, ${pct * 100}%, ${far})`;
  switch (edge) {
    case "left":
      return { left: near, top: along };
    case "right":
      return { left: far, top: along };
    case "top":
      return { top: near, left: along };
    case "bottom":
      return { top: far, left: along };
  }
}

/** O mínimo que o player precisa de um produto (o catálogo tem muito mais). */
export type StoryProduct = {
  id: string;
  name: string;
  price: number;
  image: string | null;
  /** Vídeo do cadastro (`products.video_url`); vira story sozinho, ver `buildStoryList`. */
  videoUrl?: string | null;
};

/**
 * Lista final de stories da loja = os criados na mão + (opcional) os produtos
 * novos que já têm vídeo no cadastro.
 *
 * O lojista grava o vídeo ao cadastrar o produto; obrigá-lo a reenviar o mesmo
 * arquivo em /dashboard/stories seria trabalho repetido, então `products` chega
 * aqui **na ordem do catálogo** (mais novos primeiro) e vira story sozinho.
 *
 * Os manuais vêm primeiro (são curadoria do lojista) e um produto que já é
 * story manual não se repete no automático. O total respeita `MAX_STORIES` —
 * uma loja com 50 vídeos não vira um player infinito.
 */
export function buildStoryList(
  stories: StoreStory[],
  autoFromProducts: boolean,
  products: StoryProduct[]
): StoreStory[] {
  if (!autoFromProducts) return stories.slice(0, MAX_STORIES);
  const used = new Set(stories.map((s) => s.productId).filter(Boolean));
  const auto: StoreStory[] = [];
  for (const p of products) {
    if (!p.videoUrl || used.has(p.id)) continue;
    auto.push({ mediaUrl: p.videoUrl, mediaType: "video", productId: p.id });
  }
  return [...stories, ...auto].slice(0, MAX_STORIES);
}

export function StoreStories({
  stories,
  products,
  storeName,
  storeLogo,
  accent,
  onOpenProduct,
}: {
  stories: StoreStory[];
  products: StoryProduct[];
  storeName: string;
  storeLogo: string | null;
  /** Cor da loja (--store-primary): anel da bolinha e botão "Ver produto". */
  accent: string;
  onOpenProduct: (productId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  /**
   * Onde a bolinha ficou: a borda + a posição ao longo dela. O cliente pode
   * mudar A QUALQUER MOMENTO, quantas vezes quiser (todo arrasto vale), mas ela
   * sempre gruda numa das quatro bordas — nunca fica solta no meio da tela, por
   * cima do que ele quer ver. Em % (e não px) para sobreviver a girar o celular
   * e a telas de tamanhos diferentes.
   *
   * Fica no localStorage do CLIENTE (não no `storefront`) — é ele quem tira a
   * bolinha da frente do que quer ver, e a escolha não vale para os outros.
   */
  const [pos, setPos] = useState<BubblePos>({ edge: "left", pct: 0.5 });
  /**
   * O ✕ tira a bolinha da tela — mas SÓ nesta visita: é `useState` puro, de
   * propósito, **sem localStorage**. Recarregou a página, ela volta. Quem
   * dispensa quer só ver a tela agora, não desistir dos stories para sempre; e
   * é a loja anunciando, então o sumiço não deve ser permanente por um toque.
   */
  const [dismissed, setDismissed] = useState(false);
  /** Enquanto arrasta, a bolinha segue o ponteiro (coordenadas cruas). */
  const [dragXY, setDragXY] = useState<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{ x0: number; y0: number; moved: boolean } | null>(null);
  /**
   * `<textPath>` precisa casar com um id único (dá para ter 2 lojas na tela).
   * Sem os `:` do `useId` — dois-pontos vale como id em HTML, mas quebra quem
   * resolve a referência como seletor CSS.
   */
  const pathId = `vw-story-ring-${useId().replace(/:/g, "")}`;

  // Restaura no mount (e não no primeiro render) para não quebrar a hidratação.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(BUBBLE_POS_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as { edge?: unknown; pct?: unknown };
      // Formatos antigos não casam aqui e caem no padrão, de graça.
      if (isEdge(saved.edge) && typeof saved.pct === "number" && saved.pct >= 0 && saved.pct <= 1) {
        setPos({ edge: saved.edge, pct: saved.pct });
      }
    } catch {
      // localStorage bloqueado / JSON velho: fica no padrão.
    }
  }, []);

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    dragRef.current = { x0: e.clientX, y0: e.clientY, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = dragRef.current;
    if (!d) return;
    if (
      !d.moved &&
      Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < DRAG_THRESHOLD_PX
    ) {
      return; // ainda pode ser um toque para abrir
    }
    d.moved = true;
    setDragXY({ x: e.clientX, y: e.clientY });
  };

  const onPointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = dragRef.current;
    dragRef.current = null;
    setDragXY(null);
    if (!d) return;
    if (!d.moved) {
      setOpen(true); // foi um toque, não um arrasto
      return;
    }
    // Gruda na borda mais próxima das quatro (nunca fica solta no meio).
    const next = snapToEdge(
      e.clientX,
      e.clientY,
      window.innerWidth,
      window.innerHeight
    );
    setPos(next);
    try {
      window.localStorage.setItem(BUBBLE_POS_KEY, JSON.stringify(next));
    } catch {
      // Sem localStorage a posição só não sobrevive ao reload.
    }
  };

  if (stories.length === 0 || dismissed) return null;

  const productFor = (s: StoreStory) =>
    s.productId ? products.find((p) => p.id === s.productId) ?? null : null;

  // Capa da bolinha: a foto do produto do 1º story, senão a própria mídia
  // (quando é foto), senão a logo. Vídeo não dá para "printar" sem canvas.
  const first = stories[0]!;
  const cover =
    productFor(first)?.image ||
    (first.mediaType === "image" ? first.mediaUrl : null) ||
    storeLogo;
  // O que gira em volta é um SELO fixo, não o nome do produto: a bolinha abre a
  // fila INTEIRA de stories, então anunciar um produto só mentiria sobre o resto
  // (e o 1º da fila muda sozinho quando entra produto novo com vídeo).
  const ringLabel = stories.length > 1 ? "NOVIDADES" : "NOVIDADE";

  return (
    <>
      {/* Widget = nome girando + bolinha + ✕. O tamanho é FIXO (WIDGET_PX) e o
          posicionamento é dele, não da bolinha: assim nenhuma borda espreme a
          caixa (o "achatado" da direita) e o ✕/nome andam junto com ela. */}
      <div
        className="fixed z-40 select-none"
        style={{
          width: WIDGET_PX,
          height: WIDGET_PX,
          transform: "translate(-50%, -50%)",
          // Arrastando: segue o ponteiro livremente (é o dedo/cursor dele).
          // Largada: colada na borda escolhida, com o `clamp` prendendo o eixo
          // livre dentro da tela — a conta é do CSS, então girar o celular ou
          // redimensionar reajusta sozinho, sem listener de resize.
          ...(dragXY ? { left: dragXY.x, top: dragXY.y } : edgeStyle(pos)),
        }}
      >
        {/* Nome curvado dando a volta na bolinha. Decorativo (o nome real está
            no aria-label do botão), então `aria-hidden` + sem captar toque —
            senão roubaria o clique da bolinha. A `.vw-story-ring` é dele e roda
            mesmo com `prefers-reduced-motion` (ver globals.css) — com o
            `.vw-spin-slow` genérico o anel ficava PARADO nesse modo. */}
        <svg
          viewBox={`0 0 ${WIDGET_PX} ${WIDGET_PX}`}
          className="vw-story-ring pointer-events-none absolute inset-0 h-full w-full"
          aria-hidden
        >
          <defs>
            {/* Círculo começando às 9h e subindo (sweep=1): a 25% do caminho
                cai bem no topo, que é onde o nome fica centrado. */}
            <path
              id={pathId}
              fill="none"
              d={`M ${MID},${MID} m -${RING_R},0 a ${RING_R},${RING_R} 0 1,1 ${RING_R * 2},0 a ${RING_R},${RING_R} 0 1,1 -${RING_R * 2},0`}
            />
          </defs>
          <text
            // Contorno branco por baixo (`paint-order: stroke`) para o nome ser
            // legível sobre QUALQUER fundo de loja — claro, escuro ou foto.
            style={{
              fontSize: RING_FONT_PX,
              fontWeight: 700,
              letterSpacing: 1.2,
              paintOrder: "stroke",
              stroke: "#fff",
              strokeWidth: 2.5,
              strokeLinejoin: "round",
            }}
            fill="#0f172a"
          >
            <textPath href={`#${pathId}`} startOffset="25%" textAnchor="middle">
              {ringLabel}
            </textPath>
          </text>
        </svg>

        <button
          type="button"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => {
            dragRef.current = null;
            setDragXY(null);
          }}
          // NO PC a bolinha não saía do lugar: o navegador de desktop arrasta
          // imagem/seleção nativamente (drag-and-drop do HTML5), o que dispara
          // `pointercancel` e mata o nosso arrasto no primeiro movimento. No
          // celular não existe esse gesto nativo, por isso só lá funcionava.
          onDragStart={(e) => e.preventDefault()}
          aria-label={`Ver stories de ${storeName} (arraste para mover)`}
          title="Arraste para mover"
          className={`absolute left-1/2 top-1/2 rounded-full p-[3px] shadow-lg outline-none focus:outline-none [-webkit-tap-highlight-color:transparent] ${
            dragXY ? "cursor-grabbing" : "cursor-grab transition-transform hover:scale-105"
          }`}
          style={{
            // Tamanho EXPLÍCITO, senão vira elipse: `absolute left-1/2` sem
            // largura cai no shrink-to-fit (sobra metade da caixa de espaço) e
            // o preflight do Tailwind (`img { max-width: 100% }`) deixa a foto
            // encolher junto, enquanto a altura fica presa — era o resto do
            // "achatado", que o tamanho fixo só do widget não resolveu.
            width: BUBBLE_PX,
            height: BUBBLE_PX,
            backgroundImage: `linear-gradient(135deg, ${accent}, #f472b6)`,
            transform: "translate(-50%, -50%)",
            // Sem isso o navegador rola a página em vez de deixar arrastar.
            touchAction: "none",
          }}
        >
          <span className="flex h-full w-full items-center justify-center rounded-full bg-white p-[2px]">
            {cover ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={cover}
                alt=""
                draggable={false}
                width={PHOTO_PX}
                height={PHOTO_PX}
                className="rounded-full object-cover [-webkit-user-drag:none]"
                style={{ width: PHOTO_PX, height: PHOTO_PX, maxWidth: "none" }}
              />
            ) : (
              <span
                className="flex items-center justify-center rounded-full bg-slate-100 text-xl"
                style={{ width: PHOTO_PX, height: PHOTO_PX }}
              >
                🎬
              </span>
            )}
          </span>
        </button>

        {/* ✕ — tira a bolinha só desta visita (volta no F5). Fica às ~10h,
            encostado no anel (como na referência), e não no canto da caixa. */}
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Esconder os stories"
          title="Esconder (volta ao atualizar a página)"
          className="absolute flex items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-md outline-none transition hover:text-slate-900 focus:outline-none [-webkit-tap-highlight-color:transparent]"
          style={{
            width: CLOSE_PX,
            height: CLOSE_PX,
            left: MID + CLOSE_DIST * Math.cos((CLOSE_ANGLE_DEG * Math.PI) / 180),
            top: MID + CLOSE_DIST * Math.sin((CLOSE_ANGLE_DEG * Math.PI) / 180),
            transform: "translate(-50%, -50%)",
          }}
        >
          <svg
            className="h-2.5 w-2.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.6"
            strokeLinecap="round"
            aria-hidden
          >
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>

      {open && (
        <StoryViewer
          stories={stories}
          productFor={productFor}
          storeName={storeName}
          storeLogo={storeLogo}
          accent={accent}
          onOpenProduct={(id) => {
            setOpen(false);
            onOpenProduct(id);
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function StoryViewer({
  stories,
  productFor,
  storeName,
  storeLogo,
  accent,
  onOpenProduct,
  onClose,
}: {
  stories: StoreStory[];
  productFor: (s: StoreStory) => StoryProduct | null;
  storeName: string;
  storeLogo: string | null;
  accent: string;
  onOpenProduct: (productId: string) => void;
  onClose: () => void;
}) {
  const [idx, setIdx] = useState(0);
  /** 0..1 — alimenta a barrinha do topo do story atual. */
  const [progress, setProgress] = useState(0);
  /** Autoplay só é permitido no mudo; o cliente liga o som se quiser. */
  const [muted, setMuted] = useState(true);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const story = stories[idx]!;
  const product = productFor(story);

  const next = useCallback(() => {
    setIdx((i) => {
      if (i >= stories.length - 1) {
        onClose();
        return i;
      }
      return i + 1;
    });
  }, [stories.length, onClose]);

  const prev = useCallback(() => setIdx((i) => Math.max(0, i - 1)), []);

  // Cada story recomeça do zero.
  useEffect(() => setProgress(0), [idx]);

  // Foto: o tempo é nosso (o vídeo se cronometra sozinho no onTimeUpdate).
  useEffect(() => {
    if (story.mediaType !== "image") return;
    const startedAt = Date.now();
    const id = window.setInterval(() => {
      const p = (Date.now() - startedAt) / STORY_IMAGE_MS;
      if (p >= 1) {
        window.clearInterval(id);
        next();
      } else {
        setProgress(p);
      }
    }, 50);
    return () => window.clearInterval(id);
  }, [idx, story.mediaType, next]);

  // Teclado no desktop + trava a rolagem do fundo enquanto o player está aberto.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose, next, prev]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Stories de ${storeName}`}
      onClick={onClose}
    >
      <div
        className="relative flex h-full w-full max-w-[400px] flex-col overflow-hidden bg-black sm:h-auto sm:aspect-[9/16] sm:max-h-[92dvh] sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Mídia — preenche o card por trás de tudo. */}
        {story.mediaType === "video" ? (
          <video
            key={story.mediaUrl}
            ref={videoRef}
            src={story.mediaUrl}
            className="absolute inset-0 h-full w-full object-cover"
            autoPlay
            muted={muted}
            playsInline
            onTimeUpdate={(e) => {
              const v = e.currentTarget;
              if (v.duration > 0) setProgress(v.currentTime / v.duration);
            }}
            onEnded={next}
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={story.mediaUrl}
            src={story.mediaUrl}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
        )}

        {/* Toque para navegar (atrás dos controles e do card do produto). */}
        <div className="absolute inset-0 z-10 flex">
          <button
            type="button"
            onClick={prev}
            aria-label="Story anterior"
            className="h-full w-1/3 outline-none focus:outline-none [-webkit-tap-highlight-color:transparent]"
          />
          <button
            type="button"
            onClick={next}
            aria-label="Próximo story"
            className="h-full flex-1 outline-none focus:outline-none [-webkit-tap-highlight-color:transparent]"
          />
        </div>

        {/* Sombra no topo para os controles brancos lerem sobre qualquer foto. */}
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-28 bg-gradient-to-b from-black/60 to-transparent" />

        {/* Barrinhas de progresso — uma por story. */}
        <div className="absolute inset-x-3 top-3 z-20 flex gap-1">
          {stories.map((_, i) => (
            <span
              key={i}
              className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/30"
            >
              <span
                className="block h-full rounded-full bg-white"
                style={{
                  width: i < idx ? "100%" : i === idx ? `${progress * 100}%` : "0%",
                }}
              />
            </span>
          ))}
        </div>

        {/* Cabeçalho: marca da loja + som + fechar. */}
        <div className="absolute inset-x-3 top-7 z-20 flex items-center gap-2">
          {storeLogo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={storeLogo}
              alt=""
              className="h-8 w-8 rounded-full object-cover ring-2 ring-white/70"
            />
          ) : (
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-xs font-bold text-white ring-2 ring-white/70">
              {storeName.slice(0, 1).toUpperCase()}
            </span>
          )}
          <span className="flex-1 truncate text-sm font-semibold text-white drop-shadow">
            {storeName}
          </span>
          {story.mediaType === "video" && (
            <button
              type="button"
              onClick={() => setMuted((m) => !m)}
              aria-label={muted ? "Ativar som" : "Desativar som"}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-black/40 text-white"
            >
              {muted ? <IconMuted /> : <IconSound />}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-black/40 text-white"
          >
            <svg
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              aria-hidden
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        {/* Card do produto anunciado. */}
        {product && (
          <div className="absolute inset-x-3 bottom-3 z-20 rounded-2xl bg-black/60 p-3 backdrop-blur-sm">
            <div className="flex items-center gap-3">
              {product.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={product.image}
                  alt=""
                  className="h-12 w-12 shrink-0 rounded-lg object-cover"
                />
              ) : (
                <span className="h-12 w-12 shrink-0 rounded-lg bg-white/15" />
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-white">
                  {product.name}
                </span>
                <span className="block text-sm font-bold text-white">
                  {formatBRL(product.price)}
                </span>
              </span>
            </div>
            <button
              type="button"
              onClick={() => onOpenProduct(product.id)}
              className="mt-3 w-full rounded-xl py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
              style={{ backgroundColor: accent }}
            >
              Ver produto
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function IconMuted() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M11 5L6 9H2v6h4l5 4V5z" />
      <path d="M23 9l-6 6M17 9l6 6" />
    </svg>
  );
}

function IconSound() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M11 5L6 9H2v6h4l5 4V5z" />
      <path d="M15.5 8.5a5 5 0 010 7M19 5a9 9 0 010 14" />
    </svg>
  );
}
