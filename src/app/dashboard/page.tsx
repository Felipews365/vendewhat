"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { StoreSetupGuideModal } from "@/components/dashboard/StoreSetupGuideModal";

interface Store {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  phone: string | null;
}

interface UserData {
  id: string;
  name: string;
  email: string;
  store: Store | null;
}

type WaStatus = "disconnected" | "connecting" | "connected";

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showSetupGuide, setShowSetupGuide] = useState(false);
  const [waStatus, setWaStatus] = useState<WaStatus>("disconnected");
  const [waNumber, setWaNumber] = useState<string | null>(null);
  const [stats, setStats] = useState({
    products: 0,
    orders: 0,
    salesToday: 0,
    visits: 0,
  });

  useEffect(() => {
    const supabase = createClient();

    async function loadUser() {
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();

      if (!authUser) {
        router.push("/login");
        return;
      }

      const { data: store } = await supabase
        .from("stores")
        .select("*")
        .eq("user_id", authUser.id)
        .single();

      setUser({
        id: authUser.id,
        name: authUser.user_metadata?.name || "Usuário",
        email: authUser.email || "",
        store,
      });
      setLoading(false);

      // Números reais do painel (produtos, pedidos e vendas de hoje).
      if (store?.id) {
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        try {
          const [prodRes, ordRes, salesRes, visitsRes] = await Promise.all([
            supabase
              .from("products")
              .select("id", { count: "exact", head: true })
              .eq("store_id", store.id),
            supabase
              .from("orders")
              .select("id", { count: "exact", head: true })
              .eq("store_id", store.id),
            supabase
              .from("orders")
              .select("subtotal")
              .eq("store_id", store.id)
              .gte("created_at", todayStart.toISOString()),
            supabase
              .from("store_visits")
              .select("id", { count: "exact", head: true })
              .eq("store_id", store.id),
          ]);
          const salesToday = (salesRes.data ?? []).reduce(
            (sum, r) => sum + Number((r as { subtotal?: number }).subtotal ?? 0),
            0
          );
          setStats({
            products: prodRes.count ?? 0,
            orders: ordRes.count ?? 0,
            salesToday,
            visits: visitsRes.count ?? 0,
          });
        } catch {
          /* mantém zeros se alguma consulta falhar */
        }
      }

      // Status real da conexão Evolution (não confiar num valor fixo).
      try {
        const res = await fetch("/api/whatsapp/status", { cache: "no-store" });
        const data = await res.json();
        if (data?.ok) {
          setWaStatus((data.status as WaStatus) ?? "disconnected");
          setWaNumber(data.number ?? null);
        }
      } catch {
        /* mantém desconectado se falhar */
      }
    }

    loadUser();
  }, [router]);

  if (loading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-landing-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <main className="max-w-6xl mx-auto px-4 py-8">
      <StoreSetupGuideModal
        open={showSetupGuide}
        onClose={() => setShowSetupGuide(false)}
      />

      <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Painel da loja</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            Gerencie sua loja <strong className="dark:text-slate-200">{user.store?.name}</strong>
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowSetupGuide(true)}
          className="text-sm font-semibold text-landing-primary hover:text-landing-accent dark:text-violet-400 dark:hover:text-violet-300 underline-offset-2 hover:underline text-left sm:text-right w-fit"
        >
          Ver passo a passo para montar a loja
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[
          { label: "Produtos", value: String(stats.products), icon: "📦" },
          { label: "Pedidos", value: String(stats.orders), icon: "🛒" },
          {
            label: "Vendas hoje",
            value: new Intl.NumberFormat("pt-BR", {
              style: "currency",
              currency: "BRL",
            }).format(stats.salesToday),
            icon: "💰",
          },
          { label: "Visitas", value: String(stats.visits), icon: "👁️" },
        ].map((stat, i) => (
          <div
            key={stat.label}
            className="vw-pop-in bg-white dark:bg-slate-900 dark:ring-1 dark:ring-slate-800 rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow"
            style={{ animationDelay: `${i * 70}ms` }}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-slate-500 dark:text-slate-400">{stat.label}</span>
              <span className="text-2xl">{stat.icon}</span>
            </div>
            <p className="text-2xl font-bold text-slate-800 dark:text-slate-100">{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="mb-8 max-w-xl">
        <div className="bg-white dark:bg-slate-900 dark:ring-1 dark:ring-slate-800 rounded-xl p-6 shadow-sm">
          <div className="flex items-center justify-between gap-3 mb-4">
            <h2 className="font-semibold text-slate-800 dark:text-slate-100">WhatsApp & IA</h2>
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                waStatus === "connected"
                  ? "bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-300"
                  : waStatus === "connecting"
                  ? "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300"
                  : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
              }`}
            >
              {waStatus === "connected"
                ? "Conectado"
                : waStatus === "connecting"
                ? "Conectando…"
                : "Desconectado"}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-whatsapp/10 text-whatsapp text-lg">
              📱
            </span>
            <div>
              {waStatus === "connected" ? (
                <>
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
                    {waNumber || user.store?.phone || "Conectado"}
                  </p>
                  <p className="text-xs text-slate-400 dark:text-slate-500">
                    A IA pode atender seus clientes neste número
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
                    WhatsApp ainda não conectado
                  </p>
                  <Link
                    href="/dashboard/ia"
                    className="text-xs font-semibold text-landing-primary hover:text-landing-accent dark:text-violet-400 dark:hover:text-violet-300 underline-offset-2 hover:underline"
                  >
                    Conectar WhatsApp →
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-4">Ações rápidas</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {[
          {
            title: "Adicionar produto",
            desc: "Cadastre um novo produto no seu catálogo",
            icon: "➕",
            href: "/dashboard/produtos",
          },
          {
            title: "Ver pedidos",
            desc: "Acompanhe os pedidos recebidos",
            icon: "📋",
            href: "/dashboard/pedidos",
          },
          {
            title: "Montar a loja",
            desc: "Banner, cores, textos e busca",
            icon: "⚙️",
            href: "/dashboard/configuracoes",
          },
        ].map((action) => (
          <Link
            key={action.title}
            href={action.href}
            className="bg-white dark:bg-slate-900 dark:ring-1 dark:ring-slate-800 rounded-xl p-5 shadow-sm hover:shadow-md hover:dark:ring-violet-700 transition-all hover:-translate-y-0.5 group"
          >
            <span className="text-2xl group-hover:scale-110 inline-block transition-transform">
              {action.icon}
            </span>
            <h3 className="mt-2 font-semibold text-slate-800 dark:text-slate-100">{action.title}</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{action.desc}</p>
          </Link>
        ))}
      </div>

      <div className="mt-8 bg-emerald-50 border border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-900 rounded-xl p-6">
        <h3 className="font-semibold text-emerald-800 dark:text-emerald-300">
          Sua loja foi criada com sucesso! 🎉
        </h3>
        <p className="text-sm text-emerald-700 dark:text-emerald-400/90 mt-1">
          Próximo passo: adicione seus primeiros produtos para começar a vender.
        </p>
      </div>
    </main>
  );
}
