import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Último pedido da loja logada — usado pelo painel para detectar uma venda nova
 * (bipe + alerta visual). Devolve o maior `order_number` e um resumo do pedido
 * mais recente. Leitura leve, chamada por polling.
 */
export async function GET() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });
  }

  const { data: store } = await supabase
    .from("stores")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!store?.id) {
    return NextResponse.json({ ok: false, error: "Loja não encontrada." }, { status: 404 });
  }

  const { data, error } = await supabase
    .from("orders")
    .select("order_number, customer_name, subtotal, created_at")
    .eq("store_id", store.id)
    .order("order_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    // Tabela/coluna ausente ou sem pedidos ainda — trata como "sem venda".
    return NextResponse.json({ ok: true, latestOrderNumber: 0 });
  }

  const latestOrderNumber =
    typeof data?.order_number === "number" ? data.order_number : 0;

  return NextResponse.json({
    ok: true,
    latestOrderNumber,
    customerName:
      typeof data?.customer_name === "string" ? data.customer_name : "",
    subtotal: typeof data?.subtotal === "number" ? data.subtotal : 0,
  });
}
