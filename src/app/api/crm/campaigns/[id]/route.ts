/**
 * CRM — uma campanha: acompanhar, pausar/retomar, cancelar e enviar teste.
 */
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { getConfig } from "@/lib/whatsappConfig";
import { sendText } from "@/lib/evolution";
import { renderCampaignMessage } from "@/lib/crm/campaigns";

export const runtime = "nodejs";

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

type Params = { params: { id: string } };

export async function GET(_req: Request, { params }: Params) {
  const ctx = await resolveStore();
  if ("error" in ctx) return ctx.error;
  const { storeId, admin } = ctx;

  const { data: campaign } = await admin
    .from("crm_campaigns")
    .select(
      "id, name, message, audience, status, total, sent, failed, created_at, started_at, finished_at"
    )
    .eq("store_id", storeId)
    .eq("id", params.id)
    .maybeSingle();

  if (!campaign) {
    return NextResponse.json(
      { ok: false, error: "Campanha não encontrada." },
      { status: 404 }
    );
  }

  // Últimos destinatários tratados — dá para ver o envio andando.
  const { data: targets } = await admin
    .from("crm_campaign_targets")
    .select("id, name, wa_phone, status, sent_at, error")
    .eq("store_id", storeId)
    .eq("campaign_id", params.id)
    .order("sent_at", { ascending: false, nullsFirst: false })
    .limit(20);

  return NextResponse.json({ ok: true, campaign, targets: targets ?? [] });
}

type ActionBody = { action?: string };

const NEXT_STATUS: Record<string, string> = {
  pausar: "pausada",
  retomar: "enviando",
  cancelar: "cancelada",
};

export async function POST(req: Request, { params }: Params) {
  const ctx = await resolveStore();
  if ("error" in ctx) return ctx.error;
  const { storeId, admin } = ctx;

  let body: ActionBody;
  try {
    body = (await req.json()) as ActionBody;
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido." }, { status: 400 });
  }

  const action = String(body.action ?? "");

  // Envio de teste: vai para o próprio número da loja, sem tocar na fila.
  if (action === "teste") {
    const { data: campaign } = await admin
      .from("crm_campaigns")
      .select("message")
      .eq("store_id", storeId)
      .eq("id", params.id)
      .maybeSingle();
    if (!campaign) {
      return NextResponse.json(
        { ok: false, error: "Campanha não encontrada." },
        { status: 404 }
      );
    }

    const cfg = await getConfig(admin, storeId);
    if (!cfg || cfg.connectionStatus !== "connected" || !cfg.connectedNumber) {
      return NextResponse.json(
        { ok: false, error: "Conecte o WhatsApp da loja para enviar o teste." },
        { status: 400 }
      );
    }

    const text = renderCampaignMessage(
      String((campaign as Record<string, unknown>).message ?? ""),
      "Teste"
    );
    try {
      await sendText(cfg.evolutionInstance, cfg.connectedNumber, text);
      return NextResponse.json({ ok: true, sentTo: cfg.connectedNumber });
    } catch (err) {
      console.error("[api/crm/campaigns/id] teste", err);
      return NextResponse.json(
        { ok: false, error: "Não foi possível enviar o teste." },
        { status: 500 }
      );
    }
  }

  const status = NEXT_STATUS[action];
  if (!status) {
    return NextResponse.json({ ok: false, error: "Ação inválida." }, { status: 400 });
  }

  const patch: Record<string, unknown> = { status };
  if (status === "cancelada") patch.finished_at = new Date().toISOString();
  // Retomar limpa o respiro para o próximo cron já pegar a campanha.
  if (status === "enviando") patch.next_send_at = null;

  const { error } = await admin
    .from("crm_campaigns")
    .update(patch)
    .eq("store_id", storeId)
    .eq("id", params.id);

  if (error) {
    console.error("[api/crm/campaigns/id]", error.message);
    return NextResponse.json(
      { ok: false, error: "Não foi possível atualizar a campanha." },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, status });
}
