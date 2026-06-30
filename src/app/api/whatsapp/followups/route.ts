import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import {
  appendMessage,
  getActivePausedPhones,
  getConversationTimes,
  getFollowupTimes,
  getRecentHistory,
  globalPauseActive,
  listFollowupConfigs,
  markFollowup,
  type WhatsAppConfig,
} from "@/lib/whatsappConfig";
import { isEvolutionConfigured, sendText } from "@/lib/evolution";
import {
  type AttendantProduct,
  buildSystemPrompt,
  generateFollowupReply,
  isAiConfigured,
} from "@/lib/ai/attendant";

export const runtime = "nodejs";
export const maxDuration = 60;

type AnyObj = Record<string, unknown>;

// Quantos clientes no máximo por loja e no total por execução (evita timeout).
const MAX_PER_STORE = 15;
const MAX_TOTAL = 60;

function mapProducts(rows: AnyObj[]): AttendantProduct[] {
  return rows.map((row) => {
    const price =
      typeof row.price === "number" ? row.price : parseFloat(String(row.price ?? 0)) || 0;
    const compare =
      row.compare_at_price == null
        ? null
        : typeof row.compare_at_price === "number"
        ? row.compare_at_price
        : parseFloat(String(row.compare_at_price)) || null;
    return {
      name: typeof row.name === "string" ? row.name : "Produto",
      price,
      stock: typeof row.stock === "number" ? row.stock : 0,
      description: typeof row.description === "string" ? row.description : null,
      category: typeof row.category === "string" ? row.category : null,
      isPromotion: row.is_promotion === true,
      compareAtPrice: compare,
    };
  });
}

async function buildStorePrompt(
  admin: ReturnType<typeof createAdminSupabase>,
  cfg: WhatsAppConfig
): Promise<{ slug: string; systemPrompt: string } | null> {
  if (!admin) return null;
  const { data: store } = await admin
    .from("stores")
    .select("name, slug")
    .eq("id", cfg.storeId)
    .maybeSingle();
  if (!store?.slug) return null;

  const { data: productRows } = await admin
    .from("products")
    .select("name, price, stock, description, category, is_promotion, compare_at_price")
    .eq("store_id", cfg.storeId)
    .eq("active", true)
    .order("created_at", { ascending: false })
    .limit(60);

  const systemPrompt = buildSystemPrompt({
    storeName: typeof store.name === "string" ? store.name : "Loja",
    slug: String(store.slug),
    faq: cfg.faq,
    aiName: cfg.aiName,
    aiTone: cfg.aiTone,
    products: mapProducts((productRows ?? []) as AnyObj[]),
    baseUrl: process.env.APP_BASE_URL || "",
    isFirstContact: false,
  });
  return { slug: String(store.slug), systemPrompt };
}

/** Roda o cron de follow-up. Protegido por CRON_SECRET (query ?key= ou header x-cron-key). */
async function run(req: Request) {
  const url = new URL(req.url);
  const key =
    url.searchParams.get("key") ?? req.headers.get("x-cron-key") ?? "";
  const secret = process.env.CRON_SECRET || "";
  if (!secret || key !== secret) {
    return NextResponse.json({ ok: false, error: "Não autorizado." }, { status: 401 });
  }

  const admin = createAdminSupabase();
  if (!admin || !isAiConfigured() || !isEvolutionConfigured()) {
    return NextResponse.json({ ok: true, skipped: true, sent: 0 });
  }

  const configs = await listFollowupConfigs(admin);
  const now = Date.now();
  let sent = 0;

  for (const cfg of configs) {
    if (sent >= MAX_TOTAL) break;
    if (globalPauseActive(cfg)) continue;

    const minMs = cfg.aiFollowupMinutes * 60_000;
    const [times, pausedSet, followupTimes] = await Promise.all([
      getConversationTimes(admin, cfg.storeId),
      getActivePausedPhones(admin, cfg.storeId),
      getFollowupTimes(admin, cfg.storeId),
    ]);

    // Seleciona quem está em silêncio dentro da janela e ainda não foi cutucado.
    const candidates: string[] = [];
    for (const [phone, t] of Array.from(times.entries())) {
      if (t.lastUserAt === 0) continue; // cliente nunca falou
      const idle = now - t.lastAnyAt;
      if (idle < minMs) continue; // ainda não deu o tempo
      if (idle > minMs * 3) continue; // muito antigo: não ressuscita
      if (pausedSet.has(phone)) continue; // já assumido/pausado
      if ((followupTimes.get(phone) ?? 0) >= t.lastUserAt) continue; // já cutucado
      candidates.push(phone);
      if (candidates.length >= MAX_PER_STORE) break;
    }
    if (candidates.length === 0) continue;

    const custom = cfg.aiFollowupMessage.trim();
    let prompt: Awaited<ReturnType<typeof buildStorePrompt>> = null;
    if (!custom) {
      prompt = await buildStorePrompt(admin, cfg);
      if (!prompt) continue; // sem loja/slug não dá para gerar
    }

    for (const phone of candidates) {
      if (sent >= MAX_TOTAL) break;
      try {
        let message = custom;
        if (!message && prompt) {
          const history = await getRecentHistory(admin, cfg.storeId, phone, 10);
          const reply = await generateFollowupReply(prompt.systemPrompt, history);
          message = reply ?? "";
        }
        if (!message) continue;

        await sendText(cfg.evolutionInstance, phone, message);
        await appendMessage(admin, cfg.storeId, phone, "assistant", message);
        await markFollowup(admin, cfg.storeId, phone);
        sent += 1;
      } catch (err) {
        console.error("[whatsapp/followups]", cfg.storeId, phone, err);
      }
    }
  }

  return NextResponse.json({ ok: true, sent });
}

export async function POST(req: Request) {
  return run(req);
}

// Permite acionar também por GET (alguns agendadores só fazem GET).
export async function GET(req: Request) {
  return run(req);
}
