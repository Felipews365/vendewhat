"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";
import { parseLatLng, isShortMapsLink } from "@/lib/geoLocation";
import { storefrontFromDb } from "@/lib/storefront";

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

type GlobalPause = { paused: boolean; until: string | null };
type CustomerPause = { customerPhone: string; pausedUntil: string | null; reason: string };
type RecentCustomer = { customerPhone: string; lastMessage: string; lastAt: string };

// Opções de duração da pausa. minutes null = "até eu reativar".
const PAUSE_DURATIONS: { label: string; minutes: number | null }[] = [
  { label: "15 min", minutes: 15 },
  { label: "30 min", minutes: 30 },
  { label: "1 hora", minutes: 60 },
  { label: "3 horas", minutes: 180 },
  { label: "1 dia", minutes: 1440 },
  { label: "Até eu reativar", minutes: null },
];

// Opções do tempo de pausa quando a loja responde (handoff).
const HANDOFF_OPTIONS: { label: string; value: number }[] = [
  { label: "Não pausar", value: 0 },
  { label: "15 minutos", value: 15 },
  { label: "30 minutos", value: 30 },
  { label: "1 hora", value: 60 },
  { label: "3 horas", value: 180 },
  { label: "1 dia", value: 1440 },
];

// Opções de tempo de silêncio até a IA mandar o follow-up.
const FOLLOWUP_OPTIONS: { label: string; value: number }[] = [
  { label: "Desativado", value: 0 },
  { label: "30 minutos", value: 30 },
  { label: "1 hora", value: 60 },
  { label: "2 horas", value: 120 },
  { label: "3 horas", value: 180 },
  { label: "6 horas", value: 360 },
  { label: "1 dia", value: 1440 },
];

// Opções de prazo (em dias) para a mensagem de pós-venda.
const POSTSALE_OPTIONS: { label: string; value: number }[] = [
  { label: "Desativado", value: 0 },
  { label: "1 dia", value: 1 },
  { label: "2 dias", value: 2 },
  { label: "3 dias", value: 3 },
  { label: "5 dias", value: 5 },
  { label: "7 dias", value: 7 },
  { label: "10 dias", value: 10 },
  { label: "15 dias", value: 15 },
];

// Opções de tempo (em minutos) para a recuperação de carrinho abandonado.
const CART_OPTIONS: { label: string; value: number }[] = [
  { label: "Desativado", value: 0 },
  { label: "30 minutos", value: 30 },
  { label: "1 hora", value: 60 },
  { label: "2 horas", value: 120 },
  { label: "3 horas", value: 180 },
  { label: "6 horas", value: 360 },
  { label: "1 dia", value: 1440 },
];

