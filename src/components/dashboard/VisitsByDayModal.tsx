"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const DAYS_WINDOW = 30;

interface DayRow {
  key: string;
  label: string;
  count: number;
}

function dayKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

function dayLabel(d: Date, today: Date) {
  const diff = Math.round(
    (new Date(dayKey(today)).getTime() - new Date(dayKey(d)).getTime()) / 86_400_000
  );
  if (diff === 0) return "Hoje";
  if (diff === 1) return "Ontem";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

export function VisitsByDayModal({
  open,
  storeId,
  onClose,
}: {
  open: boolean;
  storeId: string | null;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState<DayRow[]>([]);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    if (!storeId) return;
    setLoading(true);
    setFailed(false);

    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - (DAYS_WINDOW - 1));

    const { data, error } = await createClient()
      .from("store_visits")
      .select("created_at")
      .eq("store_id", storeId)
      .gte("created_at", start.toISOString());

    if (error) {
      setFailed(true);
      setLoading(false);
      return;
    }

    const counts = new Map<string, number>();
    for (const row of (data ?? []) as { created_at: string }[]) {
      const k = dayKey(new Date(row.created_at));
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }

    // Todos os dias da janela, inclusive os sem visita (o buraco também informa).
    const today = new Date();
    const rows: DayRow[] = [];
    for (let i = 0; i < DAYS_WINDOW; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const k = dayKey(d);
      rows.push({ key: k, label: dayLabel(d, today), count: counts.get(k) ?? 0 });
    }

    setDays(rows);
    setLoading(false);
  }, [storeId]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const total = days.reduce((s, d) => s + d.count, 0);
  const max = days.reduce((m, d) => Math.max(m, d.count), 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="vw-pop-in w-full sm:max-w-lg max-h-[85vh] flex flex-col rounded-t-2xl sm:rounded-2xl bg-white dark:bg-slate-900 dark:ring-1 dark:ring-slate-800 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 p-5 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h2 className="font-semibold text-slate-800 dark:text-slate-100">
              👁️ Visitas por dia
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              Últimos {DAYS_WINDOW} dias — {total} visita{total === 1 ? "" : "s"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="rounded-lg px-2 py-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:text-slate-200 dark:hover:bg-slate-800"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="flex justify-center py-10">
              <div className="animate-spin w-7 h-7 border-4 border-landing-primary border-t-transparent rounded-full" />
            </div>
          ) : failed ? (
            <p className="text-sm text-slate-500 dark:text-slate-400 py-6 text-center">
              Não foi possível carregar as visitas agora. Tente de novo em instantes.
            </p>
          ) : total === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400 py-6 text-center">
              Ainda não há visitas nesse período. Compartilhe o link da sua loja para
              começar a receber acessos.
            </p>
          ) : (
            <ul className="space-y-2">
              {days.map((d) => (
                <li key={d.key} className="flex items-center gap-3">
                  <span className="w-16 shrink-0 text-xs text-slate-500 dark:text-slate-400">
                    {d.label}
                  </span>
                  <div className="flex-1 h-2.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-landing-primary dark:bg-violet-500"
                      style={{ width: max > 0 ? `${(d.count / max) * 100}%` : "0%" }}
                    />
                  </div>
                  <span className="w-10 shrink-0 text-right text-sm font-semibold text-slate-800 dark:text-slate-100 tabular-nums">
                    {d.count}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
