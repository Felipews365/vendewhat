"use client";

import { useState } from "react";
import {
  VERIFICATION_STATUS_LABEL,
  formatCpf,
  type VerificationStatus,
} from "@/lib/storeVerification";
import type { StoreVerificationDetail } from "@/lib/adminData";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR");
}

function formatBirth(iso: string | null): string {
  if (!iso) return "—";
  // Vem como YYYY-MM-DD; evita fuso.
  const [y, m, d] = iso.split("-");
  return y && m && d ? `${d}/${m}/${y}` : iso;
}

function Photo({ label, url }: { label: string; url: string | null }) {
  if (!url) {
    return (
      <div className="flex aspect-[4/3] items-center justify-center rounded-xl border border-dashed border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-xs text-slate-400 dark:text-slate-500">
        {label} — não enviado
      </div>
    );
  }
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="group block">
      <span className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">{label}</span>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={label}
        className="aspect-[4/3] w-full rounded-xl border border-slate-200 dark:border-slate-800 object-cover transition group-hover:opacity-90"
      />
      <span className="mt-1 block text-[11px] text-slate-400 dark:text-slate-500 group-hover:text-slate-600">
        Abrir em tamanho real ↗
      </span>
    </a>
  );
}

export default function VerificationCard({
  storeId,
  detail,
}: {
  storeId: string;
  detail: StoreVerificationDetail;
}) {
  const [status, setStatus] = useState<VerificationStatus>(detail.status);
  const [notes, setNotes] = useState(detail.reviewNotes ?? "");
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function review(action: "approve" | "reject") {
    if (action === "reject" && !notes.trim()) {
      setMsg("Escreva o motivo antes de recusar.");
      return;
    }
    setBusy(action);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId, action, notes: notes.trim() || null }),
      });
      const data = await res.json();
      if (data.ok) {
        setStatus(data.status as VerificationStatus);
        setMsg(action === "approve" ? "Verificação aprovada." : "Verificação recusada.");
      } else {
        setMsg(data.error || "Não foi possível salvar.");
      }
    } catch {
      setMsg("Falha ao salvar.");
    } finally {
      setBusy(null);
    }
  }

  const badge = VERIFICATION_STATUS_LABEL[status];

  return (
    <div className="mt-6 rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">Verificação de identidade</h2>
        <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${badge.cls}`}>
          {badge.label}
        </span>
      </div>

      {status === "none" ? (
        <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
          O dono desta loja ainda não enviou os dados de verificação.
        </p>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-xl bg-slate-50 dark:bg-slate-800 p-4 text-sm">
              <dl className="space-y-1.5">
                <Row label="Nome" value={detail.fullName} />
                <Row label="CPF" value={detail.cpf ? formatCpf(detail.cpf) : null} />
                <Row label="Nascimento" value={formatBirth(detail.birthDate)} />
                <Row label="Endereço" value={detail.address} />
                <Row label="Enviado em" value={formatDate(detail.submittedAt)} />
                {detail.reviewedAt && (
                  <Row
                    label="Revisado"
                    value={`${formatDate(detail.reviewedAt)}${detail.reviewedBy ? ` · ${detail.reviewedBy}` : ""}`}
                  />
                )}
              </dl>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Photo label="Selfie" url={detail.selfieUrl} />
              <Photo label="Doc. frente" url={detail.docFrontUrl} />
              <Photo label="Doc. verso" url={detail.docBackUrl} />
            </div>
          </div>

          <div className="mt-4">
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
              Observação da revisão (obrigatória para recusar)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Ex.: foto do documento ilegível, dados não conferem…"
              className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
            />
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              onClick={() => review("approve")}
              disabled={busy !== null || status === "approved"}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
            >
              {busy === "approve" ? "Aprovando…" : "Aprovar"}
            </button>
            <button
              onClick={() => review("reject")}
              disabled={busy !== null || status === "rejected"}
              className="rounded-lg border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-700 dark:text-red-300 transition hover:bg-red-100 disabled:opacity-50"
            >
              {busy === "reject" ? "Recusando…" : "Recusar"}
            </button>
            {msg && <span className="text-xs font-medium text-slate-600 dark:text-slate-300">{msg}</span>}
          </div>
        </>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex gap-2">
      <dt className="w-24 shrink-0 text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
        {label}
      </dt>
      <dd className="text-slate-800 dark:text-slate-200">{value || "—"}</dd>
    </div>
  );
}
