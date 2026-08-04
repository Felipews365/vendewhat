"use client";

import { useState } from "react";
import { isCustomerPhoneValid } from "@/lib/customerPhone";

type Props = { storeId: string };

/**
 * Ferramenta de teste do dono do SaaS: apaga o histórico de um cliente nesta
 * loja para o próximo "oi" cair de novo no PRIMEIRO CONTATO (a IA se apresenta
 * do zero). Não mexe em pedidos nem no catálogo.
 */
export default function ResetConversationCard({ storeId }: Props) {
  const [phone, setPhone] = useState("");
  const [forgetName, setForgetName] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const valid = isCustomerPhoneValid(phone);

  async function reset() {
    if (!valid || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/reset-conversation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId, phone, forgetName }),
      });
      const data = await res.json();
      if (data.ok) {
        setMsg({
          ok: true,
          text: `Conversa zerada (${data.deleted} registro(s) apagados)${
            data.nameCleared ? " e nome do contato esquecido" : ""
          }. Mande um "oi" desse número que a IA vai se apresentar do zero.`,
        });
      } else {
        setMsg({ ok: false, text: data.error || "Não foi possível zerar." });
      }
    } catch {
      setMsg({ ok: false, text: "Falha ao zerar a conversa." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm">
      <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
        Testar a IA — zerar conversa
      </h2>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        Apaga o histórico deste número nesta loja (mensagens, pausa, follow-up,
        carrinho e etiquetas). O próximo contato volta a ser o primeiro, então a
        IA se apresenta de novo.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <input
          type="tel"
          inputMode="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") reset();
          }}
          placeholder="55 81 9645-4656"
          className="w-48 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400"
        />
        <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
          <input
            type="checkbox"
            checked={forgetName}
            onChange={(e) => setForgetName(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 dark:border-slate-700"
          />
          Esquecer o nome salvo
        </label>
        <button
          onClick={reset}
          disabled={busy || !valid}
          className="ml-auto rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:opacity-50"
        >
          {busy ? "Zerando…" : "Zerar conversa"}
        </button>
      </div>

      {msg && (
        <p
          className={`mt-2 text-xs font-medium ${
            msg.ok
              ? "text-emerald-700 dark:text-emerald-300"
              : "text-rose-700 dark:text-rose-300"
          }`}
        >
          {msg.text}
        </p>
      )}
      <p className="mt-2 text-[11px] text-slate-400 dark:text-slate-500">
        Pedidos não são apagados — se este número já comprou, a IA continua
        sabendo o nome dele pelo pedido, mesmo com &quot;esquecer o nome&quot;
        marcado.
      </p>
    </div>
  );
}
