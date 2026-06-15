"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Constantes locais (client-safe) — não importar de whatsappConfig.ts, que usa `crypto`.
type AiTone = "simpatico" | "formal" | "descontraido";
const AI_TONES: AiTone[] = ["simpatico", "formal", "descontraido"];
const AI_TONE_LABELS: Record<AiTone, string> = {
  simpatico: "Simpático",
  formal: "Formal",
  descontraido: "Descontraído",
};
type ConnectionStatus = "disconnected" | "connecting" | "connected";

function qrSrc(base64: string): string {
  return base64.startsWith("data:") ? base64 : `data:image/png;base64,${base64}`;
}

const STATUS_LABEL: Record<ConnectionStatus, string> = {
  connected: "Conectado",
  connecting: "Conectando…",
  disconnected: "Desconectado",
};

export default function WhatsAppIaPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [storeId, setStoreId] = useState<string | null>(null);

  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const [number, setNumber] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState("");

  const [aiEnabled, setAiEnabled] = useState(false);
  const [aiName, setAiName] = useState("Atendente");
  const [aiTone, setAiTone] = useState<AiTone>("simpatico");
  const [faq, setFaq] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(false);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const refreshStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/whatsapp/status", { cache: "no-store" });
      const data = await res.json();
      if (data?.ok) {
        setStatus(data.status as ConnectionStatus);
        setNumber(data.number ?? null);
        if (data.status === "connected") {
          setQr(null);
          setPairingCode(null);
          stopPolling();
        }
      }
    } catch {
      /* silencioso no polling */
    }
  }, [stopPolling]);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }
      const { data: store } = await supabase
        .from("stores")
        .select("id")
        .eq("user_id", user.id)
        .single();
      if (!store) {
        router.push("/dashboard");
        return;
      }
      setStoreId(store.id);

      const { data: cfg } = await supabase
        .from("store_whatsapp")
        .select(
          "connection_status, connected_number, ai_enabled, ai_name, ai_tone, faq"
        )
        .eq("store_id", store.id)
        .maybeSingle();
      if (cfg) {
        setStatus((cfg.connection_status as ConnectionStatus) ?? "disconnected");
        setNumber(
          typeof cfg.connected_number === "string" ? cfg.connected_number : null
        );
        setAiEnabled(cfg.ai_enabled === true);
        setAiName(typeof cfg.ai_name === "string" ? cfg.ai_name : "Atendente");
        setAiTone(
          AI_TONES.includes(cfg.ai_tone as AiTone)
            ? (cfg.ai_tone as AiTone)
            : "simpatico"
        );
        setFaq(typeof cfg.faq === "string" ? cfg.faq : "");
      }
      setLoading(false);
      // Sincroniza com a Evolution em segundo plano.
      refreshStatus();
    }
    load();
    return () => stopPolling();
  }, [router, refreshStatus, stopPolling]);

  async function handleConnect() {
    setError("");
    setConnecting(true);
    setQr(null);
    setPairingCode(null);
    try {
      const res = await fetch("/api/whatsapp/connect", { method: "POST" });
      const data = await res.json();
      if (!data?.ok) {
        setError(data?.error || "Não foi possível conectar.");
        return;
      }
      setStatus("connecting");
      if (data.qr) setQr(data.qr as string);
      if (data.pairingCode) setPairingCode(data.pairingCode as string);
      stopPolling();
      pollRef.current = setInterval(refreshStatus, 3000);
    } catch {
      setError("Falha de rede ao conectar.");
    } finally {
      setConnecting(false);
    }
  }

  async function handleDisconnect() {
    setError("");
    stopPolling();
    try {
      await fetch("/api/whatsapp/disconnect", { method: "POST" });
    } catch {
      /* ignore */
    }
    setStatus("disconnected");
    setNumber(null);
    setQr(null);
    setPairingCode(null);
  }

  async function handleSaveConfig() {
    setSaving(true);
    setSavedOk(false);
    setError("");
    try {
      const res = await fetch("/api/whatsapp/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aiEnabled, aiName, aiTone, faq }),
      });
      const data = await res.json();
      if (!data?.ok) {
        setError(data?.error || "Não foi possível salvar.");
        return;
      }
      setSavedOk(true);
      setTimeout(() => setSavedOk(false), 2500);
    } catch {
      setError("Falha de rede ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  if (loading || !storeId) {
    return (
      <div className="p-6 text-sm text-stone-500">Carregando…</div>
    );
  }

  const statusColor =
    status === "connected"
      ? "bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-300"
      : status === "connecting"
      ? "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300"
      : "bg-stone-100 text-stone-600 dark:bg-slate-800 dark:text-slate-300";

  return (
    <div className="mx-auto max-w-2xl p-4 sm:p-6 space-y-6">
      <header>
        <h1 className="text-xl font-bold text-stone-800 dark:text-slate-100">WhatsApp & IA</h1>
        <p className="mt-1 text-sm text-stone-500 dark:text-slate-400">
          Conecte o WhatsApp da sua loja e deixe a IA atender seus clientes, tirar
          dúvidas e enviar o link da loja para a compra.
        </p>
      </header>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Conexão */}
      <section className="rounded-2xl border border-stone-200 bg-white dark:border-slate-800 dark:bg-slate-900 p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold text-stone-800 dark:text-slate-100">Conexão do WhatsApp</h2>
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${statusColor}`}
          >
            {STATUS_LABEL[status]}
          </span>
        </div>

        {status === "connected" ? (
          <div className="mt-4 space-y-3">
            <p className="text-sm text-stone-600 dark:text-slate-300">
              Número conectado:{" "}
              <strong className="text-stone-800 dark:text-slate-100">{number ?? "—"}</strong>
            </p>
            <button
              onClick={handleDisconnect}
              className="rounded-lg border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Desconectar
            </button>
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            {qr ? (
              <div className="flex flex-col items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={qrSrc(qr)}
                  alt="QR Code para conectar o WhatsApp"
                  className="h-56 w-56 rounded-lg border border-stone-200 bg-white p-2"
                />
                <p className="text-center text-sm text-stone-600 dark:text-slate-300">
                  Abra o WhatsApp no celular → <strong>Aparelhos conectados</strong> →
                  <strong> Conectar um aparelho</strong> e aponte para o QR Code.
                </p>
                {pairingCode && (
                  <p className="text-center text-xs text-stone-500 dark:text-slate-400">
                    Ou use o código de pareamento:{" "}
                    <strong className="tracking-widest">{pairingCode}</strong>
                  </p>
                )}
                <p className="text-xs text-stone-400 dark:text-slate-500">
                  A página atualiza sozinha quando o WhatsApp conectar.
                </p>
              </div>
            ) : (
              <button
                onClick={handleConnect}
                disabled={connecting}
                className="rounded-lg bg-violet-700 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-800 disabled:opacity-60"
              >
                {connecting ? "Gerando QR Code…" : "Conectar WhatsApp"}
              </button>
            )}
          </div>
        )}
      </section>

      {/* Configuração da IA */}
      <section className="rounded-2xl border border-stone-200 bg-white dark:border-slate-800 dark:bg-slate-900 p-5 shadow-sm space-y-4">
        <h2 className="font-semibold text-stone-800 dark:text-slate-100">Atendente de IA</h2>

        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={aiEnabled}
            onChange={(e) => setAiEnabled(e.target.checked)}
            className="h-4 w-4 rounded border-stone-300 dark:border-slate-600 dark:bg-slate-800"
          />
          <span className="text-sm text-stone-700 dark:text-slate-300">
            Ativar atendimento automático por IA neste WhatsApp
          </span>
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-stone-700 dark:text-slate-300">
              Nome do atendente
            </label>
            <input
              type="text"
              value={aiName}
              maxLength={60}
              onChange={(e) => setAiName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
              placeholder="Ex.: Ana"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-700 dark:text-slate-300">
              Tom de voz
            </label>
            <select
              value={aiTone}
              onChange={(e) => setAiTone(e.target.value as AiTone)}
              className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            >
              {AI_TONES.map((t) => (
                <option key={t} value={t}>
                  {AI_TONE_LABELS[t]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-stone-700 dark:text-slate-300">
            Informações e políticas (FAQ)
          </label>
          <p className="mt-0.5 text-xs text-stone-500 dark:text-slate-400">
            Frete, formas de pagamento, trocas/devoluções, horário de atendimento,
            prazos… A IA usa isto para responder os clientes.
          </p>
          <textarea
            value={faq}
            maxLength={4000}
            onChange={(e) => setFaq(e.target.value)}
            rows={8}
            className="mt-2 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
            placeholder={
              "Ex.:\n- Frete grátis acima de R$ 200.\n- Pagamento: Pix e cartão.\n- Trocas em até 7 dias.\n- Atendemos de seg a sex, 9h às 18h."
            }
          />
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleSaveConfig}
            disabled={saving}
            className="rounded-lg bg-violet-700 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-800 disabled:opacity-60"
          >
            {saving ? "Salvando…" : "Salvar configurações"}
          </button>
          {savedOk && (
            <span className="text-sm font-medium text-green-600">Salvo!</span>
          )}
        </div>
      </section>
    </div>
  );
}
