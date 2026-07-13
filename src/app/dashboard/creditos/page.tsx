"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useToast } from "@/components/Toast";

type CreditPackage = { brl: number; conversations: number; tokens: number };

type CreditState = {
  conversationsLeft: number;
  includedTokens: number;
  usedTokens: number;
  creditTokens: number;
  includedConversations: number;
  creditConversations: number;
  packages: CreditPackage[];
  mpConfigured: boolean;
};

const TOKENS_PER_CONVERSATION = 80_000;

function fmt(n: number) {
  return n.toLocaleString("pt-BR");
}

export default function CreditosPage() {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [state, setState] = useState<CreditState | null>(null);
  const [checkoutBrl, setCheckoutBrl] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/whatsapp/credits");
      const data = await res.json();
      if (data.ok) setState(data as CreditState);
      else showToast(data.error || "Não foi possível carregar o saldo.", "error");
    } catch {
      showToast("Falha ao carregar o saldo.", "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    load();
  }, [load]);

  // Retorno do Mercado Pago (?recarga=ok|pendente|falhou): avisa e recarrega o saldo.
  useEffect(() => {
    const recarga = new URLSearchParams(window.location.search).get("recarga");
    if (!recarga) return;
    if (recarga === "ok") showToast("Pagamento recebido! Seu saldo é atualizado em instantes.", "success");
    else if (recarga === "pendente") showToast("Pagamento em processamento. Assim que aprovar, os créditos entram.", "success");
    else if (recarga === "falhou") showToast("O pagamento não foi concluído.", "error");
    window.history.replaceState(null, "", "/dashboard/creditos");
  }, [showToast]);

  async function startCheckout(brl: number) {
    setCheckoutBrl(brl);
    try {
      const res = await fetch("/api/credits/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brl }),
      });
      const data = await res.json();
      if (data.ok && data.initPoint) {
        window.location.href = data.initPoint as string;
      } else {
        showToast(data.error || "Não foi possível abrir o pagamento.", "error");
        setCheckoutBrl(null);
      }
    } catch {
      showToast("Falha ao abrir o pagamento.", "error");
      setCheckoutBrl(null);
    }
  }

  if (loading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-landing-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  const left = state?.conversationsLeft ?? 0;
  const usedConversations = state
    ? Math.floor(state.usedTokens / TOKENS_PER_CONVERSATION)
    : 0;
  const includedConversations = state?.includedConversations ?? 0;
  const remainingIncluded = Math.max(0, includedConversations - usedConversations);
  const creditConversations = state?.creditConversations ?? 0;
  const isLow = left <= 20;
  const isEmpty = left <= 0;

  return (
    <main className="max-w-xl mx-auto px-4 py-8 pb-16">
      <div className="flex items-center gap-2 mb-1">
        <Link
          href="/dashboard/whatsapp"
          className="text-sm text-landing-primary dark:text-violet-400 font-medium hover:underline"
        >
          ← WhatsApp &amp; IA
        </Link>
      </div>
      <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
        Créditos da IA
      </h1>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
        Cada conversa que a IA atende consome créditos. Quando o saldo acaba, a IA
        para de responder e avisamos você aqui no WhatsApp — é só recarregar.
      </p>

      {/* Saldo */}
      <div
        className={`mt-6 rounded-2xl border p-6 shadow-sm ${
          isEmpty
            ? "border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-950/30"
            : isLow
            ? "border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/30"
            : "border-emerald-100 bg-emerald-50 dark:border-emerald-900/40 dark:bg-emerald-950/20"
        }`}
      >
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Saldo disponível
        </span>
        <div className="mt-1 flex items-baseline gap-2">
          <span
            className={`text-4xl font-extrabold tracking-tight ${
              isEmpty
                ? "text-red-600 dark:text-red-400"
                : isLow
                ? "text-amber-600 dark:text-amber-400"
                : "text-emerald-600 dark:text-emerald-400"
            }`}
          >
            {fmt(left)}
          </span>
          <span className="text-sm font-medium text-slate-600 dark:text-slate-300">
            conversa{left === 1 ? "" : "s"} restante{left === 1 ? "" : "s"}
          </span>
        </div>
        {isEmpty && (
          <p className="mt-3 text-sm font-medium text-red-700 dark:text-red-300">
            ⚠️ Sem saldo — a IA não está atendendo. Recarregue para reativar.
          </p>
        )}
        {isLow && !isEmpty && (
          <p className="mt-3 text-sm font-medium text-amber-700 dark:text-amber-300">
            ⏳ Seus créditos estão acabando. Recarregue para a IA não parar.
          </p>
        )}
      </div>

      {/* Detalhe do saldo */}
      <div className="mt-4 grid grid-cols-2 gap-3">
        {includedConversations > 0 && (
          <div className="rounded-2xl border border-slate-100 bg-white dark:border-slate-800 dark:bg-slate-900 p-4 shadow-sm">
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Franquia do mês
            </span>
            <p className="mt-1 text-lg font-bold text-slate-900 dark:text-slate-100">
              {fmt(remainingIncluded)}
              <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
                {" "}
                / {fmt(includedConversations)}
              </span>
            </p>
            <span className="text-[11px] text-slate-400">renova todo mês</span>
          </div>
        )}
        <div className="rounded-2xl border border-slate-100 bg-white dark:border-slate-800 dark:bg-slate-900 p-4 shadow-sm">
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Créditos comprados
          </span>
          <p className="mt-1 text-lg font-bold text-slate-900 dark:text-slate-100">
            {fmt(creditConversations)}
          </p>
          <span className="text-[11px] text-slate-400">não expiram</span>
        </div>
      </div>

      {/* Pacotes de recarga */}
      <div className="mt-6">
        <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
          Recarregar créditos
        </h2>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          {state?.mpConfigured
            ? "Escolha um pacote e pague com Pix ou cartão pelo Mercado Pago. Os créditos entram assim que o pagamento é aprovado."
            : "A recarga automática ainda não está ativa. Fale com o suporte para adicionar créditos."}
        </p>
        <div className="mt-3 grid grid-cols-2 gap-3">
          {state?.packages.map((p) => {
            const perConversation = p.brl / p.conversations;
            const isThis = checkoutBrl === p.brl;
            return (
              <button
                key={p.brl}
                type="button"
                disabled={!state?.mpConfigured || checkoutBrl != null}
                onClick={() => startCheckout(p.brl)}
                className="text-left rounded-2xl border border-slate-100 bg-white dark:border-slate-800 dark:bg-slate-900 p-4 shadow-sm transition hover:border-emerald-400 hover:shadow disabled:cursor-not-allowed disabled:opacity-60"
              >
                <p className="text-lg font-bold text-slate-900 dark:text-slate-100">
                  R$ {fmt(p.brl)}
                </p>
                <p className="text-sm text-emerald-600 dark:text-emerald-400 font-medium">
                  {fmt(p.conversations)} conversas
                </p>
                <p className="mt-1 text-[11px] text-slate-400">
                  ~R${" "}
                  {perConversation.toLocaleString("pt-BR", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}{" "}
                  por conversa
                </p>
                {isThis && (
                  <p className="mt-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                    Abrindo pagamento…
                  </p>
                )}
              </button>
            );
          })}
        </div>
      </div>

    </main>
  );
}
