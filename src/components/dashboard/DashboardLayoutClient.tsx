"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ThemeToggle } from "@/components/ThemeToggle";
import { AiStatusBanner } from "@/components/dashboard/AiStatusBanner";
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
    href: "/dashboard/ia",
    short: "Configuração da IA",
    label: "Configuração da IA",
    icon: "ia",
  },
  {
    href: "/dashboard/whatsapp",
    short: "Atendimento",
    label: "Atendimento (conversas)",
    icon: "whatsapp",
  },
  {
    href: "/dashboard/pagamentos",
    short: "Pagamentos",
    label: "Pagamentos da loja",
    icon: "pagamentos",
  },
  { href: "/dashboard/planos", short: "Planos", label: "Planos e assinatura", icon: "planos" },
  { href: "/dashboard/conta", short: "Conta", label: "Conta", icon: "conta" },
];

function ChevronIcon({ direction }: { direction: "left" | "right" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
      aria-hidden
    >
      {direction === "left" ? <path d="M15 6l-6 6 6 6" /> : <path d="M9 6l6 6-6 6" />}
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-[18px] w-[18px]"
      aria-hidden
    >
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-6 w-6"
      aria-hidden
    >
      <path d="M4 6h16" />
      <path d="M4 12h16" />
      <path d="M4 18h16" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
      aria-hidden
    >
      <path d="M18 6 6 18" />
      <path d="M6 6l12 12" />
    </svg>
  );
}

function isActive(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Navegação vertical — desktop (lateral fixa). */
function SideNav({
  pathname,
  collapsed,
}: {
  pathname: string;
  collapsed: boolean;
}) {
  return (
    <nav
      className="flex flex-col gap-1"
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
              "group relative flex items-center rounded-xl text-sm font-semibold transition-all duration-200",
              collapsed ? "justify-center px-0 py-2.5" : "gap-3 px-3 py-2.5",
              active
                ? "bg-violet-600 text-white shadow-md shadow-violet-600/30"
                : "text-slate-600 hover:bg-violet-50 hover:text-violet-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-violet-300",
            ].join(" ")}
          >
            <Icon
              className={[
                "h-5 w-5 shrink-0 transition-transform duration-200 group-hover:scale-110",
                active ? "text-white" : "",
              ].join(" ")}
            />
            {!collapsed && <span className="truncate">{short}</span>}
          </Link>
        );
      })}
    </nav>
  );
}

