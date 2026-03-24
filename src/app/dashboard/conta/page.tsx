"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function ContaPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");

  const load = useCallback(async () => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      router.push("/login");
      return;
    }
    setEmail(user.email || "");
    setName(user.user_metadata?.name || "");
    setLoading(false);
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
  }

  if (loading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-landing-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <main className="max-w-6xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-slate-800">Conta</h1>
      <p className="text-slate-600 mt-2 text-sm max-w-xl">
        Dados do login e saída segura do painel.
      </p>

      <div className="mt-8 max-w-md bg-white rounded-xl border border-slate-100 shadow-sm p-6 space-y-4">
        <div>
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
            Nome
          </p>
          <p className="text-slate-800 font-medium mt-1">
            {name || "—"}
          </p>
        </div>
        <div>
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
            E-mail
          </p>
          <p className="text-slate-800 font-medium mt-1 break-all">{email}</p>
        </div>
        <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row gap-3">
          <button
            type="button"
            onClick={handleLogout}
            className="inline-flex justify-center rounded-xl bg-red-50 text-red-700 px-5 py-2.5 text-sm font-semibold hover:bg-red-100 transition-colors"
          >
            Sair da conta
          </button>
          <Link
            href="/dashboard"
            className="inline-flex justify-center rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors text-center"
          >
            Voltar ao painel
          </Link>
        </div>
      </div>
    </main>
  );
}
