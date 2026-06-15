"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { PlanRow } from "@/lib/adminData";
import { useToast } from "@/components/Toast";

function PlanCard({ plan, onSaved }: { plan: PlanRow; onSaved: () => void }) {
  const { showToast } = useToast();
  const [title, setTitle] = useState(plan.title);
  const [description, setDescription] = useState(plan.description ?? "");
  const [monthly, setMonthly] = useState(String(Number(plan.monthly)));
  const [features, setFeatures] = useState((plan.features ?? []).join("\n"));
  const [active, setActive] = useState(plan.active);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/plans", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: plan.id,
          title,
          description,
          monthly,
          features: features
            .split("\n")
            .map((f) => f.trim())
            .filter(Boolean),
          active,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Erro ao salvar.");
      setMsg("Plano salvo.");
      showToast(`Plano “${title}” salvo!`);
      onSaved();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  const inputCls =
    "mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-landing-primary focus:ring-2 focus:ring-landing-primary/20";
  const labelCls = "text-sm font-semibold text-slate-700";

  return (
    <form onSubmit={save} className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-900">{plan.title}</h2>
        <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">{plan.id}</code>
      </div>
      <div className="mt-4 space-y-4">
        <label className="block">
          <span className={labelCls}>Título</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} />
        </label>
        <label className="block">
          <span className={labelCls}>Preço mensal (R$)</span>
          <input
            type="number"
            step="0.01"
            min="0"
            value={monthly}
            onChange={(e) => setMonthly(e.target.value)}
            className={inputCls}
          />
        </label>
        <label className="block">
          <span className={labelCls}>Descrição</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className={inputCls}
          />
        </label>
        <label className="block">
          <span className={labelCls}>Recursos (um por linha)</span>
          <textarea
            value={features}
            onChange={(e) => setFeatures(e.target.value)}
            rows={6}
            className={inputCls}
          />
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-landing-primary focus:ring-landing-primary"
          />
          <span className="text-sm font-medium text-slate-700">Plano ativo (visível na loja)</span>
        </label>
      </div>
      {msg && <p className="mt-3 text-sm text-slate-600">{msg}</p>}
      <button
        type="submit"
        disabled={saving}
        className="mt-4 w-full rounded-xl bg-landing-primary py-3 font-bold text-white transition hover:bg-landing-primary-hover disabled:opacity-60"
      >
        {saving ? "Salvando…" : "Salvar plano"}
      </button>
    </form>
  );
}

export default function PlansEditor({ plans }: { plans: PlanRow[] }) {
  const router = useRouter();
  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-3">
      {plans.map((p) => (
        <PlanCard key={p.id} plan={p} onSaved={() => router.refresh()} />
      ))}
    </div>
  );
}
