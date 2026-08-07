"use client";

import { useMemo } from "react";
import { CRM_STAGES, stageById } from "@/lib/crm/stages";

/**
 * Gráficos do CRM em SVG/CSS puro — sem biblioteca de charts.
 *
 * Três leituras que respondem perguntas diferentes:
 *  • Receita por mês — o dinheiro que entrou (barras, de `orders`).
 *  • Novos clientes por mês — o tamanho da base crescendo (linha, suave o
 *    bastante para ler tendência mesmo com números pequenos).
 *  • Funil — onde as pessoas estão paradas agora (barras horizontais).
 *
 * Todos são theme-aware e usam `currentColor`/tokens do projeto, então herdam
 * a cor da marca sem configuração.
 */

export type TimelinePoint = { mes: string; novos: number; receita: number };
export type FunnelSlice = { stage: string; total: number; valor: number };

function formatBRL(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** "R$ 12,4 mil" — rótulo de eixo não pode ser longo. */
function shortBRL(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}M`;
  if (v >= 1000) return `${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}k`;
  return String(Math.round(v));
}

/** "ago" — o mês vem como 'YYYY-MM-DD' da função do banco. */
function monthLabel(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  if (!Number.isFinite(d.getTime())) return "";
  return d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "");
}

function ChartCard({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          {title}
        </h3>
        {hint && (
          <span className="shrink-0 text-xs text-slate-400 dark:text-slate-500">
            {hint}
          </span>
        )}
      </div>
      <div className="mt-3">{children}</div>
    </div>
  );
}

/** Barras verticais (receita). Divs, não SVG: acompanham a largura sozinhas. */
function RevenueBars({ data }: { data: TimelinePoint[] }) {
  const max = Math.max(...data.map((d) => d.receita), 1);

  return (
    <div
      role="img"
      aria-label={
        "Receita por mês: " +
        data.map((d) => `${monthLabel(d.mes)} ${formatBRL(d.receita)}`).join(", ")
      }
    >
      {/* A coluna precisa de `h-full` (altura DEFINIDA vinda do h-28): a altura
          em % da barra não resolve contra um pai que só tem `flex-1`. */}
      <div className="flex h-28 items-end gap-1.5">
        {data.map((d) => {
          const pct = (d.receita / max) * 100;
          return (
            <div
              key={d.mes}
              className="group relative flex h-full min-w-0 flex-1 items-end"
              title={`${monthLabel(d.mes)}: ${formatBRL(d.receita)}`}
            >
              {/* Fora do fluxo, senão o rótulo rouba altura da barra. */}
              {d.receita > 0 && (
                <span className="pointer-events-none absolute inset-x-0 -top-0.5 truncate text-center text-[10px] font-semibold text-slate-400 opacity-0 transition-opacity group-hover:opacity-100 dark:text-slate-500">
                  {shortBRL(d.receita)}
                </span>
              )}
              <div
                className="w-full rounded-t-md bg-landing-primary transition-all"
                // Piso para o mês com pouca venda continuar visível; mês zerado
                // vira um traço fino, que é honesto (não é "sem barra").
                style={{ height: d.receita > 0 ? `${Math.max(pct, 8)}%` : "3px" }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-1.5 flex gap-1.5">
        {data.map((d) => (
          <span
            key={d.mes}
            className="min-w-0 flex-1 text-center text-[10px] font-medium uppercase text-slate-400 dark:text-slate-500"
          >
            {monthLabel(d.mes)}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Linha (novos clientes). SVG com viewBox: escala sozinho. */
function NewCustomersLine({ data }: { data: TimelinePoint[] }) {
  const { path, area, dots } = useMemo(() => {
    const W = 100;
    const H = 40;
    const max = Math.max(...data.map((d) => d.novos), 1);
    const step = data.length > 1 ? W / (data.length - 1) : 0;

    const pts = data.map((d, i) => {
      const x = data.length > 1 ? i * step : W / 2;
      // 2px de folga em cima e embaixo para o traço não encostar na borda.
      const y = H - 2 - (d.novos / max) * (H - 4);
      return { x, y, d };
    });

    const line = pts
      .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)},${p.y.toFixed(2)}`)
      .join(" ");

    return {
      path: line,
      area: `${line} L${W},${H} L0,${H} Z`,
      dots: pts,
    };
  }, [data]);

  const total = data.reduce((s, d) => s + d.novos, 0);

  return (
    <div
      role="img"
      aria-label={
        "Novos clientes por mês: " +
        data.map((d) => `${monthLabel(d.mes)} ${d.novos}`).join(", ")
      }
    >
      <svg
        viewBox="0 0 100 40"
        preserveAspectRatio="none"
        className="h-28 w-full text-landing-primary"
        aria-hidden
      >
        <path d={area} fill="currentColor" opacity="0.12" />
        <path
          d={path}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        {dots.map((p) => (
          <circle
            key={p.d.mes}
            cx={p.x}
            cy={p.y}
            r="1.6"
            fill="currentColor"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
      <div className="mt-1.5 flex gap-1.5">
        {data.map((d) => (
          <span
            key={d.mes}
            className="min-w-0 flex-1 text-center text-[10px] font-medium uppercase text-slate-400 dark:text-slate-500"
          >
            {monthLabel(d.mes)}
          </span>
        ))}
      </div>
      <p className="mt-1 text-center text-[11px] text-slate-500 dark:text-slate-400">
        {total} {total === 1 ? "cliente novo" : "clientes novos"} no período
      </p>
    </div>
  );
}

/** Funil: barras horizontais na ordem das etapas, cada uma na cor da etapa. */
function FunnelBars({ data }: { data: FunnelSlice[] }) {
  const byStage = useMemo(() => {
    const map: Record<string, FunnelSlice> = {};
    for (const s of data) map[s.stage] = s;
    return map;
  }, [data]);

  const max = Math.max(...CRM_STAGES.map((s) => byStage[s.id]?.total ?? 0), 1);

  return (
    <div className="space-y-2">
      {CRM_STAGES.map((s) => {
        const slice = byStage[s.id];
        const n = slice?.total ?? 0;
        const pct = (n / max) * 100;
        return (
          <div key={s.id} className="flex items-center gap-2">
            <span className="w-28 shrink-0 truncate text-[11px] font-medium text-slate-600 dark:text-slate-300">
              {s.label}
            </span>
            <span className="h-4 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <span
                className={"block h-full rounded-full transition-all " + stageById(s.id).bar}
                style={{ width: `${n > 0 ? Math.max(pct, 4) : 0}%` }}
              />
            </span>
            <span className="w-7 shrink-0 text-right text-xs font-bold tabular-nums text-slate-900 dark:text-slate-100">
              {n}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default function CrmCharts({
  timeline,
  funnel,
}: {
  timeline: TimelinePoint[];
  funnel: FunnelSlice[];
}) {
  const receitaTotal = timeline.reduce((s, d) => s + d.receita, 0);

  // Sem série nenhuma (migration da fase 2 pendente) não há o que desenhar.
  if (timeline.length === 0 && funnel.length === 0) return null;

  return (
    <div className="mt-3 grid gap-2 lg:grid-cols-3">
      {timeline.length > 0 && (
        <>
          <ChartCard title="Receita por mês" hint={shortBRL(receitaTotal) !== "0" ? formatBRL(receitaTotal) : undefined}>
            <RevenueBars data={timeline} />
          </ChartCard>
          <ChartCard title="Novos clientes">
            <NewCustomersLine data={timeline} />
          </ChartCard>
        </>
      )}
      {funnel.length > 0 && (
        <ChartCard title="Funil de vendas" hint="agora">
          <FunnelBars data={funnel} />
        </ChartCard>
      )}
    </div>
  );
}
