"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

interface Store {
  id: string;
  slug: string;
}

interface UserData {
  store: Store | null;
}

export default function DashboardCompartilharPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [catalogUrl, setCatalogUrl] = useState("");
  const [user, setUser] = useState<UserData | null>(null);

  useEffect(() => {
    const supabase = createClient();

    async function load() {
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();

      if (!authUser) {
        router.push("/login");
        return;
      }

      const { data: store } = await supabase
        .from("stores")
        .select("id, slug")
        .eq("user_id", authUser.id)
        .single();

      setUser({ store });
      if (store?.slug) {
        setCatalogUrl(`${window.location.origin}/loja/${store.slug}`);
      }
      setLoading(false);
    }

    load();
  }, [router]);

  if (loading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-landing-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!user) return null;

  const catalogPath = user.store?.slug ? `/loja/${user.store.slug}` : "";

  return (
    <main className="max-w-6xl mx-auto px-4 py-8">
      <h1 className="sr-only">Compartilhar sua loja</h1>
      <div className="bg-white rounded-xl p-6 shadow-sm flex flex-col sm:flex-row gap-3 sm:items-center w-full max-w-md">
        <button
          type="button"
          onClick={() =>
            catalogUrl && void navigator.clipboard.writeText(catalogUrl)
          }
          disabled={!catalogUrl}
          className="text-sm font-semibold bg-whatsapp text-white px-4 py-2.5 rounded-lg hover:bg-whatsapp-dark transition-colors disabled:opacity-50 disabled:pointer-events-none"
        >
          Copiar link
        </button>
        {catalogPath ? (
          <Link
            href={catalogPath}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-semibold text-center border-2 border-whatsapp text-whatsapp px-4 py-2.5 rounded-lg hover:bg-whatsapp/5 transition-colors"
          >
            Abrir loja
          </Link>
        ) : null}
      </div>
    </main>
  );
}
