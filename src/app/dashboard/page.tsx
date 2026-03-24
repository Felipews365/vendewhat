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

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showSetupGuide, setShowSetupGuide] = useState(false);

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
          <h1 className="text-2xl font-bold text-slate-800">Painel da loja</h1>
          <p className="text-slate-500 mt-1">
            Gerencie sua loja <strong>{user.store?.name}</strong>
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowSetupGuide(true)}
          className="text-sm font-semibold text-landing-primary hover:text-landing-accent underline-offset-2 hover:underline text-left sm:text-right w-fit"
        >
          Ver passo a passo para montar a loja
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[
          { label: "Produtos", value: "0", icon: "📦" },
          { label: "Pedidos", value: "0", icon: "🛒" },
          { label: "Vendas hoje", value: "R$ 0", icon: "💰" },
          { label: "Visitas", value: "0", icon: "👁️" },
        ].map((stat) => (
          <div
            key={stat.label}
            className="bg-white rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-slate-500">{stat.label}</span>
              <span className="text-2xl">{stat.icon}</span>
            </div>
            <p className="text-2xl font-bold text-slate-800">{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="mb-8 max-w-xl">
        <div className="bg-white rounded-xl p-6 shadow-sm">
          <h2 className="font-semibold text-slate-800 mb-4">WhatsApp conectado</h2>
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-whatsapp/10 text-whatsapp text-lg">
              📱
            </span>
            <div>
              <p className="text-sm font-medium text-slate-800">
                {user.store?.phone || "Não configurado"}
              </p>
              <p className="text-xs text-slate-400">
                Os pedidos serão enviados para este número
              </p>
            </div>
          </div>
        </div>
      </div>

      <h2 className="text-lg font-semibold text-slate-800 mb-4">Ações rápidas</h2>
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
            className="bg-white rounded-xl p-5 shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5 group"
          >
            <span className="text-2xl group-hover:scale-110 inline-block transition-transform">
              {action.icon}
            </span>
            <h3 className="mt-2 font-semibold text-slate-800">{action.title}</h3>
            <p className="text-sm text-slate-500 mt-1">{action.desc}</p>
          </Link>
        ))}
      </div>

      <div className="mt-8 bg-emerald-50 border border-emerald-200 rounded-xl p-6">
        <h3 className="font-semibold text-emerald-800">
          Sua loja foi criada com sucesso! 🎉
        </h3>
        <p className="text-sm text-emerald-700 mt-1">
          Próximo passo: adicione seus primeiros produtos para começar a vender.
        </p>
      </div>
    </main>
  );
}
