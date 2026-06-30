import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import {
  clearCustomerPause,
  clearGlobalPause,
  getConfig,
  globalPauseActive,
  listCustomerPauses,
  listRecentCustomers,
  setCustomerPause,
  setGlobalPause,
} from "@/lib/whatsappConfig";

export const runtime = "nodejs";

/** Autentica o dono e devolve { storeId, admin } ou uma resposta de erro. */
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

/** Converte minutes (number | null) num horário ISO de retorno. null = indefinido. */
function untilFromMinutes(minutes: unknown): string | null {
  const n = typeof minutes === "number" ? minutes : Number(minutes);
  if (!Number.isFinite(n) || n <= 0) return null; // até a loja reativar
  const capped = Math.min(n, 60 * 24 * 7); // teto de 7 dias
  return new Date(Date.now() + capped * 60_000).toISOString();
}

function normalizePhone(v: unknown): string {
  return typeof v === "string" ? v.replace(/\D/g, "") : "";
}

// Lista o estado das pausas da loja.
export async function GET() {
  const ctx = await resolveStore();
  if ("error" in ctx) return ctx.error;
  const { storeId, admin } = ctx;

  const cfg = await getConfig(admin, storeId);
  const [customers, conversations] = await Promise.all([
    listCustomerPauses(admin, storeId),
    listRecentCustomers(admin, storeId, 30),
  ]);

  // Se a pausa global expirou, limpa de forma preguiçosa.
  if (cfg?.aiPaused && !globalPauseActive(cfg)) {
    await clearGlobalPause(admin, storeId);
  }

  const active = cfg ? globalPauseActive(cfg) : false;
  return NextResponse.json({
    ok: true,
    global: { paused: active, until: active ? cfg?.aiPausedUntil ?? null : null },
    handoffMinutes: cfg?.aiHandoffMinutes ?? 30,
    customers,
    conversations,
  });
}

type Body = {
  action?: "pause" | "resume";
  scope?: "global" | "customer";
  phone?: string;
  minutes?: number | null;
};

export async function POST(req: Request) {
  const ctx = await resolveStore();
  if ("error" in ctx) return ctx.error;
  const { storeId, admin } = ctx;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido." }, { status: 400 });
  }

  const action = body.action === "resume" ? "resume" : "pause";
  const scope = body.scope === "customer" ? "customer" : "global";

  if (scope === "global") {
    if (action === "resume") {
      await clearGlobalPause(admin, storeId);
    } else {
      await setGlobalPause(admin, storeId, untilFromMinutes(body.minutes));
    }
    return NextResponse.json({ ok: true });
  }

  // scope === "customer"
  const phone = normalizePhone(body.phone);
  if (!phone) {
    return NextResponse.json(
      { ok: false, error: "Informe o número do cliente." },
      { status: 400 }
    );
  }
  if (action === "resume") {
    await clearCustomerPause(admin, storeId, phone);
  } else {
    await setCustomerPause(admin, storeId, phone, untilFromMinutes(body.minutes), "manual");
  }
  return NextResponse.json({ ok: true });
}
