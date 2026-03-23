import { notFound } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { LojaClient, type CatalogProduct } from "./LojaClient";

type Props = { params: { slug: string } };

export async function generateMetadata({ params }: Props) {
  const { slug } = params;
  const supabase = await createServerSupabase();
  const { data: store } = await supabase
    .from("stores")
    .select("name, description")
    .eq("slug", slug)
    .single();

  if (!store) {
    return { title: "Loja não encontrada | VendeWhat" };
  }

  return {
    title: `${store.name} | Catálogo VendeWhat`,
    description:
      store.description ||
      `Confira os produtos de ${store.name}. Compre pelo WhatsApp.`,
  };
}

export default async function LojaPublicaPage({ params }: Props) {
  const { slug } = params;
  const supabase = await createServerSupabase();

  const { data: store, error: storeError } = await supabase
    .from("stores")
    .select("id, name, slug, description, logo, phone")
    .eq("slug", slug)
    .single();

  if (storeError || !store) {
    notFound();
  }

  const { data: products } = await supabase
    .from("products")
    .select("id, name, description, price, image, stock")
    .eq("store_id", store.id)
    .eq("active", true)
    .order("created_at", { ascending: false });

  const list: CatalogProduct[] = (products ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    price: Number(p.price),
    image: p.image,
    stock: p.stock,
  }));

  return (
    <LojaClient
      store={{
        name: store.name,
        description: store.description,
        logo: store.logo,
        phone: store.phone,
      }}
      products={list}
    />
  );
}
