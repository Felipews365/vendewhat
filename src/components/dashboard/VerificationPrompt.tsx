"use client";

/**
 * Caixinha do painel inicial que convida o lojista a enviar/atualizar a
 * verificação de identidade. Aparece ao lado do card de WhatsApp & IA.
 *
 * Lê o status em `/api/store/verification` e adapta o texto (não enviado /
 * em análise / recusado / verificado). Não bloqueia nada — é só um convite.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import type { VerificationStatus } from "@/lib/storeVerification";

const COPY: Record<
  VerificationStatus,
  { icon: string; title: string; desc: string; cta: string; tone: string }
> = {
  none: {
    icon: "🛡️",
    title: "Verifique sua conta",
    desc: "Confirme sua identidade para deixar sua loja mais segura e confiável.",
    cta: "Fazer verificação →",
    tone: "border-violet-200 bg-violet-50 dark:border-violet-900 dark:bg-violet-950/30",
  },
  rejected: {
    icon: "⚠️",
    title: "Atualize seu cadastro",
    desc: "Sua verificação precisa de ajustes. Reenvie seus dados para concluir.",
    cta: "Atualizar cadastro →",
    tone: "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30",
  },
  pending: {
    icon: "⏳",
    title: "Verificação em análise",
    desc: "Recebemos seus dados. Você pode revisar ou reenviar se precisar.",
    cta: "Ver meu cadastro →",
    tone: "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30",
  },
  approved: {
    icon: "✅",
    title: "Conta verificada",
    desc: "Tudo certo! Se algum dado mudar, você pode atualizar quando quiser.",
    cta: "Atualizar dados →",
    tone: "border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/30",
  },
};

export function VerificationPrompt() {
  const [status, setStatus] = useState<VerificationStatus | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/store/verification", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (alive && d?.ok) setStatus((d.status as VerificationStatus) ?? "none");
      })
      .catch(() => {
        /* silencioso — a caixinha só não aparece */
      });
    return () => {
      alive = false;
    };
  }, []);

  if (!status) return null;
  const copy = COPY[status];

  return (
    <div className={`rounded-xl border p-6 shadow-sm ${copy.tone}`}>
      <div className="flex items-start gap-3">
        <span className="text-2xl">{copy.icon}</span>
        <div>
          <h2 className="font-semibold text-slate-800 dark:text-slate-100">{copy.title}</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{copy.desc}</p>
          <Link
            href="/dashboard/verificacao"
            className="mt-3 inline-block text-sm font-semibold text-landing-primary hover:text-landing-accent dark:text-violet-400 dark:hover:text-violet-300"
          >
            {copy.cta}
          </Link>
        </div>
      </div>
    </div>
  );
}
