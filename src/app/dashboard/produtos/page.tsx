"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

interface Product {
  id: string;
  name: string;
  description: string | null;
  price: number;
  image: string | null;
  stock: number;
  active: boolean;
  created_at: string;
}

export default function ProdutosPage() {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [storeId, setStoreId] = useState<string | null>(null);

  useEffect(() => {
    loadProducts();
  }, []);

  async function loadProducts() {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      router.push("/login");
      return;
    }

    const { data: store } = await supabase
      .from("stores")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (!store) return;
    setStoreId(store.id);

    const { data } = await supabase
      .from("products")
      .select("*")
      .eq("store_id", store.id)
      .order("created_at", { ascending: false });

    setProducts(data || []);
    setLoading(false);
  }

  async function toggleActive(product: Product) {
    const supabase = createClient();
    await supabase
      .from("products")
      .update({ active: !product.active })
      .eq("id", product.id);

    setProducts(products.map((p) =>
      p.id === product.id ? { ...p, active: !p.active } : p
    ));
  }

  async function deleteProduct(id: string) {
    if (!confirm("Tem certeza que deseja excluir este produto?")) return;

    const supabase = createClient();

    const product = products.find((p) => p.id === id);
    if (product?.image) {
      const path = product.image.split("/product-images/")[1];
      if (path) {
        await supabase.storage.from("product-images").remove([path]);
      }
    }

    await supabase.from("products").delete().eq("id", id);
    setProducts(products.filter((p) => p.id !== id));
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin w-8 h-8 border-4 border-whatsapp border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/dashboard" className="text-xl font-bold text-slate-800">
            VendeWhat
          </Link>
          <Link
            href="/dashboard"
            className="text-sm text-slate-500 hover:text-slate-800 transition-colors"
          >
            ← Voltar ao painel
          </Link>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Produtos</h1>
            <p className="text-slate-500 mt-1">
              {products.length} {products.length === 1 ? "produto cadastrado" : "produtos cadastrados"}
            </p>
          </div>
          <Link
            href="/dashboard/produtos/novo"
            className="bg-whatsapp text-white px-5 py-2.5 rounded-lg font-medium hover:bg-whatsapp-dark transition-colors"
          >
            + Novo produto
          </Link>
        </div>

        {products.length === 0 ? (
          <div className="bg-white rounded-xl p-12 text-center shadow-sm">
            <span className="text-5xl block mb-4">📦</span>
            <h2 className="text-xl font-semibold text-slate-800 mb-2">
              Nenhum produto cadastrado
            </h2>
            <p className="text-slate-500 mb-6">
              Adicione seu primeiro produto para começar a vender
            </p>
            <Link
              href="/dashboard/produtos/novo"
              className="inline-block bg-whatsapp text-white px-6 py-3 rounded-lg font-medium hover:bg-whatsapp-dark transition-colors"
            >
              Adicionar primeiro produto
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {products.map((product) => (
              <div
                key={product.id}
                className={`bg-white rounded-xl shadow-sm overflow-hidden transition-all hover:shadow-md ${
                  !product.active ? "opacity-60" : ""
                }`}
              >
                <div className="aspect-square bg-slate-100 relative">
                  {product.image ? (
                    <img
                      src={product.image}
                      alt={product.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-4xl text-slate-300">
                      📷
                    </div>
                  )}
                  {!product.active && (
                    <span className="absolute top-2 left-2 bg-slate-800 text-white text-xs px-2 py-1 rounded">
                      Inativo
                    </span>
                  )}
                  {product.stock === 0 && product.active && (
                    <span className="absolute top-2 left-2 bg-red-500 text-white text-xs px-2 py-1 rounded">
                      Esgotado
                    </span>
                  )}
                </div>

                <div className="p-4">
                  <h3 className="font-semibold text-slate-800 truncate">
                    {product.name}
                  </h3>
                  <p className="text-whatsapp font-bold text-lg mt-1">
                    R$ {product.price.toFixed(2)}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    Estoque: {product.stock} unidades
                  </p>

                  <div className="flex items-center gap-2 mt-4">
                    <Link
                      href={`/dashboard/produtos/${product.id}`}
                      className="flex-1 text-center text-sm bg-slate-100 text-slate-700 py-2 rounded-lg hover:bg-slate-200 transition-colors"
                    >
                      Editar
                    </Link>
                    <button
                      onClick={() => toggleActive(product)}
                      className={`text-sm px-3 py-2 rounded-lg transition-colors ${
                        product.active
                          ? "bg-amber-50 text-amber-700 hover:bg-amber-100"
                          : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                      }`}
                    >
                      {product.active ? "Desativar" : "Ativar"}
                    </button>
                    <button
                      onClick={() => deleteProduct(product.id)}
                      className="text-sm px-3 py-2 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
                    >
                      Excluir
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
