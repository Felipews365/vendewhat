"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

type BannerState = {
  planHasAi: boolean;
  aiEnabled: boolean;
  connected: boolean;
  paused: boolean;
};

/** Qual aviso (se algum) deve aparecer para o estado atual. */
type AlertKind = "paused" | "disconnected";
type Alert = {
  kind: AlertKind;
  href: string;
  cta: string;
  title: string;
  detail: string;
};

const DISMISS_KEY = "vw-ai-banner-dismissed";

function resolveAlert(s: BannerState | null): Alert | null {
  if (!s) return null;
  // Plano sem IA → nunca avisa (o recurso nem faz parte do plano).
  if (!s.planHasAi) return null;
  // IA desligada → o lojista escolheu não usar; sem nag.
  if (!s.aiEnabled) return null;

  if (s.paused) {
    return {
      kind: "paused",
      href: "/dashboard/whatsapp",
      cta: "Reativar a IA",
      title: "O atendimento por IA está pausado",
      detail: "Seus clientes não estão sendo respondidos automaticamente.",
    };
  }
  if (!s.connected) {
    return {
      kind: "disconnected",
      href: "/dashboard/ia",
      cta: "Conectar agora",
      title: "Seu WhatsApp não está conectado",
      detail: "A IA só atende com o WhatsApp conectado.",
    };
  }
  return null;
}

function WarnIcon() {
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
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
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

/**
 * Faixa de aviso no topo do painel quando a IA está pausada ou o WhatsApp não
 * está conectado. Não aparece no plano "Sem IA" nem quando a IA está desligada.
 */
export function AiStatusBanner() {
  const pathname = usePathname();
  const [state, setState] = useState<BannerState | null>(null);
  const [dismissed, setDismissed] = useState<AlertKind | null>(null);

  // Restaura a escolha de dispensar (por tipo de aviso).
  useEffect(() => {
    try {
      const v = localStorage.getItem(DISMISS_KEY);
      if (v === "paused" || v === "disconnected") setDismissed(v);
    } catch {
      /* localStorage indisponível */
    }
  }, []);

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const res = await fetch("/api/whatsapp/banner", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { ok?: boolean } & Partial<BannerState>;
        if (!alive || !data.ok) return;
        setState({
          planHasAi: Boolean(data.planHasAi),
          aiEnabled: Boolean(data.aiEnabled),
          connected: Boolean(data.connected),
          paused: Boolean(data.paused),
        });
      } catch {
        /* silencioso — aviso é secundário */
      }
    }
    load();
    return () => {
      alive = false;
    };
    // Recarrega ao trocar de rota (ex.: acabou de conectar/reativar).
  }, [pathname]);

  const alert = resolveAlert(state);

  // Problema resolvido (ou virou outro tipo) → esquece a dispensa, para que uma
  // nova ocorrência volte a avisar.
  useEffect(() => {
    if (dismissed && (!alert || alert.kind !== dismissed)) {
      setDismissed(null);
      try {
        localStorage.removeItem(DISMISS_KEY);
      } catch {
        /* localStorage indisponível */
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alert?.kind, dismissed]);

  if (!alert) return null;
  // Dispensado para este mesmo tipo de aviso → não mostra (volta se o tipo mudar).
  if (dismissed === alert.kind) return null;

  function handleDismiss(kind: AlertKind) {
    setDismissed(kind);
    try {
      localStorage.setItem(DISMISS_KEY, kind);
    } catch {
      /* localStorage indisponível */
    }
  }

  return (
    <div className="px-4 pt-3 sm:px-6">
      <div className="vw-fade-in-up flex flex-col gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-amber-900 shadow-sm sm:flex-row sm:items-center sm:justify-between dark:border-amber-500/40 dark:bg-amber-950/40 dark:text-amber-200">
        <div className="flex items-start gap-2.5">
          <span className="mt-0.5 text-amber-600 dark:text-amber-400">
            <WarnIcon />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold">{alert.title}</p>
            <p className="text-xs text-amber-800/90 dark:text-amber-200/80">
              {alert.detail}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 self-start sm:self-auto">
          <Link
            href={alert.href}
            className="rounded-lg bg-amber-600 px-3.5 py-2 text-center text-sm font-semibold text-white shadow-sm transition-colors hover:bg-amber-700 dark:bg-amber-500 dark:hover:bg-amber-400 dark:text-amber-950"
          >
            {alert.cta}
          </Link>
          <button
            type="button"
            onClick={() => handleDismiss(alert.kind)}
            aria-label="Dispensar aviso"
            title="Dispensar aviso"
            className="grid h-9 w-9 place-items-center rounded-lg text-amber-700/80 transition-colors hover:bg-amber-200/60 hover:text-amber-900 dark:text-amber-300/80 dark:hover:bg-amber-900/40 dark:hover:text-amber-100"
          >
            <CloseIcon />
          </button>
        </div>
      </div>
    </div>
  );
}
