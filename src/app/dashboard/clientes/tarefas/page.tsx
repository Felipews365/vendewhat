"use client";

import CrmTabs from "@/components/dashboard/CrmTabs";
import CrmTasksClient from "@/components/dashboard/CrmTasksClient";

export default function TarefasPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
        Tarefas
      </h1>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        O que você não pode esquecer — e as automações que organizam sua base
        sozinhas.
      </p>

      <div className="mt-4">
        <CrmTabs />
      </div>

      <CrmTasksClient />
    </div>
  );
}
