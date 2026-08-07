"use client";

import { Suspense } from "react";
import CrmCustomersClient from "@/components/dashboard/CrmCustomersClient";

export default function ClientesPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-4xl px-4 py-16 text-center text-slate-500 dark:text-slate-400">
          Carregando…
        </div>
      }
    >
      <CrmCustomersClient />
    </Suspense>
  );
}
