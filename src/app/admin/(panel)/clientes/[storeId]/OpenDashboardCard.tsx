"use client";

import { useState } from "react";

type Props = { storeId: string; storeName: string; ownerEmail: string | null };

/**
 * Suporte: abre o painel do lojista como se fosse ele (para o dono do SaaS
 * ajustar algo que o cliente não consegue). O painel roda no browser com RLS
 * por `user_id`, então não há "modo admin" por dentro — a rota troca a sessão
 * deste navegador pela do lojista. Por isso o aviso da janela anônima.
 */
export default function OpenDashboardCard({ storeId, storeName, ownerEmail }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function enter() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/impersonate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId }),
      });
      const data = await res.json();
      if (data.ok) {
        // A sessão já é a do lojista: recarrega direto no painel dele.
        window.location.href = "/dashboard";
        return;
      }
      setError(data.error || "Não foi possível entrar no painel.");
    } catch {
      setError("Falha ao entrar no painel do cliente.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm">
      <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
        Entrar no painel deste cliente
      </h2>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        Abre o painel de <strong className="text-slate-700 dark:text-slate-200">{storeName}</strong>{" "}
        exatamente como {ownerEmail ?? "o lojista"} vê, para você ajustar o que
        ele não consegue sozinho.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          onClick={enter}
          disabled={busy}
          className="rounded-lg bg-landing-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-landing-primary-hover disabled:opacity-50"
        >
          {busy ? "Entrando…" : "Entrar no painel do cliente"}
        </button>
        <span className="text-xs text-slate-400 dark:text-slate-500">
          Você sai do admin ao entrar.
        </span>
      </div>

      {error && (
        <p className="mt-2 text-xs font-medium text-rose-700 dark:text-rose-300">{error}</p>
      )}

      <p className="mt-3 rounded-lg bg-amber-50 dark:bg-amber-500/10 px-3 py-2 text-[11px] leading-relaxed text-amber-800 dark:text-amber-200">
        Este navegador passa a estar logado <strong>como o lojista</strong> (é o
        mesmo cookie de sessão do domínio). Para não perder o admin, abra{" "}
        <code className="rounded bg-amber-100 dark:bg-amber-500/20 px-1">/admin</code> numa{" "}
        <strong>janela anônima</strong> e clique neste botão por lá. Ao terminar,
        saia do painel do lojista e faça login de novo em{" "}
        <code className="rounded bg-amber-100 dark:bg-amber-500/20 px-1">/admin/login</code>.
      </p>
    </div>
  );
}
