import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import {
  createPreference,
  isMercadoPagoConfigured,
  platformAccessToken,
} from "@/lib/mercadopago";
import { PLAN_ANNUAL_DISCOUNT } from "@/lib/plans";

export const runtime = "nodejs";

type Body = {
  planId?: string;
  cycle?: string; // monthly (1 mês) | annual (12 meses à vista, 16% off)
};

/**
 * Mensalidade AVULSA (sem recorrência): cria uma preference de Checkout Pro na
 * SUA conta (MP_ACCESS_TOKEN) e devolve o init_point. O lojista paga uma vez e o
 * vencimento é estendido pelo /api/billing/checkout/webhook; nada renova sozinho.
 *
 * Difere do /api/billing/subscribe (preapproval), que cobra o cartão todo mês e
 * exige a aplicação MP do produto "Assinaturas".
 *
 * Nada é gravado aqui: quem paga o quê viaja no external_reference
 * (`storeId|planId|cycle`) e o webhook confirma contra a API do MP.
 */
export async function POST(req: Request) {
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

  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });
  }

  const { data: store } = await supabase
    .from("stores")
    .select("id, name")
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

  // O preço vem sempre do banco — nunca do cliente. `active` também aqui (não só no
  // loadPlans da UI): sem o filtro, quem soubesse o id de um plano desativado pagaria
  // por ele chamando a API direto.
  const { data: plan } = await admin
    .from("plans")
    .select("id, title, monthly")
    .eq("id", planId)
    .eq("active", true)
    .maybeSingle();
  if (!plan) {
    return NextResponse.json({ ok: false, error: "Plano não encontrado." }, { status: 404 });
  }

  const baseMonthly = Number(plan.monthly) || 0;
  if (baseMonthly <= 0) {
    return NextResponse.json(
      { ok: false, error: "Este plano não pode ser pago online." },
      { status: 400 }
    );
  }

  // Mensal = 1 mês; anual = 12 meses à vista com o mesmo desconto do recorrente.
  const months = annual ? 12 : 1;
  const amount = Number(
    (annual ? baseMonthly * (1 - PLAN_ANNUAL_DISCOUNT) * 12 : baseMonthly).toFixed(2)
  );

  const storeName = (store.name as string) ?? "Loja";
  const base = baseUrl.replace(/\/+$/, "");
  try {
    const pref = await createPreference(platformAccessToken(), {
      items: [
        {
          title: `VendeWhat — ${plan.title} (${months} ${months === 1 ? "mês" : "meses"})`,
          quantity: 1,
          unitPrice: amount,
        },
      ],
      externalReference: `${store.id}|${planId}|${annual ? "annual" : "monthly"}`,
      notificationUrl: `${base}/api/billing/checkout/webhook`,
      backUrls: {
        success: `${base}/dashboard/planos?pagamento=ok`,
        pending: `${base}/dashboard/planos?pagamento=pendente`,
        failure: `${base}/dashboard/planos?pagamento=falhou`,
      },
      payerName: storeName,
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
    console.error("[billing/checkout]", err);
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Falha ao criar o pagamento.",
      },
      { status: 502 }
    );
  }
}
