import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import {
  createPreapproval,
  isMercadoPagoConfigured,
  platformAccessToken,
} from "@/lib/mercadopago";

export const runtime = "nodejs";

type Body = {
  planId?: string;
  cycle?: string; // monthly | annual (anual aplica 16% off no valor mensal)
};

const ANNUAL_DISCOUNT = 0.16;

/**
 * Cria a assinatura recorrente (mensalidade do SaaS) no Mercado Pago e devolve
 * o init_point do checkout. Usa a SUA conta (MP_ACCESS_TOKEN).
 */
export async function POST(req: Request) {
  if (!isMercadoPagoConfigured()) {
    return NextResponse.json(
      { ok: false, error: "Mercado Pago não configurado no servidor." },
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

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido." }, { status: 400 });
  }

  const planId = String(body.planId ?? "").trim();
  if (!planId) {
    return NextResponse.json({ ok: false, error: "Plano obrigatório." }, { status: 400 });
  }
  const annual = String(body.cycle ?? "monthly") === "annual";

  const admin = createAdminSupabase();
  if (!admin) {
    return NextResponse.json({ ok: false, error: "Servidor sem service role." }, { status: 503 });
  }

  const { data: plan } = await admin
    .from("plans")
    .select("id, title, monthly")
    .eq("id", planId)
    .maybeSingle();
  if (!plan) {
    return NextResponse.json({ ok: false, error: "Plano não encontrado." }, { status: 404 });
  }

  const baseMonthly = Number(plan.monthly) || 0;
  if (baseMonthly <= 0) {
    return NextResponse.json(
      { ok: false, error: "Este plano não pode ser assinado online." },
      { status: 400 }
    );
  }
  // O preapproval cobra todo mês; no ciclo anual aplicamos o desconto no valor mensal.
  const amount = Number(
    (annual ? baseMonthly * (1 - ANNUAL_DISCOUNT) : baseMonthly).toFixed(2)
  );

  const base = baseUrl.replace(/\/+$/, "");
  try {
    const pre = await createPreapproval(platformAccessToken(), {
      reason: `VendeWhat — ${plan.title}`,
      amount,
      payerEmail: user.email ?? "",
      backUrl: `${base}/dashboard/planos?assinatura=ok`,
      notificationUrl: `${base}/api/billing/webhook`,
      externalReference: store.id as string,
    });

    await admin.from("subscriptions").upsert(
      {
        store_id: store.id as string,
        plan_id: planId,
        amount,
        billing_cycle: annual ? "annual" : "monthly",
        status: "past_due", // vira 'active' quando o webhook confirmar o 1º pagamento
        gateway: "mercadopago",
        gateway_subscription_id: pre.id,
        gateway_status: pre.status,
        payer_email: user.email ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "store_id" }
    );

    if (!pre.init_point) {
      return NextResponse.json(
        { ok: false, error: "Mercado Pago não retornou o link de pagamento." },
        { status: 502 }
      );
    }

    return NextResponse.json({ ok: true, initPoint: pre.init_point });
  } catch (err) {
    console.error("[billing/subscribe]", err);
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Falha ao criar a assinatura.",
      },
      { status: 502 }
    );
  }
}
