import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import {
  claimPendingReply,
  deletePendingReply,
  getConfig,
  globalPauseActive,
  isCustomerPaused,
  listDuePendingReplies,
} from "@/lib/whatsappConfig";
import { isEvolutionConfigured } from "@/lib/evolution";
import { isAiConfigured } from "@/lib/ai/attendant";
import { respondToCustomer } from "@/lib/whatsappRespond";

export const runtime = "nodejs";
export const maxDuration = 60;

// Tetos por execução (evita timeout) e idade máxima de um agendamento.
const MAX_PER_RUN = 40;
const MAX_AGE_MS = 60 * 60_000; // 1h: agendamentos mais velhos são descartados.

/**
 * Cron do debounce: responde às conversas cujo tempo de silêncio já venceu,
 * juntando as mensagens do lote numa única resposta. Deve ser chamado a cada
 * ~1 min por um agendador externo (crontab no VPS). Protegido por CRON_SECRET
 * (query ?key= ou header x-cron-key).
 */
async function run(req: Request) {
  const url = new URL(req.url);
  const key = url.searchParams.get("key") ?? req.headers.get("x-cron-key") ?? "";
  const secret = process.env.CRON_SECRET || "";
  if (!secret || key !== secret) {
    return NextResponse.json({ ok: false, error: "Não autorizado." }, { status: 401 });
  }

  const admin = createAdminSupabase();
  if (!admin || !isEvolutionConfigured() || !isAiConfigured()) {
    return NextResponse.json({ ok: true, skipped: true, sent: 0 });
  }

  const dueBeforeIso = new Date().toISOString();
  const due = await listDuePendingReplies(admin, MAX_PER_RUN);
  let sent = 0;

  for (const p of due) {
    // Descarta agendamentos velhos demais (ex.: conversas abandonadas após queda do cron).
    if (p.createdAt && Date.now() - new Date(p.createdAt).getTime() > MAX_AGE_MS) {
      await deletePendingReply(admin, p.storeId, p.customerPhone);
      continue;
    }

    // Reserva o pendente (lock otimista); se falhar, outro cron pegou ou chegou msg nova.
    const claimed = await claimPendingReply(
      admin,
      p.storeId,
      p.customerPhone,
      dueBeforeIso
    );
    if (!claimed) continue;

    try {
      const cfg = await getConfig(admin, p.storeId);
      // Não responde se: sem config, IA desligada, desconectado ou pausado.
      const skip =
        !cfg ||
        !cfg.aiEnabled ||
        cfg.connectionStatus !== "connected" ||
        globalPauseActive(cfg) ||
        (await isCustomerPaused(admin, p.storeId, p.customerPhone));
      if (skip || !cfg) {
        await deletePendingReply(admin, p.storeId, p.customerPhone);
        continue;
      }

      const didSend = await respondToCustomer(admin, cfg, p.customerPhone);
      if (didSend) sent += 1;
      // Respondeu (ou não havia o que responder): encerra o agendamento.
      await deletePendingReply(admin, p.storeId, p.customerPhone);
    } catch (e) {
      // Deixa o agendamento reservado (respond_after no futuro) para nova tentativa.
      console.error("[whatsapp/debounce]", p.storeId, p.customerPhone, e);
    }
  }

  return NextResponse.json({ ok: true, sent, due: due.length });
}

export async function POST(req: Request) {
  return run(req);
}

// Permite acionar também por GET (o crontab normalmente usa curl GET).
export async function GET(req: Request) {
  return run(req);
}
