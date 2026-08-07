"use client";

import CrmTabs from "@/components/dashboard/CrmTabs";
import CrmFunnelBoard from "@/components/dashboard/CrmFunnelBoard";

export default function FunilPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
        Funil de vendas
      </h1>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        Arraste o cliente de uma etapa para a outra conforme a conversa avança.
        No celular, segure o card por um instante para começar a arrastar.
      </p>

      <div className="mt-4">
        <CrmTabs />
      </div>

      <div className="mt-4">
        <CrmFunnelBoard />
      </div>
    </div>
  );
}