function formatUntil(until: string | null): string {
  if (!until) return "até você reativar";
  const d = new Date(until);
  if (Number.isNaN(d.getTime())) return "";
  return `até ${d.toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

export default function WhatsAppIaPage() {
  const router = useRouter();
  const { showToast } = useToast();
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
  const [handoffMinutes, setHandoffMinutes] = useState(30);
  const [followupMinutes, setFollowupMinutes] = useState(0);
  const [followupMessage, setFollowupMessage] = useState("");
  const [postsaleDays, setPostsaleDays] = useState(0);
  const [postsaleMessage, setPostsaleMessage] = useState("");
  const [cartMinutes, setCartMinutes] = useState(0);
  const [onlineOnly, setOnlineOnly] = useState(false);
  const [locationAddress, setLocationAddress] = useState("");
  const [locationUrl, setLocationUrl] = useState("");
  // Campos de latitude/longitude (sincronizados com o link acima).
  const [latStr, setLatStr] = useState("");
  const [lngStr, setLngStr] = useState("");
  const [storePhotoUrl, setStorePhotoUrl] = useState("");
  const [photoUploading, setPhotoUploading] = useState(false);
  const [storeVideoUrl, setStoreVideoUrl] = useState("");
  const [videoUploading, setVideoUploading] = useState(false);
  const [pickupAddress, setPickupAddress] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(false);

  const [globalPause, setGlobalPause] = useState<GlobalPause>({
    paused: false,
    until: null,
  });
  const [customerPauses, setCustomerPauses] = useState<CustomerPause[]>([]);
  const [conversations, setConversations] = useState<RecentCustomer[]>([]);
  const [pauseBusy, setPauseBusy] = useState(false);
  const [newPausePhone, setNewPausePhone] = useState("");
  // Duração escolhida ao pausar um cliente da lista (minutes; null = até reativar).
  const [customerDuration, setCustomerDuration] = useState<number | null>(30);

  const [tab, setTab] = useState<"conexao" | "ia" | "pausar">("conexao");

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

  const loadPauses = useCallback(async () => {
    try {
      const res = await fetch("/api/whatsapp/pause", { cache: "no-store" });
      const data = await res.json();
      if (data?.ok) {
        setGlobalPause(
          data.global ?? { paused: false, until: null }
        );
        setCustomerPauses(Array.isArray(data.customers) ? data.customers : []);
        setConversations(
          Array.isArray(data.conversations) ? data.conversations : []
        );
        if (typeof data.handoffMinutes === "number") {
          setHandoffMinutes(data.handoffMinutes);
        }
      }
    } catch {
      /* silencioso */
    }
  }, []);

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
        .select("id, storefront")
        .eq("user_id", user.id)
        .single();
      if (!store) {
        router.push("/dashboard");
        return;
      }
      setStoreId(store.id);
      setPickupAddress(storefrontFromDb(store.storefront).pickupAddress);

      const { data: cfg } = await supabase
        .from("store_whatsapp")
        .select(
          "connection_status, connected_number, ai_enabled, ai_name, ai_tone, faq, ai_handoff_minutes, ai_followup_minutes, ai_followup_message, ai_postsale_days, ai_postsale_message, ai_cart_minutes, ai_online_only, ai_location_address, ai_location_url, ai_store_photo_url, ai_store_video_url"
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
        if (typeof cfg.ai_handoff_minutes === "number") {
          setHandoffMinutes(cfg.ai_handoff_minutes);
        }
        if (typeof cfg.ai_followup_minutes === "number") {
          setFollowupMinutes(cfg.ai_followup_minutes);
        }
        setFollowupMessage(
          typeof cfg.ai_followup_message === "string" ? cfg.ai_followup_message : ""
        );
        if (typeof cfg.ai_postsale_days === "number") {
          setPostsaleDays(cfg.ai_postsale_days);
        }
        setPostsaleMessage(
          typeof cfg.ai_postsale_message === "string" ? cfg.ai_postsale_message : ""
        );
        if (typeof cfg.ai_cart_minutes === "number") {
          setCartMinutes(cfg.ai_cart_minutes);
        }
        setOnlineOnly(cfg.ai_online_only === true);
        setLocationAddress(
          typeof cfg.ai_location_address === "string" ? cfg.ai_location_address : ""
        );
        {
          const url =
            typeof cfg.ai_location_url === "string" ? cfg.ai_location_url : "";
          setLocationUrl(url);
          // Lê lat/lng do link/coordenadas salvos para preencher os campos.
          const p = parseLatLng(url);
          if (p) {
            setLatStr(String(p.lat));
            setLngStr(String(p.lng));
          }
        }
        setStorePhotoUrl(
          typeof cfg.ai_store_photo_url === "string" ? cfg.ai_store_photo_url : ""
        );
        setStoreVideoUrl(
          typeof cfg.ai_store_video_url === "string" ? cfg.ai_store_video_url : ""
        );
      }
      setLoading(false);
      // Sincroniza com a Evolution em segundo plano.
      refreshStatus();
      loadPauses();
    }
    load();
    return () => stopPolling();
  }, [router, refreshStatus, stopPolling, loadPauses]);

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
        body: JSON.stringify({
          aiEnabled,
          aiName,
          aiTone,
          faq,
          aiHandoffMinutes: handoffMinutes,
          aiFollowupMinutes: followupMinutes,
          aiFollowupMessage: followupMessage,
          aiPostsaleDays: postsaleDays,
          aiPostsaleMessage: postsaleMessage,
          aiCartMinutes: cartMinutes,
          aiOnlineOnly: onlineOnly,
          aiLocationAddress: locationAddress,
          aiLocationUrl: locationUrl,
          aiStorePhotoUrl: storePhotoUrl,
          aiStoreVideoUrl: storeVideoUrl,
        }),
      });
      const data = await res.json();
      if (!data?.ok) {
        setError(data?.error || "Não foi possível salvar.");
        return;
      }
      setSavedOk(true);
      // Sincroniza com a URL canônica quando o servidor resolveu um link encurtado.
      if (
        typeof data.resolvedUrl === "string" &&
        data.resolvedUrl &&
        data.resolvedUrl !== locationUrl
      ) {
        setLocationUrl(data.resolvedUrl);
        const p = parseLatLng(data.resolvedUrl);
        if (p) {
          setLatStr(String(p.lat));
          setLngStr(String(p.lng));
        }
      }
      if (data.locationParsed === false) {
        showToast(
          "Configurações salvas, mas não consegui ler o ponto do link do mapa. Cole o link completo do Google Maps (ou as coordenadas).",
          "error"
        );
      } else {
        showToast("Configurações do WhatsApp salvas!");
      }
      setTimeout(() => setSavedOk(false), 2500);
    } catch {
      setError("Falha de rede ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  /** Preenche o link a partir do que foi digitado/colado, sincronizando lat/lng. */
  function handleLocationUrlChange(value: string) {
    setLocationUrl(value);
    const p = parseLatLng(value);
    if (p) {
      setLatStr(String(p.lat));
      setLngStr(String(p.lng));
    }
  }

  /** Atualiza latitude ou longitude e, se ambos forem números, monta o "lat, lng". */
  function handleCoordChange(which: "lat" | "lng", value: string) {
    const clean = value.replace(",", ".");
    const nextLat = which === "lat" ? clean : latStr;
    const nextLng = which === "lng" ? clean : lngStr;
    if (which === "lat") setLatStr(clean);
    else setLngStr(clean);
    const la = Number(nextLat);
    const lo = Number(nextLng);
    if (
      nextLat.trim() &&
      nextLng.trim() &&
      Number.isFinite(la) &&
      Number.isFinite(lo)
    ) {
      setLocationUrl(`${la}, ${lo}`);
    }
  }

  async function handlePhotoUpload(file: File) {
    if (!storeId || !file) return;
    setPhotoUploading(true);
    setError("");
    try {
      const supabase = createClient();
      const ext = file.name.split(".").pop() || "jpg";
      const fileName = `${storeId}/store-photo-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("product-images")
        .upload(fileName, file, { upsert: true });
      if (upErr) {
        showToast("Erro ao enviar foto: " + upErr.message, "error");
        return;
      }
      const { data } = supabase.storage
        .from("product-images")
        .getPublicUrl(fileName);
      setStorePhotoUrl(data.publicUrl);
      showToast("Foto enviada! Clique em Salvar para confirmar.");
    } finally {
      setPhotoUploading(false);
    }
  }

  async function handleVideoUpload(file: File) {
    if (!storeId || !file) return;
    // WhatsApp/Evolution têm limite prático de tamanho; avisa se passar de 16 MB.
    if (file.size > 16 * 1024 * 1024) {
      showToast("Vídeo muito grande (máx. 16 MB). Envie um vídeo mais curto.", "error");
      return;
    }
    setVideoUploading(true);
    setError("");
    try {
      const supabase = createClient();
      const ext = file.name.split(".").pop() || "mp4";
      const fileName = `${storeId}/store-video-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("product-images")
        .upload(fileName, file, { upsert: true });
      if (upErr) {
        showToast("Erro ao enviar vídeo: " + upErr.message, "error");
        return;
      }
      const { data } = supabase.storage
        .from("product-images")
        .getPublicUrl(fileName);
      setStoreVideoUrl(data.publicUrl);
      showToast("Vídeo enviado! Clique em Salvar para confirmar.");
    } finally {
      setVideoUploading(false);
    }
  }

  async function sendPause(payload: {
    action: "pause" | "resume";
    scope: "global" | "customer";
    phone?: string;
    minutes?: number | null;
  }) {
    setPauseBusy(true);
    setError("");
    try {
      const res = await fetch("/api/whatsapp/pause", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!data?.ok) {
        setError(data?.error || "Não foi possível atualizar a pausa.");
        return false;
      }
      await loadPauses();
      return true;
    } catch {
      setError("Falha de rede ao atualizar a pausa.");
      return false;
    } finally {
      setPauseBusy(false);
    }
  }

  async function pauseGlobal(minutes: number | null) {
    const ok = await sendPause({ action: "pause", scope: "global", minutes });
    if (ok) showToast("IA pausada.");
  }

  async function resumeGlobal() {
    const ok = await sendPause({ action: "resume", scope: "global" });
    if (ok) showToast("IA reativada!");
  }

  async function pauseCustomer(phone: string, minutes: number | null) {
    const clean = phone.replace(/\D/g, "");
    if (!clean) {
      setError("Informe o número do cliente (com DDD).");
      return;
    }
    const ok = await sendPause({
      action: "pause",
      scope: "customer",
      phone: clean,
      minutes,
    });
    if (ok) showToast("Cliente pausado.");
  }

  async function pauseManualCustomer() {
    if (!newPausePhone.replace(/\D/g, "")) {
      setError("Informe o número do cliente (com DDD).");
      return;
    }
    await pauseCustomer(newPausePhone, customerDuration);
    setNewPausePhone("");
  }

  async function resumeCustomer(phone: string) {
    const ok = await sendPause({ action: "resume", scope: "customer", phone });
    if (ok) showToast("Cliente reativado!");
  }

  if (loading || !storeId) {
    return (
      <div className="p-6 text-sm text-stone-500">Carregando…</div>
    );
  }

  // "Conectando…" só faz sentido durante uma conexão ativa (QR na tela ou logo
  // após clicar). Numa página recém-aberta, um estado preso em "connecting" do
  // servidor é mostrado como "Desconectado" para não confundir.
  const displayStatus: ConnectionStatus =
    status === "connecting" && !qr && !connecting ? "disconnected" : status;

  const statusColor =
    displayStatus === "connected"
      ? "bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-300"
      : displayStatus === "connecting"
      ? "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300"
      : "bg-stone-100 text-stone-600 dark:bg-slate-800 dark:text-slate-300";

  // Clientes que já conversaram + pausados (mesmo que ainda não tenham mensagem).
  const pauseByPhone = new Map(customerPauses.map((c) => [c.customerPhone, c]));
  const customerRows: {
    phone: string;
    lastMessage: string;
    pause: CustomerPause | null;
  }[] = [
    ...conversations.map((c) => ({
      phone: c.customerPhone,
      lastMessage: c.lastMessage,
      pause: pauseByPhone.get(c.customerPhone) ?? null,
    })),
    ...customerPauses
      .filter((c) => !conversations.some((v) => v.customerPhone === c.customerPhone))
      .map((c) => ({ phone: c.customerPhone, lastMessage: "", pause: c })),
  ];

  // Status de atendimento de um cliente (IA atendendo × assumido por você).
  function customerStatus(pause: CustomerPause | null): {
    label: string;
    cls: string;
  } {
    const amber =
      "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300";
    const green =
      "bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-300";
    const gray =
      "bg-stone-100 text-stone-600 dark:bg-slate-800 dark:text-slate-300";
    if (pause) {
      return {
        label: pause.reason === "handoff" ? "Você assumiu" : "Pausado por você",
        cls: amber,
      };
    }
    if (!aiEnabled) return { label: "IA desligada", cls: gray };
    if (globalPause.paused) return { label: "IA pausada", cls: gray };
    return { label: "IA atendendo", cls: green };
  }

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

      {/* Abas */}
      <div className="flex gap-1 rounded-xl border border-stone-200 bg-stone-100 p-1 dark:border-slate-800 dark:bg-slate-900/60">
        {(
          [
            ["conexao", "Conexão"],
            ["ia", "Atendente de IA"],
            ["pausar", "Pausar"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition ${
              tab === key
                ? "bg-white text-violet-700 shadow-sm dark:bg-slate-800 dark:text-violet-300"
                : "text-stone-600 hover:text-stone-800 dark:text-slate-400 dark:hover:text-slate-200"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Conexão */}
      {tab === "conexao" && (
      <section className="rounded-2xl border border-stone-200 bg-white dark:border-slate-800 dark:bg-slate-900 p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold text-stone-800 dark:text-slate-100">Conexão do WhatsApp</h2>
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${statusColor}`}
          >
            {STATUS_LABEL[displayStatus]}
          </span>
        </div>

        {displayStatus === "connected" ? (
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
      )}

      {/* Configuração da IA */}
      {tab === "ia" && (
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

        {/* Loja só online (sem ponto físico) */}
        <label className="flex items-start gap-3 rounded-xl border border-stone-200 dark:border-slate-700 p-4 cursor-pointer">
          <input
            type="checkbox"
            checked={onlineOnly}
            onChange={(e) => setOnlineOnly(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-stone-300 text-violet-700 focus:ring-violet-600 dark:border-slate-600 dark:bg-slate-800"
          />
          <span>
            <span className="block text-sm font-medium text-stone-800 dark:text-slate-100">
              Minha loja é só online (não tem ponto físico)
            </span>
            <span className="mt-0.5 block text-xs text-stone-500 dark:text-slate-400">
              Marque para a IA saber que não há endereço para visita. Ela não vai
              enviar localização, foto nem vídeo da loja — se o cliente pedir o
              endereço, explica que a loja é só online e manda o link do catálogo.
            </span>
          </span>
        </label>

        {/* Localização e foto da loja (escondido quando a loja é só online) */}
        {!onlineOnly && (
        <div className="rounded-xl border border-stone-200 dark:border-slate-700 p-4 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-stone-800 dark:text-slate-100">
              Localização e foto da loja
            </h3>
            <p className="mt-0.5 text-xs text-stone-500 dark:text-slate-400">
              Quando o cliente pedir, a IA manda o endereço, o ponto no mapa
              (igual uma pessoa manda) e a foto da loja.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-stone-700 dark:text-slate-300">
              Endereço de onde a loja fica
            </label>
            <textarea
              value={locationAddress}
              maxLength={300}
              onChange={(e) => setLocationAddress(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
              placeholder="Ex.: Rua das Flores, 123 - Centro, Cidade/UF"
            />
            {pickupAddress && pickupAddress.trim() !== locationAddress.trim() && (
              <button
                type="button"
                onClick={() => setLocationAddress(pickupAddress)}
                className="mt-1 text-xs font-medium text-violet-700 hover:underline dark:text-violet-300"
              >
                Usar o mesmo endereço de retirada
              </button>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-stone-700 dark:text-slate-300">
              Ponto no mapa (link do Google Maps)
            </label>
            <p className="mt-0.5 text-xs text-stone-500 dark:text-slate-400">
              Cole aqui o link do Google Maps da sua loja. Assim a IA envia o pino
              do mapa do WhatsApp, igual uma pessoa manda.
            </p>

            <details className="mt-2 rounded-lg bg-stone-50 px-3 py-2 text-xs text-stone-600 dark:bg-slate-800/60 dark:text-slate-300">
              <summary className="cursor-pointer font-medium text-stone-700 dark:text-slate-200">
                Como pego o link do mapa?
              </summary>
              <div className="mt-2 space-y-2">
                <div>
                  <p className="font-medium text-stone-700 dark:text-slate-200">
                    No celular (app Google Maps):
                  </p>
                  <ol className="ml-4 list-decimal space-y-0.5">
                    <li>Procure a sua loja (ou segure o dedo no ponto exato no mapa).</li>
                    <li>Toque em <strong>Compartilhar</strong>.</li>
                    <li>Toque em <strong>Copiar link</strong>.</li>
                    <li>Volte aqui e cole no campo abaixo.</li>
                  </ol>
                </div>
                <div>
                  <p className="font-medium text-stone-700 dark:text-slate-200">
                    No computador (maps.google.com):
                  </p>
                  <ol className="ml-4 list-decimal space-y-0.5">
                    <li>Procure a sua loja no mapa.</li>
                    <li>Clique em <strong>Compartilhar</strong> → <strong>Copiar link</strong>.</li>
                    <li>Cole no campo abaixo.</li>
                  </ol>
                </div>
                <p className="text-stone-500 dark:text-slate-400">
                  Pode colar o link curto (maps.app.goo.gl) — a gente resolve o
                  ponto ao salvar. Também dá para colar as coordenadas no formato{" "}
                  <strong>-23.55, -46.63</strong>.
                </p>
              </div>
            </details>

            <input
              type="url"
              value={locationUrl}
              onChange={(e) => handleLocationUrlChange(e.target.value)}
              className="mt-2 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
              placeholder="Cole o link do Google Maps aqui"
            />
            {locationUrl.trim() &&
              (parseLatLng(locationUrl) ? (
                <p className="mt-1 text-xs font-medium text-green-600 dark:text-green-400">
                  Ponto do mapa detectado ✓
                </p>
              ) : isShortMapsLink(locationUrl) ? (
                <p className="mt-1 text-xs text-stone-500 dark:text-slate-400">
                  Link curto reconhecido. Ao salvar, vou buscar o ponto
                  automaticamente.
                </p>
              ) : (
                <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                  Não consegui ler o ponto desse link. Cole o link completo do
                  Google Maps ou as coordenadas (ex.: -23.55, -46.63).
                </p>
              ))}

            {/* Latitude/longitude — alternativa ao link (fica em sincronia com ele). */}
            <div className="mt-3">
              <p className="text-xs font-medium text-stone-600 dark:text-slate-300">
                Ou digite as coordenadas
              </p>

              {/* Atalho: abre o Maps já na loja (se tiver endereço) para pegar o ponto. */}
              <a
                href={
                  locationAddress.trim()
                    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                        locationAddress.trim()
                      )}`
                    : "https://www.google.com/maps"
                }
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1.5 inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700"
              >
                📍 Abrir o Google Maps para pegar as coordenadas
              </a>
              <p className="mt-1 text-[11px] text-stone-400 dark:text-slate-500">
                No mapa que abrir: <strong>toque e segure</strong> no ponto da loja
                (celular) ou <strong>clique com o botão direito</strong> (PC). As
                coordenadas aparecem — copie e cole nos campos abaixo.
              </p>

              <div className="mt-2 grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] text-stone-500 dark:text-slate-400">
                    Latitude
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={latStr}
                    onChange={(e) => handleCoordChange("lat", e.target.value)}
                    className="mt-0.5 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
                    placeholder="-23.55"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-stone-500 dark:text-slate-400">
                    Longitude
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={lngStr}
                    onChange={(e) => handleCoordChange("lng", e.target.value)}
                    className="mt-0.5 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
                    placeholder="-46.63"
                  />
                </div>
              </div>
              <p className="mt-1 text-[11px] text-stone-400 dark:text-slate-500">
                No Google Maps, toque no ponto e as coordenadas aparecem em cima
                (ex.: <strong>-23.55, -46.63</strong>).
              </p>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-stone-700 dark:text-slate-300">
              Foto da loja
            </label>
            <p className="mt-0.5 text-xs text-stone-500 dark:text-slate-400">
              A IA envia esta foto quando o cliente pede para ver a loja ou a
              localização.
            </p>
            {storePhotoUrl && (
              <div className="mt-2 flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={storePhotoUrl}
                  alt="Foto da loja"
                  className="h-20 w-20 rounded-lg border border-stone-200 object-cover dark:border-slate-700"
                />
                <button
                  type="button"
                  onClick={() => setStorePhotoUrl("")}
                  className="text-xs font-medium text-red-600 hover:underline dark:text-red-400"
                >
                  Remover
                </button>
              </div>
            )}
            <label className="mt-2 inline-flex cursor-pointer items-center rounded-lg border border-stone-300 px-3 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800">
              {photoUploading
                ? "Enviando…"
                : storePhotoUrl
                ? "Trocar foto"
                : "Enviar foto"}
              <input
                type="file"
                accept="image/*"
                disabled={photoUploading}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handlePhotoUpload(file);
                  e.target.value = "";
                }}
                className="hidden"
              />
            </label>
          </div>

          <div>
            <label className="block text-sm font-medium text-stone-700 dark:text-slate-300">
              Vídeo da loja
            </label>
            <p className="mt-0.5 text-xs text-stone-500 dark:text-slate-400">
              A IA envia este vídeo quando o cliente pede para ver a loja ou os
              produtos. Use um vídeo curto (máx. 16 MB).
            </p>
            {storeVideoUrl && (
              <div className="mt-2 flex items-center gap-3">
                <video
                  src={storeVideoUrl}
                  controls
                  className="h-24 w-40 rounded-lg border border-stone-200 object-cover dark:border-slate-700"
                />
                <button
                  type="button"
                  onClick={() => setStoreVideoUrl("")}
                  className="text-xs font-medium text-red-600 hover:underline dark:text-red-400"
                >
                  Remover
                </button>
              </div>
            )}
            <label className="mt-2 inline-flex cursor-pointer items-center rounded-lg border border-stone-300 px-3 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800">
              {videoUploading
                ? "Enviando…"
                : storeVideoUrl
                ? "Trocar vídeo"
                : "Enviar vídeo"}
              <input
                type="file"
                accept="video/*"
                disabled={videoUploading}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleVideoUpload(file);
                  e.target.value = "";
                }}
                className="hidden"
              />
            </label>
          </div>
        </div>
        )}

        <div>
          <label className="block text-sm font-medium text-stone-700 dark:text-slate-300">
            Quando você responder um cliente pelo WhatsApp
          </label>
          <p className="mt-0.5 text-xs text-stone-500 dark:text-slate-400">
            Assim que você mandar uma mensagem para um cliente, a IA pausa o
            atendimento dele e só volta quando esse tempo terminar.
          </p>
          <select
            value={handoffMinutes}
            onChange={(e) => setHandoffMinutes(Number(e.target.value))}
            className="mt-2 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 sm:w-64"
          >
            {HANDOFF_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.value === 0 ? o.label : `Pausar a IA por ${o.label}`}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-stone-700 dark:text-slate-300">
            Cutucar quem ficou sem responder
          </label>
          <p className="mt-0.5 text-xs text-stone-500 dark:text-slate-400">
            Se o cliente ficar esse tempo sem responder, a IA manda uma mensagem
            puxando para fechar o pedido.
          </p>
          <select
            value={followupMinutes}
            onChange={(e) => setFollowupMinutes(Number(e.target.value))}
            className="mt-2 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 sm:w-64"
          >
            {FOLLOWUP_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.value === 0 ? o.label : `Após ${o.label} sem resposta`}
              </option>
            ))}
          </select>
          {followupMinutes > 0 && (
            <textarea
              value={followupMessage}
              maxLength={1000}
              onChange={(e) => setFollowupMessage(e.target.value)}
              rows={3}
              className="mt-2 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
              placeholder="Mensagem fixa (opcional). Deixe vazio para a IA escrever sozinha com base na conversa. Ex.: Oi! Ainda quer fechar seu pedido? Posso te ajudar 😊"
            />
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-stone-700 dark:text-slate-300">
            Pós-venda: saber se o pedido chegou
          </label>
          <p className="mt-0.5 text-xs text-stone-500 dark:text-slate-400">
            Esse tempo depois de cada pedido, a IA manda uma mensagem no WhatsApp
            do cliente perguntando se chegou tudo certinho.
          </p>
          <select
            value={postsaleDays}
            onChange={(e) => setPostsaleDays(Number(e.target.value))}
            className="mt-2 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 sm:w-64"
          >
            {POSTSALE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.value === 0 ? o.label : `${o.label} após o pedido`}
              </option>
            ))}
          </select>
          {postsaleDays > 0 && (
            <textarea
              value={postsaleMessage}
              maxLength={1000}
              onChange={(e) => setPostsaleMessage(e.target.value)}
              rows={3}
              className="mt-2 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
              placeholder="Mensagem fixa (opcional). Deixe vazio para a IA escrever sozinha. Ex.: Oi! Aqui é da loja 😊 Seu pedido chegou certinho? Qualquer coisa é só chamar!"
            />
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-stone-700 dark:text-slate-300">
            Recuperar carrinho abandonado
          </label>
          <p className="mt-0.5 text-xs text-stone-500 dark:text-slate-400">
            Se o cliente montar o carrinho na loja e informar nome + WhatsApp, mas
            não finalizar, a IA cutuca depois desse tempo lembrando os itens.
            Funciona só para quem deixou o WhatsApp.
          </p>
          <select
            value={cartMinutes}
            onChange={(e) => setCartMinutes(Number(e.target.value))}
            className="mt-2 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 sm:w-64"
          >
            {CART_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.value === 0 ? o.label : `Após ${o.label} parado`}
              </option>
            ))}
          </select>
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
      )}

      {/* Pausar atendimento */}
      {tab === "pausar" && (
      <section className="rounded-2xl border border-stone-200 bg-white dark:border-slate-800 dark:bg-slate-900 p-5 shadow-sm space-y-5">
        <div>
          <h2 className="font-semibold text-stone-800 dark:text-slate-100">
            Pausar atendimento
          </h2>
          <p className="mt-1 text-sm text-stone-500 dark:text-slate-400">
            Assuma a conversa quando quiser. Você pode pausar a IA para todos os
            clientes ou só para um número específico.
          </p>
        </div>

        {/* Pausa global */}
        <div className="rounded-xl border border-stone-200 dark:border-slate-700 p-4">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-medium text-stone-700 dark:text-slate-200">
              IA para todos os clientes
            </span>
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                globalPause.paused
                  ? "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300"
                  : "bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-300"
              }`}
            >
              {globalPause.paused
                ? `Pausada (${formatUntil(globalPause.until)})`
                : "Ativa"}
            </span>
          </div>

          {globalPause.paused ? (
            <button
              onClick={resumeGlobal}
              disabled={pauseBusy}
              className="mt-3 rounded-lg bg-violet-700 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-800 disabled:opacity-60"
            >
              Reativar a IA agora
            </button>
          ) : (
            <div className="mt-3">
              <p className="mb-2 text-xs text-stone-500 dark:text-slate-400">
                Pausar a IA por:
              </p>
              <div className="flex flex-wrap gap-2">
                {PAUSE_DURATIONS.map((d) => (
                  <button
                    key={d.label}
                    onClick={() => pauseGlobal(d.minutes)}
                    disabled={pauseBusy}
                    className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-60 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Pausa por cliente */}
        <div className="rounded-xl border border-stone-200 dark:border-slate-700 p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-medium text-stone-700 dark:text-slate-200">
              Clientes
            </span>
            <label className="flex items-center gap-2 text-xs text-stone-500 dark:text-slate-400">
              Pausar por:
              <select
                value={customerDuration ?? ""}
                onChange={(e) =>
                  setCustomerDuration(
                    e.target.value === "" ? null : Number(e.target.value)
                  )
                }
                className="rounded-lg border border-stone-300 px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              >
                {PAUSE_DURATIONS.map((d) => (
                  <option key={d.label} value={d.minutes ?? ""}>
                    {d.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {customerRows.length > 0 ? (
            <ul className="divide-y divide-stone-100 dark:divide-slate-800">
              {customerRows.map((c) => (
                <li
                  key={c.phone}
                  className="flex items-center justify-between gap-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium text-stone-800 dark:text-slate-100">
                        {c.phone}
                      </p>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          customerStatus(c.pause).cls
                        }`}
                      >
                        {customerStatus(c.pause).label}
                      </span>
                    </div>
                    {c.pause ? (
                      <p className="text-xs text-amber-600 dark:text-amber-400">
                        Pausado {formatUntil(c.pause.pausedUntil)}
                        {c.pause.reason === "handoff" ? " · você respondeu" : ""}
                      </p>
                    ) : c.lastMessage ? (
                      <p className="truncate text-xs text-stone-500 dark:text-slate-400">
                        {c.lastMessage}
                      </p>
                    ) : null}
                  </div>
                  {c.pause ? (
                    <button
                      onClick={() => resumeCustomer(c.phone)}
                      disabled={pauseBusy}
                      className="shrink-0 rounded-lg border border-stone-300 px-3 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-60 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      Reativar
                    </button>
                  ) : (
                    <button
                      onClick={() => pauseCustomer(c.phone, customerDuration)}
                      disabled={pauseBusy}
                      className="shrink-0 rounded-lg bg-violet-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-800 disabled:opacity-60"
                    >
                      Pausar
                    </button>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-stone-500 dark:text-slate-400">
              Nenhuma conversa ainda. Quando um cliente falar com a loja, ele
              aparece aqui para você pausar.
            </p>
          )}

          {/* Pausar um número que ainda não apareceu */}
          <div className="border-t border-stone-100 pt-3 dark:border-slate-800">
            <p className="mb-2 text-xs text-stone-500 dark:text-slate-400">
              Pausar um número que ainda não apareceu na lista:
            </p>
            <div className="flex gap-2">
              <input
                type="tel"
                value={newPausePhone}
                onChange={(e) => setNewPausePhone(e.target.value)}
                placeholder="Número com DDD"
                className="flex-1 rounded-lg border border-stone-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
              />
              <button
                onClick={pauseManualCustomer}
                disabled={pauseBusy}
                className="shrink-0 rounded-lg border border-stone-300 px-3 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-60 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Pausar
              </button>
            </div>
          </div>
        </div>
      </section>
      )}
    </div>
  );
}
