"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  DASH_NAV_ICONS,
  type DashNavIconKey,
} from "@/components/icons/DashboardNavIcons";

const DASH_NAV: readonly {
  href: string;
  /** Texto visível na barra estreita (estilo app roxo) */
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
  { href: "/dashboard/conta", short: "Conta", label: "Conta", icon: "conta" },
];

/** Largura da faixa roxa (ícone + rótulo curto) */
const RAIL_W = "w-[118px]";
const RAIL_MR = "lg:mr-[118px]";

function HamburgerIcon({ open }: { open: boolean }) {
  if (open) {
    return (
      <svg
        className="h-6 w-6"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2.35}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M6 18L18 6M6 6l12 12" />
      </svg>
    );
  }
  return (
    <svg
      className="h-6 w-6"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2.35}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}

/** Barra vertical roxa: ícone branco (contorno) + texto branco por baixo; ativo = quadrado roxo mais escuro. */
function PurpleRailNav({
  pathname,
  onNavigate,
}: {
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <nav
      className="flex flex-col items-stretch py-2"
      aria-label="Áreas do painel"
    >
      {DASH_NAV.map(({ href, short, label, icon }) => {
        const active = pathname === href;
        const Icon = DASH_NAV_ICONS[icon];
        return (
          <Link
            key={href}
            href={href}
            title={label}
            aria-label={label}
            aria-current={active ? "page" : undefined}
            onClick={onNavigate}
            className={[
              "flex flex-col items-center gap-2 px-2 py-4 transition-colors rounded-xl mx-1",
              active ? "" : "hover:bg-white/10 active:bg-white/15",
            ].join(" ")}
          >
            <span
              className={[
                "flex h-12 w-12 items-center justify-center rounded-xl transition-shadow",
                active
                  ? "bg-violet-950 shadow-inner shadow-black/25 ring-1 ring-white/10"
                  : "bg-transparent",
              ].join(" ")}
              aria-hidden
            >
              <Icon className="h-[26px] w-[26px] text-white" />
            </span>
            <span className="text-center text-[11px] font-bold leading-tight text-white px-0.5 max-w-[5.5rem]">
              {short}
            </span>
          </Link>
        );
      })}
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
  const [menuOpen, setMenuOpen] = useState(false);

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

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  useEffect(() => {
    if (menuOpen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [menuOpen]);

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

  const railSurfaceClass =
    "bg-[#6d28d9] shadow-[-10px_0_40px_-8px_rgba(76,29,149,0.55)]";

  return (
    <div className="min-h-screen bg-slate-50">
      {menuOpen && (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-[2px] lg:hidden"
          aria-label="Fechar menu"
          onClick={() => setMenuOpen(false)}
        />
      )}

      <div className={`min-h-screen flex flex-col ${RAIL_MR}`}>
        <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200/90 shadow-sm shadow-slate-200/40">
          <div className="max-w-6xl mx-auto px-4 py-3.5 flex flex-nowrap items-center justify-between gap-3">
            <Link
              href="/dashboard"
              className="text-xl font-bold text-slate-800 shrink-0 min-w-0 truncate tracking-tight"
            >
              VendeWhat
            </Link>
            <div className="flex flex-none items-center gap-2 sm:gap-4">
              <span className="text-sm text-slate-600 hidden sm:block truncate max-w-[160px]">
                Olá, <strong className="text-slate-800">{userName.split(" ")[0]}</strong>
              </span>
              <button
                type="button"
                onClick={handleLogout}
                className="text-sm font-medium text-slate-500 hover:text-red-600 transition-colors whitespace-nowrap"
              >
                Sair
              </button>
              <button
                type="button"
                className="lg:hidden inline-flex items-center gap-2 rounded-xl bg-[#6d28d9] px-3 py-2.5 text-white shadow-md shadow-violet-900/30 hover:bg-[#5b21b7] transition-colors"
                aria-expanded={menuOpen}
                aria-controls="dashboard-nav-drawer"
                onClick={() => setMenuOpen((o) => !o)}
              >
                <span className="sr-only">
                  {menuOpen ? "Fechar menu" : "Abrir menu"}
                </span>
                <HamburgerIcon open={menuOpen} />
                <span className="text-sm font-bold tracking-tight">Menu</span>
              </button>
            </div>
          </div>
        </header>

        <div className="flex-1">{children}</div>
      </div>

      {/* Faixa roxa fixa à direita — desktop (cantos arredondados para o conteúdo = à esquerda da barra) */}
      <aside
        className={`hidden lg:flex fixed top-0 right-0 z-20 h-svh ${RAIL_W} flex-col rounded-l-[28px] overflow-hidden ${railSurfaceClass}`}
        aria-label="Navegação do painel"
      >
        <div className="flex flex-1 flex-col items-center pt-8 pb-6 min-h-0 overflow-y-auto overflow-x-hidden">
          <PurpleRailNav pathname={pathname} />
        </div>
      </aside>

      {/* Drawer mobile — mesma faixa roxa, desliza da direita */}
      <div
        id="dashboard-nav-drawer"
        className={[
          `fixed top-0 right-0 z-50 h-svh ${RAIL_W} max-w-[100vw] flex flex-col rounded-l-[28px] overflow-hidden lg:hidden`,
          railSurfaceClass,
          "transition-transform duration-300 ease-out",
          menuOpen ? "translate-x-0" : "translate-x-full pointer-events-none",
        ].join(" ")}
        aria-hidden={!menuOpen}
      >
        <div className="flex justify-end px-2 pt-3 pb-1 shrink-0">
          <button
            type="button"
            onClick={() => setMenuOpen(false)}
            className="flex h-10 w-10 items-center justify-center rounded-xl text-white/90 hover:bg-white/15 transition-colors text-2xl leading-none font-light"
            aria-label="Fechar menu"
          >
            ×
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto pb-6 -mt-1">
          <PurpleRailNav
            pathname={pathname}
            onNavigate={() => setMenuOpen(false)}
          />
        </div>
      </div>
    </div>
  );
}
