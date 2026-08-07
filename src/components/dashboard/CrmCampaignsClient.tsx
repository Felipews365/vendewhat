"use client";

import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/Toast";
import { CRM_SEGMENTS, segmentById, type SegmentId } from "@/lib/crm/segments";

type Campaign = {
  id: string;
  name: string;
  message: string;
  status: string;
  total: number;
  sent: number;
  failed: number;
  created_at: string;
  finished_at: string | null;
};

type TargetRow = {
  id: string;
  name: string;
  wa_phone: string;
  status: string;
  sent_at: string | null;
  error: string | null;
};

type Preview = {
  total: number;
  dias: number;
  porDia: number;
  excluidos: {
    semHistorico: number;
    optOut: number;
    recente: number;
    semTelefone: number;
  };
};

const STATUS_CHIP: Record<string, { label: string; cls: string }> = {
  rascunho: {
    label: "Rascunho",
    cls: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  },
  enviando: {
    label: "Enviando",
    cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
  },
  pausada: {
    label: "Pausada",
    cls: "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300",
  },
  concluida: {
    label: "Concluída",
    cls: "bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300",
  },
  cancelada: {
    label: "Cancelada",
    cls: "bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300",
  },
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

export default function CrmCampaignsClient() {
  const { showToast } = useToast();

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [connected, setConnected] = useState(true);
  const [loading, setLoading] = useState(true);

  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [segment, setSegment] = useState<SegmentId>("compraram");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [saving, setSaving] = useState(false);

  const [openId, setOpenId] = useState<string | null>(null);
  const [targets, setTargets] = useState<TargetRow[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/crm/campaigns");
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        campaigns?: Campaign[];
        connected?: boolean;
        error?: string;
      };
      if (!res.ok || !j.ok) {
        showToast(j.error ?? "Não foi possível carregar as campanhas.", "error");
        return;
      }
      setCampaigns(j.campaigns ?? []);
      setConnected(Boolean(j.connected));
    } catch {
      showToast("Não foi possível carregar as campanhas.", "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    load();
  }, [load]);

  // Enquanto há campanha enviando, atualiza sozinho (o envio é lento e
  // acontece no cron — sem isto o lojista fica no F5).
  useEffect(() => {
    const running = campaigns.some((c) => c.status === "enviando");
    if (!running) return;
    const t = setInterval(load, 20_000);
    return () => clearInterval(t);
  }, [campaigns, load]);

  // Prévia do público: sempre que o segmento muda no formulário.
  useEffect(() => {
    if (!creating) return;
    let alive = true;
    (async () => {
      const res = await fetch(`/api/crm/campaigns?preview=1&segment=${segment}`);
      const j = (await res.json().catch(() => ({}))) as { preview?: Preview };
      if (alive) setPreview(j.preview ?? null);
    })();
    return () => {
      alive = false;
    };
  }, [creating, segment]);

  async function createCampaign() {
    setSaving(true);
    try {
      const res = await fetch("/api/crm/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, message, segment }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        total?: number;
        error?: string;
      };
      if (!res.ok || !j.ok) {
        showToast(j.error ?? "Não foi possível criar a campanha.", "error");
        return;
      }
      showToast(`Campanha criada para ${j.total} cliente(s).`);
      setCreating(false);
      setName("");
      setMessage("");
      await load();
    } catch {
      showToast("Não foi possível criar a campanha.", "error");
    } finally {
      setSaving(false);
    }
  }

  async function act(id: string, action: string) {
    const res = await fetch(`/api/crm/campaigns/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!res.ok || !j.ok) {
      showToast(j.error ?? "Não foi possível atualizar.", "error");
      return;
    }
    if (action === "teste") showToast("Teste enviado para o WhatsApp da loja.");
    await load();
  }

  async function openDetail(id: string) {
    setOpenId(id === openId ? null : id);
    if (id === openId) return;
    const res = await fetch(`/api/crm/campaigns/${id}`);
    const j = (await res.json().catch(() => ({}))) as { targets?: TargetRow[] };
    setTargets(j.targets ?? []);
  }

  return (
    <>
      {/* O aviso vem ANTES do botão: quem nunca disparou não sabe do risco. */}
      <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/60 dark:bg-amber-950/30">
        <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
          ⚠️ Disparo em massa pode fazer o WhatsApp bloquear seu número
        </p>
        <p className="mt-1 text-xs leading-relaxed text-amber-800 dark:text-amber-300">
          E o número bloqueado leva junto o atendimento da IA. Por isso enviamos
          devagar: no máximo <strong>60 mensagens por dia</strong>, entre 8h e
          20h, com intervalo entre cada uma, e só para quem{" "}
          <strong>já falou com você ou já comprou</strong>. Quem responder SAIR
          para de receber automaticamente.
        </p>
      </div>

      {!connected && (
        <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-4 text-center dark:border-slate-700 dark:bg-slate-900">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Conecte o WhatsApp da loja para disparar campanhas.
          </p>
          <a
            href="/dashboard/ia"
            className="mt-3 inline-block rounded-xl bg-landing-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
          >
            Conectar agora
          </a>
        </div>
      )}

      {connected && !creating && (
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="mt-3 w-full rounded-xl bg-landing-primary py-3 font-semibold text-white hover:opacity-90 sm:w-auto sm:px-6"
        >
          + Nova campanha
        </button>
      )}

      {/* Formulário */}
      {creating && (
        <div className="mt-3 space-y-4 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <div>
            <label className="block text-sm font-semibold text-slate-900 dark:text-slate-100">
              Nome da campanha
            </label>
            <p className="mb-1.5 text-xs text-slate-500 dark:text-slate-400">
              Só para você se achar depois.
            </p>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              placeholder="Ex.: Promoção de julho"
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-900 dark:text-slate-100">
              Para quem
            </label>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {CRM_SEGMENTS.filter((s) => s.id !== "nunca_compraram").map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSegment(s.id)}
                  className={
                    "rounded-full px-3 py-1.5 text-sm font-semibold transition-colors " +
                    (segment === s.id
                      ? "bg-landing-primary text-white"
                      : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300")
                  }
                >
                  {s.label}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
              {segmentById(segment).hint}
            </p>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-900 dark:text-slate-100">
              Mensagem
            </label>
            <p className="mb-1.5 text-xs text-slate-500 dark:text-slate-400">
              Escreva <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">{"{nome}"}</code>{" "}
              onde entra o nome do cliente. É obrigatório — mensagens idênticas
              em massa fazem o WhatsApp bloquear o número.
            </p>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={900}
              rows={4}
              placeholder="Oi {nome}! Chegaram novidades na loja e separei uma condição especial pra você. Quer ver?"
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
            {message.trim() && (
              <div className="mt-2 rounded-xl bg-[#d9fdd3] p-3 text-sm text-slate-800 dark:bg-emerald-950/40 dark:text-slate-100">
                <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Como o cliente vê
                </p>
                <p className="whitespace-pre-wrap">
                  {message.replace(/\{nome\}/gi, "Maria")}
                  {"\n\nResponda SAIR para não receber mais."}
                </p>
              </div>
            )}
          </div>

          {/* Estimativa honesta */}
          {preview && (
            <div className="rounded-xl bg-slate-50 p-3 text-xs dark:bg-slate-800">
              {preview.total === 0 ? (
                <p className="text-slate-600 dark:text-slate-300">
                  Ninguém desse público pode receber agora.
                </p>
              ) : (
                <p className="text-slate-700 dark:text-slate-200">
                  <strong>{preview.total} cliente(s)</strong> vão receber — cerca
                  de <strong>{preview.dias} dia(s)</strong>, porque enviamos no
                  máximo {preview.porDia} por dia.
                </p>
              )}
              {(preview.excluidos.semHistorico > 0 ||
                preview.excluidos.optOut > 0 ||
                preview.excluidos.recente > 0) && (
                <p className="mt-1 text-slate-500 dark:text-slate-400">
                  Fora:{" "}
                  {[
                    preview.excluidos.semHistorico > 0 &&
                      `${preview.excluidos.semHistorico} sem histórico`,
                    preview.excluidos.recente > 0 &&
                      `${preview.excluidos.recente} receberam há pouco`,
                    preview.excluidos.optOut > 0 &&
                      `${preview.excluidos.optOut} pediram para sair`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              )}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={createCampaign}
              disabled={saving || !preview || preview.total === 0}
              className="flex-1 rounded-xl bg-landing-primary py-3 font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              {saving ? "Criando…" : "Criar e começar a enviar"}
            </button>
            <button
              type="button"
              onClick={() => setCreating(false)}
              className="rounded-xl bg-slate-100 px-5 py-3 font-medium text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Lista */}
      <div className="mt-4 space-y-2">
        {loading && (
          <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
            Carregando…
          </p>
        )}

        {!loading && campaigns.length === 0 && !creating && (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center dark:border-slate-700 dark:bg-slate-900">
            <div className="text-4xl">📣</div>
            <p className="mt-4 text-sm text-slate-600 dark:text-slate-300">
              Nenhuma campanha ainda. Crie uma para reativar quem sumiu ou
              avisar seus clientes de uma novidade.
            </p>
          </div>
        )}

        {campaigns.map((c) => {
          const chip = STATUS_CHIP[c.status] ?? STATUS_CHIP.rascunho;
          const pct = c.total > 0 ? Math.round((c.sent / c.total) * 100) : 0;
          const open = openId === c.id;
          return (
            <div
              key={c.id}
              className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate font-semibold text-slate-900 dark:text-slate-100">
                      {c.name}
                    </h3>
                    <span
                      className={
                        "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase " +
                        chip.cls
                      }
                    >
                      {chip.label}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    {formatDate(c.created_at)} · {c.sent} de {c.total} enviadas
                    {c.failed > 0 ? ` · ${c.failed} falharam` : ""}
                  </p>
                </div>
              </div>

              {/* Progresso */}
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <div
                  className="h-full rounded-full bg-landing-primary transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {c.status === "enviando" && (
                  <button
                    type="button"
                    onClick={() => act(c.id, "pausar")}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    Pausar
                  </button>
                )}
                {c.status === "pausada" && (
                  <button
                    type="button"
                    onClick={() => act(c.id, "retomar")}
                    className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
                  >
                    Retomar
                  </button>
                )}
                {(c.status === "enviando" || c.status === "pausada") && (
                  <button
                    type="button"
                    onClick={() => act(c.id, "cancelar")}
                    className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:border-rose-900 dark:hover:bg-rose-950/30"
                  >
                    Cancelar
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => act(c.id, "teste")}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  Enviar teste pra mim
                </button>
                <button
                  type="button"
                  onClick={() => openDetail(c.id)}
                  className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-500 underline hover:text-slate-700 dark:text-slate-400"
                >
                  {open ? "Ocultar" : "Ver detalhes"}
                </button>
              </div>

              {open && (
                <div className="mt-3 border-t border-slate-100 pt-3 dark:border-slate-800">
                  <p className="whitespace-pre-wrap rounded-lg bg-slate-50 p-2 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    {c.message}
                  </p>
                  {targets.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {targets.map((t) => (
                        <li
                          key={t.id}
                          className="flex items-center justify-between gap-2 text-xs"
                        >
                          <span className="truncate text-slate-600 dark:text-slate-300">
                            {t.name || t.wa_phone}
                          </span>
                          <span
                            className={
                              "shrink-0 " +
                              (t.status === "enviado"
                                ? "text-emerald-600 dark:text-emerald-400"
                                : t.status === "falhou"
                                  ? "text-rose-600 dark:text-rose-400"
                                  : "text-slate-400 dark:text-slate-500")
                            }
                          >
                            {t.status}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
