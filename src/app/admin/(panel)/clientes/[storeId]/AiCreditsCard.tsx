"use client";

import { useState } from "react";

type Props = {
  storeId: string;
  conversationsLeft: number;
  creditConversations: number;
  includedConversations: number;
  usedConversations: number;
};

function fmt(n: number) {
  return n.toLocaleString("pt-BR");
}

export default function AiCreditsCard(props: Props) {
  const [left, setLeft] = useState(props.conversationsLeft);
  const [credits, setCredits] = useState(props.creditConversations);
  const [qty, setQty] = useState(100);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const remainingIncluded = Math.max(0, props.includedConversations - props.usedConversations);

  async function addCredits() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/credits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId: props.storeId, conversations: qty }),
      });
      const data = await res.json();
      if (data.ok) {
        setLeft(data.conversationsLeft);
        setCredits(data.creditConversations);
        setMsg(`+${fmt(qty)} conversas creditadas.`);
      } else {
        setMsg(data.error || "Não foi possível creditar.");
      }
    } catch {
      setMsg("Falha ao creditar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-slate-900">Créditos da IA</h2>
        <span className="text-2xl font-extrabold tracking-tight text-emerald-600">
          {fmt(left)}
          <span className="ml-1 text-xs font-medium text-slate-500">conversas</span>
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-xl bg-slate-50 p-3">
          <p className="text-xs text-slate-500">Créditos comprados</p>
          <p className="mt-0.5 font-bold text-slate-900">{fmt(credits)}</p>
        </div>
        <div className="rounded-xl bg-slate-50 p-3">
          <p className="text-xs text-slate-500">Franquia do mês</p>
          <p className="mt-0.5 font-bold text-slate-900">
            {fmt(remainingIncluded)}
            <span className="text-xs font-normal text-slate-400">
              {" "}
              / {fmt(props.includedConversations)}
            </span>
          </p>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2">
        <input
          type="number"
          min={1}
          value={qty}
          onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 0))}
          className="w-28 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900"
        />
        <span className="text-sm text-slate-500">conversas</span>
        <button
          onClick={addCredits}
          disabled={busy}
          className="ml-auto rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
        >
          {busy ? "Creditando…" : "Adicionar créditos"}
        </button>
      </div>

      {msg && <p className="mt-2 text-xs font-medium text-emerald-700">{msg}</p>}
      <p className="mt-2 text-[11px] text-slate-400">
        Crédito manual (cortesia/suporte). Some ao saldo comprado — não expira. Para
        reduzir ou zerar, use o SQL no Supabase.
      </p>
    </div>
  );
}
