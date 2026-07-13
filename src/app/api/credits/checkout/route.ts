import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import {
  createPreference,
  isMercadoPagoConfigured,
  platformAccessToken,
} from "@/lib/mercadopago";
import { findPackage } from "@/lib/aiCredits";

export const runtime = "nodejs";

/** Resolve a loja do usuário logado. */
async function resolveStore() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado." as const, status: 401 };

  const { data: store } = await supabase
    .from("stores")
    .select("id, name")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!store?.id) return { error: "Loja não encontrada." as const, status: 404 };

  return { storeId: store.id as string, storeName: (store.name as string) ?? "Loja" };
}

type Body = { brl?: number };

/**
 * Cria a recarga de créditos: registra a compra (pending) e devolve o init_point
 * do checkout do Mercado Pago (na SUA conta — a loja paga você pelos créditos).
 */
export async function POST(req: Request) {
  const r = await resolveStore();
  if ("error" in r) {
    return NextResponse.json({ ok: false, error: r.error }, { status: r.status });
  }
  if (!isMercadoPagoConfigured()) {
    return NextResponse.json(
      { ok: false, error: "Pagamento não configurado no servidor." },
      { status: 503 }
    );
  }
  const baseUrl = process.env.APP_BASE_URL;
  if (!baseUrl) {
    return NextResponse.json(
      { ok: false, error: "APP_BASE_URL não configurada no servidor." },
      { status: 503 }
    );
  }
  const admin = createAdminSupabase();
  if (!admin) {
    return NextResponse.json({ ok: false, error: "Servidor sem service role." }, { status: 503 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido." }, { status: 400 });
  }

  // Só aceita valores de pacotes conhecidos (nunca confia no preço vindo do cliente).
  const pkg = findPackage(Number(body.brl));
  if (!pkg) {
    return NextResponse.json({ ok: false, error: "Pacote inválido." }, { status: 400 });
  }

  // Registra a compra pendente — o id dela é a referência do pagamento.
  const { data: purchase, error: insErr } = await admin
    .from("ai_credit_purchases")
    .insert({
      store_id: r.storeId,
      brl: pkg.brl,
      tokens: pkg.tokens,
      conversations: pkg.conversations,
      status: "pending",
    })
    .select("id")
    .single();

  if (insErr || !purchase) {
    console.error("[credits/checkout] insert", insErr);
    return NextResponse.json({ ok: false, error: "Não foi possível iniciar a recarga." }, { status: 500 });
  }

  const base = baseUrl.replace(/\/+$/, "");
  try {
    const pref = await createPreference(platformAccessToken(), {
      items: [
        {
          title: `Créditos da IA — ${pkg.conversations} conversas (${r.storeName})`,
          quantity: 1,
          unitPrice: pkg.brl,
        },
      ],
      externalReference: purchase.id as string,
      notificationUrl: `${base}/api/credits/webhook`,
      backUrls: {
        success: `${base}/dashboard/creditos?recarga=ok`,
        pending: `${base}/dashboard/creditos?recarga=pendente`,
        failure: `${base}/dashboard/creditos?recarga=falhou`,
      },
      payerName: r.storeName,
    });

    const initPoint = pref.init_point ?? pref.sandbox_init_point;
    if (!initPoint) {
      return NextResponse.json(
        { ok: false, error: "Mercado Pago não retornou o link de pagamento." },
        { status: 502 }
      );
    }
    return NextResponse.json({ ok: true, initPoint });
  } catch (err) {
    console.error("[credits/checkout]", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Falha ao criar o pagamento." },
      { status: 502 }
    );
  }
}
