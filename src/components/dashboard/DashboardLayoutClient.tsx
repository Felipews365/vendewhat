"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function navItemClass(active: boolean) {
  return [
    "inline-flex items-center whitespace-nowrap text-base sm:text-lg font-bold tracking-tight transition-colors border-b-[3px] pb-1 -mb-px",
    active
      ? "text-landing-primary border-landing-primary"
      : "text-slate-600 border-transparent hover:text-landing-primary hover:border-teal-200/80",
  ].join(" ");
}

export function DashboardLayoutClient({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState("");

  const loadSession = useCallback(async () => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      router.push("/login");
      return;
    }
    setUserName(user.user_metadata?.name || user.email?.split("@")[0] || "Usuário");
    setLoading(false);
  }, [router]);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin w-8 h-8 border-4 border-landing-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  const isPainel = pathname === "/dashboard";
  const isCompartilhar = pathname === "/dashboard/compartilhar";
  const isMontar = pathname === "/dashboard/configuracoes";
  const isPedidos = pathname === "/dashboard/pedidos";
  const isConta = pathname === "/dashboard/conta";

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 pt-4 pb-0">
          <div className="flex items-center justify-between gap-4 pb-3">
            <Link href="/dashboard" className="text-xl font-bold text-slate-800 shrink-0">
              VendeWhat
            </Link>
            <div className="flex items-center gap-3 sm:gap-4 min-w-0">
              <span className="text-sm text-slate-600 hidden sm:block truncate">
                Olá, <strong>{userName.split(" ")[0]}</strong>
              </span>
              <button
                type="button"
                onClick={handleLogout}
                className="text-sm text-slate-500 hover:text-red-600 transition-colors shrink-0"
              >
                Sair
              </button>
            </div>
          </div>

          <nav
            className="flex flex-wrap gap-x-4 gap-y-2 sm:gap-x-7 border-t border-slate-100 pt-3 pb-3 -mb-px overflow-x-auto"
            aria-label="Áreas do painel"
          >
            <Link href="/dashboard" className={navItemClass(isPainel)}>
              Painel da loja
            </Link>
            <Link href="/dashboard/configuracoes" className={navItemClass(isMontar)}>
              Montar sua loja
            </Link>
            <Link
              href="/dashboard/compartilhar"
              className={navItemClass(isCompartilhar)}
            >
              Compartilhar sua loja
            </Link>
            <Link href="/dashboard/pedidos" className={navItemClass(isPedidos)}>
              Pedidos
            </Link>
            <Link href="/dashboard/conta" className={navItemClass(isConta)}>
              Conta
            </Link>
          </nav>
        </div>
      </header>

      {children}
    </div>
  );
}
