"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { playSaleAlertSound } from "@/lib/saleSounds";

/**
 * Vigia de vendas do painel: consulta o último pedido por polling e, quando entra
 * uma venda nova (pela IA ou pelo site), toca um bipe e mostra um alerta flutuante
 * com o número do pedido, o cliente e o valor. Montado no layout do dashboard, então
 * o aviso aparece em qualquer tela. O bipe respeita o interruptor "som" (localStorage
 * `vw-sale-sound`, ligado por padrão) editado na página de Pedidos.
 *
 * O "já vi até aqui" fica em localStorage (`vw-last-seen-order`) por dispositivo: na
 * primeira carga a referência é o pedido atual (não avisa retroativamente); a partir
 * daí, todo `order_number` maior dispara o alerta.
 */

const SEEN_KEY = "vw-last-seen-order";
const POLL_MS = 25_000;

type LatestResponse = {
  ok?: boolean;
  latestOrderNumber?: number;
  customerName?: string;
  subtotal?: number;
};

type SaleAlert = {
  orderNumber: number;
  customerName: string;
  subtotal: number;
};

function formatBRL(n: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(n);
}

function readSeen(): number | null {
  try {
    const v = localStorage.getItem(SEEN_KEY);
    if (v == null) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

function writeSeen(n: number) {
  try {
    localStorage.setItem(SEEN_KEY, String(n));
  } catch {
    /* localStorage indisponível */
  }
}

function BellIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5 shrink-0"
      aria-hidden
    >
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
      aria-hidden
    >
      <path d="M18 6 6 18" />
      <path d="M6 6l12 12" />
    </svg>
  );
}

export function SaleAlertWatcher() {
  const [alert, setAlert] = useState<SaleAlert | null>(null);
  // Guarda o maior número já visto nesta sessão (evita re-alertar entre polls).
  const seenRef = useRef<number | null>(null);
  const initializedRef = useRef(false);

  const check = useCallback(async () => {
    try {
      const res = await fetch("/api/orders/latest", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as LatestResponse;
      if (!data.ok) return;
      const latest = typeof data.latestOrderNumber === "number" ? data.latestOrderNumber : 0;

      if (seenRef.current == null) {
        // Primeira leitura: referência = maior entre o que já vimos no dispositivo
        // e o pedido atual. Não avisa retroativamente.
        const stored = readSeen();
        const base = Math.max(stored ?? 0, latest);
        seenRef.current = base;
        writeSeen(base);
        initializedRef.current = true;
        return;
      }

      if (latest > seenRef.current) {
        seenRef.current = latest;
        writeSeen(latest);
        setAlert({
          orderNumber: latest,
          customerName:
            typeof data.customerName === "string" ? data.customerName : "",
          subtotal: typeof data.subtotal === "number" ? data.subtotal : 0,
        });
        playSaleAlertSound();
      }
    } catch {
      /* silencioso — o alerta é secundário */
    }
  }, []);

  useEffect(() => {
    check();
    const id = window.setInterval(check, POLL_MS);
    // Confere também ao voltar o foco para a aba (sensação de tempo real).
    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [check]);

  if (!alert) return null;

  return (
    <div className="fixed inset-x-0 top-3 z-[60] flex justify-center px-4 sm:left-auto sm:right-4 sm:justify-end">
      <div className="vw-pop-in flex w-full max-w-md items-start gap-3 rounded-2xl border border-emerald-300 bg-emerald-50 px-4 py-3 shadow-xl shadow-emerald-900/10 dark:border-emerald-500/40 dark:bg-emerald-950/60">
        <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-emerald-600 text-white dark:bg-emerald-500">
          <BellIcon />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-emerald-900 dark:text-emerald-100">
            Nova venda! Pedido #{alert.orderNumber}
          </p>
          <p className="truncate text-xs text-emerald-800/90 dark:text-emerald-200/80">
            {alert.customerName ? `${alert.customerName} · ` : ""}
            {formatBRL(alert.subtotal)}
          </p>
          <Link
            href="/dashboard/pedidos"
            onClick={() => setAlert(null)}
            className="mt-2 inline-block rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-400 dark:text-emerald-950"
          >
            Ver pedido
          </Link>
        </div>
        <button
          type="button"
          onClick={() => setAlert(null)}
          aria-label="Fechar aviso"
          title="Fechar aviso"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-emerald-700/80 transition-colors hover:bg-emerald-200/60 hover:text-emerald-900 dark:text-emerald-300/80 dark:hover:bg-emerald-900/50 dark:hover:text-emerald-100"
        >
          <CloseIcon />
        </button>
      </div>
    </div>
  );
}
