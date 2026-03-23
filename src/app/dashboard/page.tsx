"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

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
  const [catalogUrl, setCatalogUrl] = useState("");

  useEffect(() => {
    const supabase = createClient();

    async function loadUser() {
      const { data: { user: authUser } } = await supabase.auth.getUser();

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
      if (store?.slug) {
        setCatalogUrl(`${window.location.origin}/loja/${store.slug}`);
      }
      setLoading(false);
    }

    loadUser();
  }, [router]);

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin w-8 h-8 border-4 border-whatsapp border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!user) return null;

  const catalogPath = user.store?.slug ? `/loja/${user.store.slug}` : "";

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/dashboard" className="text-xl font-bold text-slate-800">
            VendeWhat
          </Link>
          <div className="flex items-center gap-4">
            <span className="text-sm text-slate-600 hidden sm:block">
              Olá, <strong>{user.name.split(" ")[0]}</strong>
            </span>
            <button
              onClick={handleLogout}
              className="text-sm text-slate-500 hover:text-red-600 transition-colors"
            >
              Sair
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-800">Painel da loja</h1>
          <p className="text-slate-500 mt-1">
            Gerencie sua loja <strong>{user.store?.name}</strong>
          </p>
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

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div className="bg-white rounded-xl p-6 shadow-sm">
            <h2 className="font-semibold text-slate-800 mb-4">Link do seu catálogo</h2>
            <div className="flex items-center gap-2 bg-slate-50 rounded-lg p-3">
              <span className="text-sm text-slate-600 flex-1 truncate">
                {catalogUrl || catalogPath || "—"}
              </span>
              <button
                type="button"
                onClick={() =>
                  catalogUrl && navigator.clipboard.writeText(catalogUrl)
                }
                disabled={!catalogUrl}
                className="text-xs bg-whatsapp text-white px-3 py-1.5 rounded-md hover:bg-whatsapp-dark transition-colors flex-shrink-0 disabled:opacity-50"
              >
                Copiar
              </button>
            </div>
            <div className="flex gap-3 mt-3">
              {catalogPath && (
                <Link
                  href={catalogPath}
                  target="_blank"
                  className="text-xs text-whatsapp font-medium hover:underline"
                >
                  Abrir catálogo →
                </Link>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-2">
              Compartilhe este link com seus clientes
            </p>
          </div>

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
              title: "Configurar loja",
              desc: "Altere nome, logo e descrição da loja",
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
    </div>
  );
}
