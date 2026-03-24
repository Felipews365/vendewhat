"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  PLAN_CATALOG,
  formatBRL,
  monthlyEquivalentAnnual,
  type PlanDefinition,
} from "@/lib/plans";

function PlanIcon({ kind, className }: { kind: PlanDefinition["icon"]; className: string }) {
  if (kind === "bolt") {
    return (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    );
  }
  if (kind === "star") {
    return (
      <svg className={className} fill="currentColor" viewBox="0 0 24 24" aria-hidden>
        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
      </svg>
    );
  }
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  );
}

const accentStyles: Record<
  PlanDefinition["accent"],
  { border: string; title: string; iconWrap: string; btn: string; badge?: string }
> = {
  pink: {
    border: "border-pink-200 shadow-pink-100/50",
    title: "text-pink-600",
    iconWrap: "bg-pink-50 text-pink-500",
    btn: "bg-pink-500 hover:bg-pink-600 text-white",
  },
  cyan: {
    border: "border-cyan-400 ring-2 ring-cyan-300/60 shadow-cyan-100/80",
    title: "text-cyan-600",
    iconWrap: "bg-cyan-50 text-cyan-600",
    btn: "bg-cyan-500 hover:bg-cyan-600 text-white",
  },
  purple: {
    border: "border-purple-200 shadow-purple-100/50",
    title: "text-purple-700",
    iconWrap: "bg-purple-50 text-purple-600",
    btn: "bg-purple-700 hover:bg-purple-800 text-white",
  },
};

function uniqueFeaturesOrdered(plans: PlanDefinition[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of plans) {
    for (const f of p.features) {
      if (!seen.has(f)) {
        seen.add(f);
        out.push(f);
      }
    }
  }
  return out;
}

export default function DashboardPlanosPage() {
  const [annual, setAnnual] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);

  const matrixRows = useMemo(() => uniqueFeaturesOrdered(PLAN_CATALOG), []);

  return (
    <main className="max-w-6xl mx-auto px-4 py-8 pb-16">
      <nav className="text-xs text-slate-500 mb-1" aria-label="Navegação secundária">
        <Link href="/dashboard/conta" className="hover:text-landing-primary">
          Conta
        </Link>
        <span className="mx-1.5 text-slate-300">›</span>
        <span className="text-slate-700 font-medium">Assinatura</span>
      </nav>

      <Link
        href="/dashboard/conta"
        className="inline-flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-landing-primary mb-6"
      >
        <span aria-hidden>‹</span> Conta
      </Link>

      <h1 className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight">
        Planos
      </h1>
      <p className="mt-2 text-slate-600 text-sm max-w-2xl">
        Escolha o plano ideal. Todos incluem período para testar — confira na página inicial.
      </p>

      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <span
          className={`text-sm font-semibold ${!annual ? "text-slate-900" : "text-slate-400"}`}
        >
          Mensal
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={annual}
          aria-label={annual ? "Cobrança anual" : "Cobrança mensal"}
          onClick={() => setAnnual((a) => !a)}
          className={`relative h-9 w-[52px] shrink-0 rounded-full transition-colors ${
            annual ? "bg-cyan-500" : "bg-slate-200"
          }`}
        >
          <span
            className={`absolute top-1 left-1 h-7 w-7 rounded-full bg-white shadow transition-transform ${
              annual ? "translate-x-[22px]" : "translate-x-0"
            }`}
          />
        </button>
        <span
          className={`text-sm font-semibold ${annual ? "text-slate-900" : "text-slate-400"}`}
        >
          Anual
        </span>
        <span className="rounded-full bg-pink-100 px-2.5 py-0.5 text-xs font-bold text-pink-700">
          16% OFF
        </span>
      </div>

      <div className="mt-10 grid gap-6 md:grid-cols-3 items-stretch">
        {PLAN_CATALOG.map((plan) => {
          const st = accentStyles[plan.accent];
          const price = annual ? monthlyEquivalentAnnual(plan.monthly) : plan.monthly;
          return (
            <div
              key={plan.id}
              className={`relative flex flex-col rounded-2xl border bg-white p-6 shadow-md ${st.border}`}
            >
              {plan.highlight && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-cyan-500 px-4 py-1 text-xs font-bold uppercase tracking-wide text-white shadow">
                  Mais escolhido
                </div>
              )}
              <div
                className={`mb-4 flex h-12 w-12 items-center justify-center rounded-xl ${st.iconWrap}`}
              >
                <PlanIcon kind={plan.icon} className="h-6 w-6" />
              </div>
              <h2 className={`text-xl font-bold ${st.title}`}>{plan.title}</h2>
              <p className="mt-2 min-h-[4.5rem] text-sm leading-relaxed text-slate-600">
                {plan.description}
              </p>
              <div className="mt-4 mb-6">
                <span className="text-3xl font-bold text-slate-900">
                  R$ {formatBRL(price)}
                </span>
                <span className="text-slate-500 text-sm">/mês</span>
                {annual && (
                  <p className="mt-1 text-xs text-slate-500">
                    equivalente no plano anual (16% off)
                  </p>
                )}
              </div>
              <ul className="mb-8 flex-1 space-y-3">
                {plan.features.map((f) => (
                  <li key={f} className="flex gap-2 text-sm text-slate-700">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded bg-cyan-500 text-white">
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <Link
                href="/#criar-loja"
                className={`block w-full rounded-xl py-3.5 text-center text-sm font-bold transition ${st.btn}`}
              >
                Assinar
              </Link>
            </div>
          );
        })}
      </div>

      <div className="mt-10 flex justify-center">
        <button
          type="button"
          onClick={() => setCompareOpen((o) => !o)}
          className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-6 py-3.5 text-sm font-bold text-white shadow-lg transition hover:bg-slate-800"
        >
          Comparar planos
          <svg
            className={`h-4 w-4 transition-transform ${compareOpen ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {compareOpen && (
        <div className="mt-6 overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="px-4 py-3 text-left font-bold text-slate-800">Recurso</th>
                {PLAN_CATALOG.map((p) => (
                  <th key={p.id} className="px-3 py-3 text-center font-bold text-slate-800">
                    {p.title.replace("Plano ", "")}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {matrixRows.map((row) => (
                <tr key={row} className="border-b border-slate-100">
                  <td className="px-4 py-2.5 text-slate-700">{row}</td>
                  {PLAN_CATALOG.map((p) => (
                    <td key={p.id} className="px-3 py-2.5 text-center">
                      {p.features.includes(row) ? (
                        <span className="inline-flex h-6 w-6 items-center justify-center rounded bg-cyan-500 text-white text-xs font-bold">
                          ✓
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
