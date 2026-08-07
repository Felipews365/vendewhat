"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Abas do CRM. Duas visões da MESMA base: a lista (quem são) e o funil (em que
 * pé está cada um). Só entram abas cujas páginas existem — navegação apontando
 * para o que ainda não foi construído é pior do que não ter a aba.
 */
const CRM_TABS: { href: string; label: string }[] = [
  { href: "/dashboard/clientes", label: "Clientes" },
  { href: "/dashboard/clientes/funil", label: "Funil" },
  { href: "/dashboard/clientes/campanhas", label: "Campanhas" },
  { href: "/dashboard/clientes/tarefas", label: "Tarefas" },
];

export default function CrmTabs() {
  const pathname = usePathname();

  return (
    // `flex-wrap`: com 4 abas o controle estouraria a largura no celular, e
    // rolagem lateral aqui esconderia abas inteiras.
    <div className="inline-flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-white p-1 text-sm font-semibold dark:border-slate-700 dark:bg-slate-900">
      {CRM_TABS.map((t) => {
        const active = pathname === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={
              "rounded-lg px-4 py-1.5 transition-colors " +
              (active
                ? "bg-landing-primary text-white"
                : "text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800")
            }
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
