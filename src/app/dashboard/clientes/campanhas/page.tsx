"use client";

import CrmTabs from "@/components/dashboard/CrmTabs";
import CrmCampaignsClient from "@/components/dashboard/CrmCampaignsClient";

export default function CampanhasPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
        Campanhas
      </h1>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        Mande uma mensagem para um grupo de clientes de uma vez — para reativar
        quem sumiu ou avisar de uma novidade.
      </p>

      <div className="mt-4">
        <CrmTabs />
      </div>

      <CrmCampaignsClient />
    </div>
  );
}
