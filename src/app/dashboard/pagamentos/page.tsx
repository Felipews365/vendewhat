"use client";

import { useEffect, useState } from "react";
import { useToast } from "@/components/Toast";

type GatewayStatus = {
  connected: boolean;
  enabled?: boolean;
  isTest?: boolean;
  mpUserId?: string | null;
  maskedToken?: string;
};

export default function PagamentosPage() {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<GatewayStatus>({ connected: false });
  const [token, setToken] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    try {
      const res = await fetch("/api/store/payment-gateway", { cache: "no-store" });
      const data = (await res.json()) as GatewayStatus & { ok?: boolean };
      if (data?.ok) setStatus(data);
    } catch {
      /* silencioso */
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleConnect() {
    setError("");
    if (!token.trim()) {
      setError("Cole o Access Token do Mercado Pago.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/store/payment-gateway", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken: token.trim() }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Não foi possível conectar.");
        return;
      }
      setToken("");
      showToast("Mercado Pago conectado!");
      await load();
    } catch {
      setError("Falha de rede ao conectar.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDisconnect() {
    setError("");
    if (!confirm("Desconectar o Mercado Pago desta loja? Seus clientes deixarão de pagar online.")) {
      return;
    }
    try {
      await fetch("/api/store/payment-gateway", { method: "DELETE" });
      showToast("Mercado Pago desconectado.");
      setStatus({ connected: false });
    } catch {
      setError("Falha de rede ao desconectar.");
    }
  }

  if (loading) {
    return <div className="p-6 text-sm text-stone-500 dark:text-slate-400">Carregando…</div>;
  }

  return (
    <div className="mx-auto max-w-2xl p-4 sm:p-6 space-y-6">
      <header>
        <h1 className="text-xl font-bold text-stone-800 dark:text-slate-100">Pagamentos da loja</h1>
        <p className="mt-1 text-sm text-stone-500 dark:text-slate-400">
          Conecte o <strong>Mercado Pago</strong> da sua loja para que seus clientes
          paguem o pedido online (cartão, Pix e boleto). O dinheiro cai direto na sua
          conta do Mercado Pago.
        </p>
      </header>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
          {error}
        </div>
      )}

      <section className="rounded-2xl border border-stone-200 bg-white dark:border-slate-800 dark:bg-slate-900 p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold text-stone-800 dark:text-slate-100">Conta Mercado Pago</h2>
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              status.connected
                ? "bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-300"
                : "bg-stone-100 text-stone-600 dark:bg-slate-800 dark:text-slate-300"
            }`}
          >
            {status.connected ? "Conectado" : "Não conectado"}
          </span>
        </div>

        {status.connected ? (
          <div className="space-y-3">
            {status.isTest && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">
                Modo teste
              </span>
            )}
            <p className="text-sm text-stone-600 dark:text-slate-300">
              Token: <code className="rounded bg-stone-100 px-1.5 py-0.5 text-xs dark:bg-slate-800">{status.maskedToken}</code>
            </p>
            {status.mpUserId && (
              <p className="text-xs text-stone-500 dark:text-slate-400">
                ID da conta MP: {status.mpUserId}
              </p>
            )}
            <button
              onClick={handleDisconnect}
              className="rounded-lg border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Desconectar
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-stone-700 dark:text-slate-300">
                Access Token
              </label>
              <p className="mt-0.5 text-xs text-stone-500 dark:text-slate-400">
                No painel do Mercado Pago: <strong>Seu negócio → Configurações →
                Credenciais</strong>. Para testar, use o token de teste
                (começa com <code>TEST-</code>).
              </p>
              <input
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                className="mt-2 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
                placeholder="APP_USR-… ou TEST-…"
                autoComplete="off"
              />
            </div>
            <button
              onClick={handleConnect}
              disabled={saving}
              className="rounded-lg bg-violet-700 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-800 disabled:opacity-60"
            >
              {saving ? "Validando…" : "Conectar Mercado Pago"}
            </button>
          </div>
        )}
      </section>

      <p className="text-xs text-stone-400 dark:text-slate-500">
        Recurso dos planos Profissional e Empresarial. Seu token fica guardado com
        segurança no servidor e nunca é exibido por completo.
      </p>
    </div>
  );
}
