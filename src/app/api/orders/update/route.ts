import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type Body = {
  orderId?: string;
  /** Status de atendimento: "novo" (em aberto) | "finalizado". */
  status?: string;
  /** Status de pagamento (controle manual da loja): "pago" | "pendente". */
  paymentStatus?: string;
};

const FULFILL = new Set(["novo", "finalizado"]);
const PAYMENT = new Set(["pago", "pendente"]);

/** Resolve a loja do usuário logado. */
async function resolveStore() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado." as const, status: 401 };

  const { data: store } = await supabase
    .from("stores")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!store?.id) return { error: "Loja não encontrada." as const, status: 404 };

  return { storeId: store.id as string };
}

/**
 * Atualiza o status de atendimento e/ou de pagamento de um pedido da própria
 * loja. Só o dono (autenticado) pode mexer; a escrita passa por service role
 * (a tabela orders não tem policy de UPDATE).
 */
export async function POST(req: Request) {
  const r = await resolveStore();
  if ("error" in r) {
    return NextResponse.json({ ok: false, error: r.error }, { status: r.status });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido." }, { status: 400 });
  }

  const orderId = String(body.orderId ?? "").trim();
  if (!orderId) {
    return NextResponse.json({ ok: false, error: "Pedido inválido." }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};

  if (body.status !== undefined) {
    const status = String(body.status).trim();
    if (!FULFILL.has(status)) {
      return NextResponse.json({ ok: false, error: "Status inválido." }, { status: 400 });
    }
    patch.status = status;
  }

  const admin = createAdminSupabase();
  if (!admin) {
    return NextResponse.json(
      { ok: false, error: "Servidor sem service role." },
      { status: 503 }
    );
  }

  if (body.paymentStatus !== undefined) {
    const paymentStatus = String(body.paymentStatus).trim();
    if (!PAYMENT.has(paymentStatus)) {
      return NextResponse.json(
        { ok: false, error: "Status de pagamento inválido." },
        { status: 400 }
      );
    }

    // Preserva o provedor "mercadopago" (veio do gateway); pagamentos
    // confirmados na mão pela loja ficam como "manual".
    const { data: current } = await admin
      .from("orders")
      .select("payment_provider")
      .eq("id", orderId)
      .eq("store_id", r.storeId)
      .maybeSingle();
    const curProvider = String(
      (current as { payment_provider?: string } | null)?.payment_provider ?? ""
    );

    if (paymentStatus === "pago") {
      patch.payment_status = "pago";
      patch.paid_at = new Date().toISOString();
      patch.payment_provider = curProvider === "mercadopago" ? "mercadopago" : "manual";
    } else {
      patch.payment_status = "pendente";
      patch.paid_at = null;
      // Tira o selo de pagamento manual; mantém histórico do Mercado Pago.
      patch.payment_provider = curProvider === "mercadopago" ? "mercadopago" : null;
    }
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ ok: false, error: "Nada para atualizar." }, { status: 400 });
  }

  const { error } = await admin
    .from("orders")
    .update(patch)
    .eq("id", orderId)
    .eq("store_id", r.storeId);

  if (error) {
    console.error("[api/orders/update]", error);
    return NextResponse.json(
      { ok: false, error: "Não foi possível atualizar o pedido." },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
