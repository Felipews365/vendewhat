"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ThemeToggle } from "@/components/ThemeToggle";
import {
  DASH_NAV_ICONS,
  type DashNavIconKey,
} from "@/components/icons/DashboardNavIcons";

const DASH_NAV: readonly {
  href: string;
  /** Texto curto exibido na navegação */
  short: string;
  /** Acessibilidade / title */
  label: string;
  icon: DashNavIconKey;
}[] = [
  { href: "/dashboard", short: "Painel", label: "Painel da loja", icon: "painel" },
  { href: "/dashboard/configuracoes", short: "Loja", label: "Montar sua loja", icon: "loja" },
  {
    href: "/dashboard/compartilhar",
    short: "Compartilhar",
    label: "Compartilhar sua loja",
    icon: "compartilhar",
  },
  { href: "/dashboard/pedidos", short: "Pedidos", label: "Pedidos", icon: "pedidos" },
  {
    href: "/dashboard/whatsapp",
    short: "WhatsApp",
    label: "WhatsApp & IA",
    icon: "whatsapp",
  },
  { href: "/dashboard/conta", short: "Conta", label: "Conta", icon: "conta" },
];

function isActive(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Navegação horizontal — desktop (pílulas no topo). */
function TopNav({ pathname }: { pathname: string }) {
  return (
    <nav
      className="hidden lg:flex items-center gap-1"
      aria-label="Áreas do painel"
    >
      {DASH_NAV.map(({ href, short, label, icon }) => {
        const active = isActive(pathname, href);
        const Icon = DASH_NAV_ICONS[icon];
        return (
          <Link
            key={href}
            href={href}
            title={label}
            aria-label={label}
            aria-current={active ? "page" : undefined}
            className={[
              "group relative flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition-all duration-200",
              active
                ? "bg-violet-600 text-white shadow-md shadow-violet-600/30"
                : "text-slate-600 hover:bg-violet-50 hover:text-violet-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-violet-300",
            ].join(" ")}
          >
            <Icon
              className={[
                "h-5 w-5 transition-transform duration-200 group-hover:scale-110",
                active ? "text-white" : "",
              ].join(" ")}
            />
            <span>{short}</span>
          </Link>
        );
      })}
    </nav>
  );
}

/** Navegação inferior fixa — celular. */
function BottomNav({ pathname }: { pathname: string }) {
  return (
    <nav
      className="lg:hidden fixed bottom-0 inset-x-0 z-40 border-t border-slate-200/90 bg-white/95 backdrop-blur-md shadow-[0_-8px_24px_-12px_rgba(15,23,42,0.25)] dark:border-slate-800 dark:bg-slate-900/95"
      aria-label="Áreas do painel"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="mx-auto grid max-w-lg grid-cols-6">
        {DASH_NAV.map(({ href, short, label, icon }) => {
          const active = isActive(pathname, href);
          const Icon = DASH_NAV_ICONS[icon];
          return (
            <Link
              key={href}
              href={href}
              title={label}
              aria-label={label}
              aria-current={active ? "page" : undefined}
              className="group relative flex flex-col items-center gap-1 px-1 pt-2.5 pb-1.5"
            >
              <span
                className={[
                  "absolute top-0 h-0.5 rounded-full bg-violet-600 transition-all duration-300",
                  active ? "w-7 opacity-100" : "w-0 opacity-0",
                ].join(" ")}
                aria-hidden
              />
              <Icon
                className={[
                  "h-[22px] w-[22px] transition-all duration-200 group-active:scale-90",
                  active
                    ? "text-violet-600 dark:text-violet-300"
                    : "text-slate-400 dark:text-slate-500",
                ].join(" ")}
              />
              <span
                className={[
                  "text-[10px] font-semibold leading-none transition-colors",
                  active
                    ? "text-violet-600 dark:text-violet-300"
                    : "text-slate-400 dark:text-slate-500",
                ].join(" ")}
              >
                {short}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
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
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="animate-spin w-8 h-8 border-4 border-violet-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* Aurora animada de fundo */}
      <div
        className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
        aria-hidden
      >
        <div className="vw-aurora absolute -top-40 left-1/2 h-[480px] w-[820px] -translate-x-1/2 rounded-full bg-gradient-to-tr from-violet-300/40 via-fuchsia-300/30 to-sky-300/30 blur-3xl dark:from-violet-700/30 dark:via-fuchsia-700/20 dark:to-sky-700/20" />
      </div>

      <div className="flex min-h-screen flex-col">
        <header className="sticky top-0 z-30 border-b border-slate-200/90 bg-white/85 backdrop-blur-md shadow-sm shadow-slate-200/40 dark:border-slate-800 dark:bg-slate-900/80 dark:shadow-black/20">
          <div className="mx-auto flex max-w-6xl flex-nowrap items-center justify-between gap-3 px-4 py-3">
            <div className="flex items-center gap-6 min-w-0">
              <Link
                href="/dashboard"
                className="shrink-0 truncate text-xl font-bold tracking-tight text-slate-800 dark:text-slate-100"
              >
                Vende<span className="text-violet-600 dark:text-violet-400">What</span>
              </Link>
              <TopNav pathname={pathname} />
            </div>

            <div className="flex flex-none items-center gap-1.5 sm:gap-3">
              <span className="hidden truncate max-w-[160px] text-sm text-slate-600 dark:text-slate-300 sm:block">
                Olá,{" "}
                <strong className="text-slate-800 dark:text-slate-100">
                  {userName.split(" ")[0]}
                </strong>
              </span>
              <ThemeToggle />
              <button
                type="button"
                onClick={handleLogout}
                className="whitespace-nowrap rounded-xl px-3 py-2 text-sm font-medium text-slate-500 transition-colors hover:bg-red-50 hover:text-red-600 dark:text-slate-400 dark:hover:bg-red-950/40 dark:hover:text-red-400"
              >
                Sair
              </button>
            </div>
          </div>
        </header>

        {/* pb extra no celular para não ficar atrás da barra inferior */}
        <div key={pathname} className="vw-fade-in-up flex-1 pb-24 lg:pb-0">
          {children}
        </div>
      </div>

      <BottomNav pathname={pathname} />
    </div>
  );
}
