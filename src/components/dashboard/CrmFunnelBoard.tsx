"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/components/Toast";
import { formatBrPhone } from "@/lib/customerPhone";
import { CRM_STAGES, type StageId } from "@/lib/crm/stages";
import { avatarText, splitTag } from "@/lib/crm/tags";
import CrmCustomerSheet, { type CrmCustomerDto } from "@/components/dashboard/CrmCustomerSheet";

/** Mouse arrasta já no 1º movimento; no toque é preciso SEGURAR. */
const DRAG_THRESHOLD_PX = 6;
const LONG_PRESS_MS = 300;
/** Movimento antes do "segurar" = o lojista quer rolar, não arrastar. */
const TOUCH_SCROLL_PX = 10;

function formatBRL(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Há quantos dias o cliente está parado nesta etapa. */
function stuckDays(iso: string | null): number {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.floor((Date.now() - t) / 86_400_000));
}

type Board = Record<StageId, CrmCustomerDto[]>;

function emptyBoard(): Board {
  return CRM_STAGES.reduce((acc, s) => {
    acc[s.id] = [];
    return acc;
  }, {} as Board);
}

export default function CrmFunnelBoard() {
  const { showToast } = useToast();

  const [board, setBoard] = useState<Board>(emptyBoard);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);

  /** Só para pintar a prévia; a posição corrente vive no `dragRef`. */
  const [drag, setDrag] = useState<{ id: string; over: StageId | null } | null>(null);
  const dragRef = useRef<{
    id: string;
    from: StageId;
    over: StageId | null;
    startX: number;
    startY: number;
    active: boolean;
    isTouch: boolean;
    timer: number | null;
  } | null>(null);
  /** Espelho do "arrastando" para o bloqueio de rolagem (listener nativo). */
  const dragActiveRef = useRef(false);
  /** Um arrasto acabou de terminar: o clique seguinte não abre a ficha. */
  const justDraggedRef = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const results = await Promise.all(
        CRM_STAGES.map(async (s) => {
          const res = await fetch(
            `/api/crm/customers?segment=todos&sort=recentes&stage=${s.id}`
          );
          const j = (await res.json().catch(() => ({}))) as {
            ok?: boolean;
            customers?: CrmCustomerDto[];
          };
          return [s.id, j.ok ? (j.customers ?? []) : []] as const;
        })
      );
      const next = emptyBoard();
      for (const [id, list] of results) next[id] = list;
      setBoard(next);
    } catch {
      showToast("Não foi possível carregar o funil.", "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    load();
  }, [load]);

  /**
   * `touch-action: none` no CSS travaria a rolagem já no toque simples, então o
   * scroll é barrado só ENQUANTO o arrasto está ativo, por um `touchmove` não
   * passivo (é a única forma de dar `preventDefault` no gesto em andamento).
   */
  useEffect(() => {
    const block = (e: TouchEvent) => {
      if (dragActiveRef.current) e.preventDefault();
    };
    document.addEventListener("touchmove", block, { passive: false });
    return () => document.removeEventListener("touchmove", block);
  }, []);

  /** Etapa sob o dedo/ponteiro (as colunas rolam na horizontal no celular). */
  function stageFromPoint(x: number, y: number): StageId | null {
    const el = document.elementFromPoint(x, y);
    const slot = el?.closest<HTMLElement>("[data-crm-slot]");
    const id = slot?.dataset.crmSlot;
    return id && CRM_STAGES.some((s) => s.id === id) ? (id as StageId) : null;
  }

  function clearTimer() {
    const t = dragRef.current?.timer;
    if (t !== null && t !== undefined) window.clearTimeout(t);
  }

  /** Move de etapa no estado e persiste; desfaz se o servidor recusar. */
  const moveTo = useCallback(
    async (id: string, from: StageId, to: StageId) => {
      if (from === to) return;

      const snapshot = board;
      setBoard((prev) => {
        const card = prev[from].find((c) => c.id === id);
        if (!card) return prev;
        return {
          ...prev,
          [from]: prev[from].filter((c) => c.id !== id),
          [to]: [{ ...card, stage: to }, ...prev[to]],
        };
      });

      try {
        const res = await fetch("/api/crm/customers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, stage: to }),
        });
        const j = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
        };
        if (!res.ok || !j.ok) {
          setBoard(snapshot);
          showToast(j.error ?? "Não foi possível mover o cliente.", "error");
        }
      } catch {
        setBoard(snapshot);
        showToast("Não foi possível mover o cliente.", "error");
      }
    },
    [board, showToast]
  );

  function startDrag(e: React.PointerEvent, id: string, from: StageId) {
    if (e.button !== 0) return;
    const isTouch = e.pointerType !== "mouse";
    e.currentTarget.setPointerCapture(e.pointerId);
    // No mouse, impede o drag nativo; no toque NÃO se cancela nada aqui, senão
    // a rolagem da página morreria junto.
    if (!isTouch) e.preventDefault();

    const d = {
      id,
      from,
      over: from as StageId | null,
      startX: e.clientX,
      startY: e.clientY,
      active: false,
      isTouch,
      timer: null as number | null,
    };
    dragRef.current = d;

    if (isTouch) {
      d.timer = window.setTimeout(() => {
        if (dragRef.current !== d) return;
        d.active = true;
        dragActiveRef.current = true;
        navigator.vibrate?.(10);
        setDrag({ id: d.id, over: d.over });
      }, LONG_PRESS_MS);
    }
  }

  function moveDrag(e: React.PointerEvent) {
    const d = dragRef.current;
    if (!d) return;
    const moved =
      Math.abs(e.clientX - d.startX) + Math.abs(e.clientY - d.startY);

    if (!d.active) {
      // Toque: mexeu antes de segurar → é rolagem, desiste do arrasto.
      if (d.isTouch) {
        if (moved > TOUCH_SCROLL_PX) cancelDrag();
        return;
      }
      if (moved < DRAG_THRESHOLD_PX) return;
      d.active = true;
      dragActiveRef.current = true;
    }
    d.over = stageFromPoint(e.clientX, e.clientY);
    setDrag({ id: d.id, over: d.over });
  }

  function endDrag() {
    const d = dragRef.current;
    clearTimer();
    dragRef.current = null;
    dragActiveRef.current = false;
    setDrag(null);
    if (!d?.active) return;

    // Segura o clique que o navegador dispara no fim do gesto (senão soltar o
    // card abriria a ficha). O timer é a rede para quando nenhum clique vem —
    // o caso do toque.
    justDraggedRef.current = true;
    window.setTimeout(() => {
      justDraggedRef.current = false;
    }, 400);

    if (d.over) moveTo(d.id, d.from, d.over);
  }

  function cancelDrag() {
    clearTimer();
    dragRef.current = null;
    dragActiveRef.current = false;
    setDrag(null);
  }

  /** Caminho acessível: com o card em foco, ←/→ movem de etapa. */
  function onCardKeyDown(e: React.KeyboardEvent, id: string, from: StageId) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    const i = CRM_STAGES.findIndex((s) => s.id === from);
    const next = CRM_STAGES[i + (e.key === "ArrowRight" ? 1 : -1)];
    if (!next) return;
    e.preventDefault();
    moveTo(id, from, next.id);
  }

  if (loading) {
    return (
      <div className="py-16 text-center text-slate-500 dark:text-slate-400">
        Carregando…
      </div>
    );
  }

  return (
    <>
      {/* No celular as colunas viram um carrossel com encaixe (não há como
          mostrar 6 colunas em 360px). No desktop elas DIVIDEM a largura
          (`lg:flex-1`), então cabem todas e não sobra barra de rolagem lateral. */}
      <div className="-mx-4 overflow-x-auto px-4 pb-4 lg:mx-0 lg:overflow-x-visible lg:px-0">
        <div className="flex snap-x snap-mandatory gap-2 lg:snap-none lg:gap-2.5">
          {CRM_STAGES.map((stage) => {
            const cards = board[stage.id];
            const isTarget = drag?.over === stage.id;
            const totalValue = cards.reduce((s, c) => s + c.totalSpent, 0);

            return (
              <section
                key={stage.id}
                data-crm-slot={stage.id}
                className={
                  "w-[78vw] shrink-0 snap-start overflow-hidden rounded-2xl border sm:w-60 lg:w-auto lg:min-w-0 lg:flex-1 lg:shrink " +
                  stage.tint +
                  " " +
                  (isTarget
                    ? "border-landing-primary ring-2 ring-landing-primary/30"
                    : "border-slate-200 dark:border-slate-800")
                }
              >
                {/* Faixa na cor da etapa: dá a leitura do quadro de relance. */}
                <div className={"h-1 w-full " + stage.bar} />

                <header className="px-3 pb-2 pt-2.5">
                  <div className="flex items-center gap-2">
                    <h2 className="min-w-0 flex-1 truncate text-sm font-bold text-slate-900 dark:text-slate-100">
                      {stage.label}
                    </h2>
                    <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-xs font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      {cards.length}
                    </span>
                  </div>
                  {totalValue > 0 && (
                    <p className="mt-0.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                      {formatBRL(totalValue)}
                    </p>
                  )}
                </header>

                <div className="space-y-2 px-2 pb-2">
                  {cards.length === 0 && (
                    <p className="rounded-xl border border-dashed border-slate-300 p-3 text-center text-[11px] leading-snug text-slate-500 dark:border-slate-700 dark:text-slate-400">
                      {stage.empty}
                    </p>
                  )}

                  {cards.map((c) => {
                    const dragging = drag?.id === c.id;
                    const parado = stuckDays(c.stageChangedAt);
                    return (
                      <article
                        key={c.id}
                        tabIndex={0}
                        role="button"
                        aria-label={`${c.name || formatBrPhone(c.phoneKey)} — ${stage.label}. Use as setas para mover de etapa.`}
                        onPointerDown={(e) => startDrag(e, c.id, stage.id)}
                        onPointerMove={moveDrag}
                        onPointerUp={endDrag}
                        onPointerCancel={cancelDrag}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setOpenId(c.id);
                            return;
                          }
                          onCardKeyDown(e, c.id, stage.id);
                        }}
                        onClick={() => {
                          if (justDraggedRef.current) return;
                          setOpenId(c.id);
                        }}
                        className={
                          // Barra lateral na cor da etapa: o quadro fica
                          // colorido sem pintar o fundo, que arruinaria a
                          // leitura do nome e do valor nos dois temas.
                          "cursor-grab select-none rounded-xl border border-l-4 border-slate-200 bg-white p-2.5 shadow-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-landing-primary/50 dark:border-slate-700 dark:bg-slate-900 " +
                          stage.edge +
                          " " +
                          (dragging
                            ? "opacity-40"
                            : "hover:-translate-y-0.5 hover:shadow-md")
                        }
                      >
                        <div className="flex items-center gap-2">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-[11px] font-semibold text-emerald-700 dark:bg-slate-700 dark:text-emerald-300">
                            {avatarText(c.name, c.phoneKey)}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                              {c.name || formatBrPhone(c.phoneKey)}
                            </span>
                            {/* Sem nome, o título já É o telefone: a segunda
                                linha só aparece quando tem algo NOVO a dizer. */}
                            {c.ordersCount > 0 ? (
                              <span className="block truncate text-[11px] text-slate-500 dark:text-slate-400">
                                {formatBRL(c.totalSpent)} · {c.ordersCount} pedido
                                {c.ordersCount === 1 ? "" : "s"}
                              </span>
                            ) : c.name ? (
                              <span className="block truncate text-[11px] text-slate-500 dark:text-slate-400">
                                {formatBrPhone(c.phoneKey)}
                              </span>
                            ) : null}
                          </span>
                        </div>

                        {c.tags.length > 0 && (
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {c.tags.slice(0, 3).map((raw) => {
                              const { name, color } = splitTag(raw);
                              return (
                                <span
                                  key={raw}
                                  className={
                                    "rounded-full px-1.5 py-0.5 text-[10px] font-semibold " +
                                    color.chip
                                  }
                                >
                                  {name}
                                </span>
                              );
                            })}
                          </div>
                        )}

                        {/* Só avisa quando já está parado o bastante para incomodar. */}
                        {parado >= 3 && stage.id !== "ganho" && stage.id !== "perdido" && (
                          <p className="mt-1.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                            parado há {parado} dias
                          </p>
                        )}
                      </article>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </div>

      {openId && (
        <CrmCustomerSheet
          customerId={openId}
          onClose={() => setOpenId(null)}
          onChanged={load}
        />
      )}
    </>
  );
}
