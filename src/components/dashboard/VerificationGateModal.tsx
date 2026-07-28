"use client";

/**
 * Aviso que aparece assim que o dono da loja acessa o painel, convidando-o a
 * enviar os dados de verificação de identidade (KYC). É um MODAL (mais forte que
 * a caixinha lateral do painel inicial), mostrado **uma vez por sessão** para não
 * atrapalhar a navegação, e só quando a conta **ainda não foi verificada** (status
 * `none`) ou foi **recusada** (`rejected`). Não bloqueia nada — só convida.
 */

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { VerificationStatus } from "@/lib/storeVerification";

const SESSION_KEY = "vw-verif-modal-seen";

export function VerificationGateModal() {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<VerificationStatus>("none");

  useEffect(() => {
    // Já vista nesta sessão, ou já está na própria tela de verificação → não abre.
    let seen = false;
    try {
      seen = sessionStorage.getItem(SESSION_KEY) === "1";
    } catch {
      /* sessionStorage indisponível */
    }
    if (seen || pathname?.startsWith("/dashboard/verificacao")) return;

    let alive = true;
    fetch("/api/store/verification", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (!alive || !d?.ok) return;
        const s = (d.status as VerificationStatus) ?? "none";
        setStatus(s);
        if (s === "none" || s === "rejected") setOpen(true);
      })
      .catch(() => {
        /* silencioso — o modal só não aparece */
      });
    return () => {
      alive = false;
    };
    // Roda uma vez por carga de painel (o pathname inicial basta).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function dismiss() {
    try {
      sessionStorage.setItem(SESSION_KEY, "1");
    } catch {
      /* ignore */
    }
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) return null;

  const rejected = status === "rejected";

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="verif-modal-title"
    >
      <button
        type="button"
        aria-label="Fechar"
        onClick={dismiss}
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
      />

      <div className="vw-pop-in relative w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-violet-100 text-3xl dark:bg-violet-950/50">
          🛡️
        </div>
        <h2
          id="verif-modal-title"
          className="mt-4 text-center text-lg font-bold text-slate-900 dark:text-slate-100"
        >
          {rejected ? "Atualize seu cadastro" : "Confirme sua identidade"}
        </h2>
        <p className="mt-2 text-center text-sm text-slate-600 dark:text-slate-300">
          {rejected
            ? "Sua verificação precisa de ajustes. Reenvie seus dados e a foto do documento para concluir."
            : "Para deixar sua loja mais segura e confiável, precisamos que você envie seus dados e uma foto do documento. Leva menos de 2 minutos."}
        </p>

        <div className="mt-6 flex flex-col gap-2">
          <button
            type="button"
            onClick={() => {
              dismiss();
              router.push("/dashboard/verificacao");
            }}
            className="w-full rounded-xl bg-landing-primary px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-landing-accent"
          >
            Preencher meus dados agora
          </button>
          <button
            type="button"
            onClick={dismiss}
            className="w-full rounded-xl px-5 py-2.5 text-sm font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            Agora não
          </button>
        </div>
      </div>
    </div>
  );
}
