/**
 * CRM — ficha 360° de um cliente: dados, pedidos, últimas mensagens,
 * etiquetas e carrinho abandonado, tudo numa chamada só.
 */
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { getFullConversation, listConversationTags } from "@/lib/whatsappConfig";
import {
  getCrmCustomerById,
  listCrmCustomerOrders,
  pickByPhoneVariants,
} from "@/lib/crm/customers";
import { crmPhoneVariants } from "@/lib/crm/phone";

export const runtime = "nodejs";

/** Quantas mensagens recentes a ficha mostra (o histórico completo é a aba Atendimento). */
const RECENT_MESSAGES = 20;

async function resolveStore() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      error: NextResponse.json(
        { ok: false, error: "Não autenticado." },
        { status: 401 }
      ),
    };
  }
  const { data: store } = await supabase
    .from("stores")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!store?.id) {
    return {
      error: NextResponse.json(
        { ok: false, error: "Loja não encontrada." },
        { status: 404 }
      ),
    };
  }
  const admin = createAdminSupabase();
  if (!admin) {
    return {
      error: NextResponse.json(
        { ok: false, error: "Servidor sem service role." },
        { status: 503 }
      ),
    };
  }
  return { storeId: store.id as string, admin };
}

type Admin = NonNullable<ReturnType<typeof createAdminSupabase>>;

/**
 * As mensagens ficam gravadas com o telefone que o webhook recebeu, que nem
 * sempre é o `wa_phone` do CRM (bases antigas). Tenta as variantes conhecidas e
 * fica com a primeira que tiver histórico.
 */
async function recentMessages(admin: Admin, storeId: string, waPhone: string) {
  for (const variant of crmPhoneVariants(waPhone)) {
    try {
      const msgs = await getFullConversation(admin, storeId, variant, RECENT_MESSAGES);
      if (msgs.length > 0) return msgs.slice(-RECENT_MESSAGES);
    } catch {
      return [];
    }
  }
  return [];
}

/** Carrinho abandonado ainda aberto (não convertido). */
async function openCart(admin: Admin, storeId: string, waPhone: string) {
  try {
    const { data } = await admin
      .from("whatsapp_abandoned_carts")
      .select("customer_name, items, subtotal, updated_at, converted, recovered_at")
      .eq("store_id", storeId)
      .in("customer_phone", crmPhoneVariants(waPhone))
      .eq("converted", false)
      .order("updated_at", { ascending: false })
      .limit(1);
    const row = (data ?? [])[0] as Record<string, unknown> | undefined;
    if (!row) return null;
    return {
      subtotal: Number(row.subtotal ?? 0),
      updatedAt: String(row.updated_at ?? ""),
      items: Array.isArray(row.items) ? row.items : [],
      recovered: Boolean(row.recovered_at),
    };
  } catch {
    // Migration de carrinho abandonado ausente: a ficha continua funcionando.
    return null;
  }
}

// GET ?id=<crm_customers.id>
export async function GET(req: Request) {
  const ctx = await resolveStore();
  if ("error" in ctx) return ctx.error;
  const { storeId, admin } = ctx;

  const id = (new URL(req.url).searchParams.get("id") ?? "").trim();
  if (!id) {
    return NextResponse.json(
      { ok: false, error: "Informe o cliente." },
      { status: 400 }
    );
  }

  const customer = await getCrmCustomerById(admin, storeId, id);
  if (!customer) {
    return NextResponse.json(
      { ok: false, error: "Cliente não encontrado." },
      { status: 404 }
    );
  }

  const waPhone = customer.waPhone || customer.phoneKey;

  let tags: string[] = [];
  try {
    const map = await listConversationTags(admin, storeId);
    tags = pickByPhoneVariants(map, waPhone) ?? [];
  } catch {
    tags = [];
  }

  const [orders, messages, cart] = await Promise.all([
    listCrmCustomerOrders(admin, storeId, customer),
    recentMessages(admin, storeId, waPhone),
    openCart(admin, storeId, waPhone),
  ]);

  return NextResponse.json({
    ok: true,
    customer,
    tags,
    orders,
    messages,
    cart,
  });
}
