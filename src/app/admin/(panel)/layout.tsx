import { redirect } from "next/navigation";
import Link from "next/link";
import type { ReactNode } from "react";
import { requireAdmin } from "@/lib/admin";
import { ThemeToggle } from "@/components/ThemeToggle";
import AdminLogoutButton from "./AdminLogoutButton";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const admin = await requireAdmin();
  if (!admin) redirect("/admin/login");

  // Fundo da PÁGINA: slate-950 (não o slate-800 dos cards), para os cards
  // destacarem do fundo — mesmo padrão do painel do lojista.
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <header className="sticky top-0 z-20 border-b border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-6">
            <Link href="/admin" className="text-lg font-extrabold tracking-tight text-slate-900 dark:text-slate-100">
              Admin <span className="text-landing-primary">VendeWhat</span>
            </Link>
            <nav className="flex items-center gap-1 text-sm font-semibold">
              <Link
                href="/admin"
                className="rounded-lg px-3 py-1.5 text-slate-600 dark:text-slate-300 transition hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100"
              >
                Clientes
              </Link>
              <Link
                href="/admin/planos"
                className="rounded-lg px-3 py-1.5 text-slate-600 dark:text-slate-300 transition hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100"
              >
                Planos
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-slate-400 dark:text-slate-500 sm:inline">{admin.email}</span>
            {/* Mesmo componente do painel do lojista: alterna a classe `dark` no
                <html> e persiste em localStorage (`vw-theme`). O script anti-flash
                do layout raiz já cobre o /admin, então não há piscada ao carregar. */}
            <ThemeToggle />
            <AdminLogoutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