/** Gaveta de navegação — celular (menu hambúrguer). */
function MobileMenu({
  pathname,
  open,
  onClose,
  userName,
  onLogout,
}: {
  pathname: string;
  open: boolean;
  onClose: () => void;
  userName: string;
  onLogout: () => void;
}) {
  if (!open) return null;
  return (
    <div className="lg:hidden fixed inset-0 z-50">
      {/* Fundo escuro */}
      <button
        type="button"
        aria-label="Fechar menu"
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
      />

      {/* Painel lateral */}
      <div className="vw-fade-in-up absolute left-0 top-0 flex h-full w-72 max-w-[82%] flex-col border-r border-slate-200/90 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
        <div className="flex shrink-0 items-center justify-between px-5 py-4">
          <span className="text-xl font-bold tracking-tight text-slate-800 dark:text-slate-100">
            Vende<span className="text-violet-600 dark:text-violet-400">What</span>
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar menu"
            className="grid h-9 w-9 place-items-center rounded-xl text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <CloseIcon />
          </button>
        </div>

        <nav
          className="flex-1 space-y-1 overflow-y-auto px-3 py-2"
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
                onClick={onClose}
                className={[
                  "group relative flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold transition-colors",
                  active
                    ? "bg-violet-600 text-white shadow-md shadow-violet-600/30"
                    : "text-slate-600 hover:bg-violet-50 hover:text-violet-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-violet-300",
                ].join(" ")}
              >
                <Icon
                  className={[
                    "h-5 w-5 shrink-0",
                    active ? "text-white" : "",
                  ].join(" ")}
                />
                <span className="truncate">{short}</span>
              </Link>
            );
          })}
        </nav>

        <div className="shrink-0 border-t border-slate-200/90 px-3 py-3 dark:border-slate-800">
          <div className="flex items-center justify-between gap-2">
            <span className="min-w-0 truncate px-2 text-sm text-slate-600 dark:text-slate-300">
              Olá,{" "}
              <strong className="text-slate-800 dark:text-slate-100">
                {userName.split(" ")[0]}
              </strong>
            </span>
            <ThemeToggle />
          </div>
          <button
            type="button"
            onClick={() => {
              onClose();
              onLogout();
            }}
            className="mt-2 w-full rounded-xl px-3 py-2 text-left text-sm font-medium text-slate-500 transition-colors hover:bg-red-50 hover:text-red-600 dark:text-slate-400 dark:hover:bg-red-950/40 dark:hover:text-red-400"
          >
            Sair
          </button>
        </div>
      </div>
    </div>
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
  const [collapsed, setCollapsed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  // Fecha a gaveta ao navegar (troca de rota)
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  // Restaura a preferência de lateral recolhida (só desktop)
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem("vw-sidebar-collapsed") === "1");
    } catch {
      /* localStorage indisponível */
    }
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem("vw-sidebar-collapsed", next ? "1" : "0");
      } catch {
        /* localStorage indisponível */
      }
      return next;
    });
  }, []);

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

      <div className="flex min-h-screen">
        {/* Sidebar fixa — desktop (lg+) */}
        <aside
          className={[
            "relative hidden lg:flex sticky top-0 h-screen shrink-0 flex-col border-r border-slate-200/90 bg-white/85 backdrop-blur-md transition-[width] duration-200 ease-out dark:border-slate-800 dark:bg-slate-900/80",
            collapsed ? "w-[76px]" : "w-60",
          ].join(" ")}
        >
          <div
            className={[
              "flex shrink-0 items-center pb-5 pt-5",
              collapsed ? "justify-center px-2" : "px-5",
            ].join(" ")}
          >
            <Link
              href="/dashboard"
              className="truncate text-xl font-bold tracking-tight text-slate-800 dark:text-slate-100"
              aria-label="VendeWhat — ir ao painel"
            >
              {collapsed ? (
                <>
                  V<span className="text-violet-600 dark:text-violet-400">W</span>
                </>
              ) : (
                <>
                  Vende
                  <span className="text-violet-600 dark:text-violet-400">What</span>
                </>
              )}
            </Link>
          </div>

          {/* Botão flutuante de abrir/fechar — centralizado na borda direita */}
          <button
            type="button"
            onClick={toggleCollapsed}
            title={collapsed ? "Expandir menu" : "Recolher menu"}
            aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
            aria-expanded={!collapsed}
            className="absolute right-0 top-1/2 z-10 grid h-7 w-7 -translate-y-1/2 translate-x-1/2 place-items-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-md transition-colors hover:border-violet-300 hover:text-violet-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-violet-500 dark:hover:text-violet-300"
          >
            <ChevronIcon direction={collapsed ? "right" : "left"} />
          </button>

          <div className="flex-1 overflow-y-auto px-3">
            <SideNav pathname={pathname} collapsed={collapsed} />
          </div>

          <div className="shrink-0 border-t border-slate-200/90 px-3 py-3 dark:border-slate-800">
            {collapsed ? (
              <div className="flex flex-col items-center gap-2">
                <ThemeToggle />
                <button
                  type="button"
                  onClick={handleLogout}
                  title="Sair"
                  aria-label="Sair"
                  className="grid h-9 w-9 place-items-center rounded-xl text-slate-500 transition-colors hover:bg-red-50 hover:text-red-600 dark:text-slate-400 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                >
                  <LogoutIcon />
                </button>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate px-2 text-sm text-slate-600 dark:text-slate-300">
                    Olá,{" "}
                    <strong className="text-slate-800 dark:text-slate-100">
                      {userName.split(" ")[0]}
                    </strong>
                  </span>
                  <ThemeToggle />
                </div>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="mt-2 w-full rounded-xl px-3 py-2 text-left text-sm font-medium text-slate-500 transition-colors hover:bg-red-50 hover:text-red-600 dark:text-slate-400 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                >
                  Sair
                </button>
              </>
            )}
          </div>
        </aside>

        {/* Coluna de conteúdo */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Header enxuto — só no celular (a lateral cobre o desktop) */}
          <header className="lg:hidden sticky top-0 z-30 border-b border-slate-200/90 bg-white/85 backdrop-blur-md shadow-sm shadow-slate-200/40 dark:border-slate-800 dark:bg-slate-900/80 dark:shadow-black/20">
            <div className="flex flex-nowrap items-center justify-between gap-4 px-4 py-3">
              <div className="flex min-w-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => setMenuOpen(true)}
                  aria-label="Abrir menu"
                  aria-expanded={menuOpen}
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-800 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                >
                  <MenuIcon />
                </button>
                <Link
                  href="/dashboard"
                  className="shrink-0 truncate text-xl font-bold tracking-tight text-slate-800 dark:text-slate-100"
                >
                  Vende<span className="text-violet-600 dark:text-violet-400">What</span>
                </Link>
              </div>
              <div className="flex flex-none items-center gap-1.5 sm:gap-2.5">
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

          {/* Aviso do topo: IA pausada ou WhatsApp sem conectar (some no plano Sem IA) */}
          <AiStatusBanner />

          {/* pb extra no celular para não ficar atrás da barra inferior */}
          <div
            key={pathname}
            className="vw-fade-in-up flex-1"
          >
            {children}
          </div>
        </div>
      </div>

      <MobileMenu
        pathname={pathname}
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        userName={userName}
        onLogout={handleLogout}
      />
    </div>
  );
}
