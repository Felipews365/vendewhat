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

import { useCallback, useEffect, useRef, useState } from "react";
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
 * Metade da bolinha + folga da borda. A bolinha tem tamanho fixo (h-14 + as duas
 * molduras = ~66px), então dá para calcular sem medir o DOM. Serve de trilho no
 * `clamp` do CSS: o centro nunca chega perto o bastante da borda para a bolinha
 * sair da tela — inclusive quando o cliente gira o celular depois de largá-la.
 */
const BUBBLE_EDGE_PX = 41;

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
   * Onde a bolinha ficou: centro dela em % da tela, nos DOIS eixos — o cliente
   * larga onde quiser (qualquer lado, qualquer altura), sem grudar nas bordas.
   * Guardado em % (e não em px) para a posição sobreviver a girar o celular e a
   * telas de tamanhos diferentes. `null` = ainda não arrastou → canto padrão.
   *
   * Fica no localStorage do CLIENTE (não no `storefront`) — é ele quem tira a
   * bolinha da frente do que quer ver, e a escolha não vale para os outros.
   */
  const [pos, setPos] = useState<{ xPct: number; yPct: number } | null>(null);
  /** Enquanto arrasta, a bolinha segue o ponteiro (coordenadas cruas). */
  const [dragXY, setDragXY] = useState<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{ x0: number; y0: number; moved: boolean } | null>(null);

  // Restaura no mount (e não no primeiro render) para não quebrar a hidratação.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(BUBBLE_POS_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as { xPct?: unknown; yPct?: unknown };
      const inside = (v: unknown): v is number =>
        typeof v === "number" && v >= 0 && v <= 1;
      // Formato antigo (lado + altura) não casa aqui e cai no padrão, de graça.
      if (inside(saved.xPct) && inside(saved.yPct)) {
        setPos({ xPct: saved.xPct, yPct: saved.yPct });
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
    // Fica exatamente onde foi largada (sem grudar em lado nenhum). O `clamp`
    // do CSS é quem segura a bolinha dentro da tela, então aqui é só converter.
    const next = {
      xPct: Math.min(1, Math.max(0, e.clientX / window.innerWidth)),
      yPct: Math.min(1, Math.max(0, e.clientY / window.innerHeight)),
    };
    setPos(next);
    try {
      window.localStorage.setItem(BUBBLE_POS_KEY, JSON.stringify(next));
    } catch {
      // Sem localStorage a posição só não sobrevive ao reload.
    }
  };

  if (stories.length === 0) return null;

  const productFor = (s: StoreStory) =>
    s.productId ? products.find((p) => p.id === s.productId) ?? null : null;

  // Capa da bolinha: a foto do produto do 1º story, senão a própria mídia
  // (quando é foto), senão a logo. Vídeo não dá para "printar" sem canvas.
  const first = stories[0]!;
  const cover =
    productFor(first)?.image ||
    (first.mediaType === "image" ? first.mediaUrl : null) ||
    storeLogo;

  return (
    <>
      <button
        type="button"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          dragRef.current = null;
          setDragXY(null);
        }}
        aria-label={`Ver stories de ${storeName} (arraste para mover)`}
        title="Arraste para mover"
        className={`fixed z-40 rounded-full p-[3px] shadow-lg outline-none focus:outline-none [-webkit-tap-highlight-color:transparent] ${
          dragXY ? "cursor-grabbing" : "cursor-grab transition-transform hover:scale-105"
        }`}
        style={{
          backgroundImage: `linear-gradient(135deg, ${accent}, #f472b6)`,
          transform: "translate(-50%, -50%)",
          // Arrastando: segue o ponteiro. Largada: fica no ponto escolhido, com
          // o `clamp` prendendo o centro dentro da tela (a conta é do CSS, então
          // girar o celular/redimensionar reajusta sozinho, sem listener).
          ...(dragXY
            ? { left: dragXY.x, top: dragXY.y }
            : pos
            ? {
                left: `clamp(${BUBBLE_EDGE_PX}px, ${pos.xPct * 100}%, calc(100% - ${BUBBLE_EDGE_PX}px))`,
                top: `clamp(${BUBBLE_EDGE_PX}px, ${pos.yPct * 100}%, calc(100% - ${BUBBLE_EDGE_PX}px))`,
              }
            : // Padrão de quem nunca arrastou: canto esquerdo, meia altura.
              { left: BUBBLE_EDGE_PX, top: "50%" }),
          // Sem isso o navegador rola a página em vez de deixar arrastar.
          touchAction: "none",
        }}
      >
        <span className="block rounded-full bg-white p-[2px]">
          {cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={cover}
              alt=""
              className="h-14 w-14 rounded-full object-cover"
            />
          ) : (
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-xl">
              🎬
            </span>
          )}
        </span>
      </button>

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
