import { NextResponse } from "next/server";
import { normalizeStoreSlug } from "@/lib/storeSlug";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { isCustomerPhoneValid, toWhatsAppNumber } from "@/lib/customerPhone";
import { upsertAbandonedCart, type AbandonedCartItem } from "@/lib/whatsappConfig";

export const runtime = "nodejs";

type RawItem = { name?: unknown; quantity?: unknown; price?: unknown };
type Body = {
  slug?: string;
  name?: string;
  phone?: string;
  items?: RawItem[];
  subtotal?: number;
};

/**
 * Salva/atualiza o rascunho de carrinho abandonado do cliente. Público: chamado
 * (com debounce) pela loja quando o cliente já tem itens + nome + telefone
 * válido, mas ainda não finalizou. Só grava se a loja ativou a recuperação de
 * carrinho (`ai_cart_minutes > 0`). Sempre responde 200 — nunca pode quebrar o
 * checkout. Escreve via service role.
 */
export async function POST(req: Request) {
  const admin = createAdminSupabase();
  if (!admin) return NextResponse.json({ ok: true });

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: true });
  }

  const slug = normalizeStoreSlug(String(body.slug ?? ""));
  if (!slug) return NextResponse.json({ ok: true });

  const name = String(body.name ?? "").trim();
  const phoneRaw = String(body.phone ?? "").trim();
  if (name.length < 2 || !isCustomerPhoneValid(phoneRaw)) {
    return NextResponse.json({ ok: true });
  }

  const items: AbandonedCartItem[] = (Array.isArray(body.items) ? body.items : [])
    .map((it) => ({
      name: String(it?.name ?? "").trim().slice(0, 160),
      quantity: Number(it?.quantity) || 0,
      price: Number(it?.price) || 0,
    }))
    .filter((it) => it.name && it.quantity > 0)
    .slice(0, 50);
  if (items.length === 0) return NextResponse.json({ ok: true });

  const subtotal = items.reduce((s, i) => s + i.price * i.quantity, 0);

  try {
    const { data: store } = await admin
      .from("stores")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    if (!store?.id) return NextResponse.json({ ok: true });

    // Só guarda se a loja ativou a recuperação de carrinho.
    const { data: cfg } = await admin
      .from("store_whatsapp")
      .select("ai_cart_minutes")
      .eq("store_id", store.id)
      .maybeSingle();
    const minutes = Number(cfg?.ai_cart_minutes) || 0;
    if (minutes <= 0) return NextResponse.json({ ok: true });

    await upsertAbandonedCart(
      admin,
      store.id as string,
      toWhatsAppNumber(phoneRaw),
      name,
      items,
      subtotal
    );
  } catch (err) {
    console.error("[loja/abandoned-cart]", err);
  }

  return NextResponse.json({ ok: true });
}
