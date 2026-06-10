import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import {
  appendMessage,
  getConfigByInstance,
  getRecentHistory,
  updateConnection,
} from "@/lib/whatsappConfig";
import { sendText } from "@/lib/evolution";
import {
  type AttendantProduct,
  buildSystemPrompt,
  generateReply,
  isAiConfigured,
} from "@/lib/ai/attendant";

export const runtime = "nodejs";

/** Sempre responde 200 — a Evolution não deve reenviar por erro nosso de processamento. */
function ok() {
  return NextResponse.json({ ok: true });
}

type AnyObj = Record<string, unknown>;

function asObj(v: unknown): AnyObj | null {
  return v && typeof v === "object" ? (v as AnyObj) : null;
}

/** Extrai o texto de uma mensagem do WhatsApp (conversation / extendedText). */
function extractText(message: AnyObj | null): string {
  if (!message) return "";
  if (typeof message.conversation === "string") return message.conversation;
  const ext = asObj(message.extendedTextMessage);
  if (ext && typeof ext.text === "string") return ext.text;
  return "";
}

function toEvolutionState(state: unknown): "connected" | "connecting" | "disconnected" {
  if (state === "open") return "connected";
  if (state === "connecting") return "connecting";
  return "disconnected";
}

export async function POST(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token") ?? "";

  let body: AnyObj;
  try {
    body = (await req.json()) as AnyObj;
  } catch {
    return ok();
  }

  const instance = typeof body.instance === "string" ? body.instance : "";
  const event = String(body.event ?? "").toLowerCase();
  if (!instance) return ok();

  const admin = createAdminSupabase();
  if (!admin) return ok();

  const cfg = await getConfigByInstance(admin, instance);
  // Valida o segredo do webhook — ignora chamadas não reconhecidas.
  if (!cfg || cfg.webhookToken !== token) return ok();

  // --- Atualização de conexão -------------------------------------------------
  if (event.includes("connection")) {
    const data = asObj(body.data);
    const state = toEvolutionState(data?.state);
    await updateConnection(admin, cfg.storeId, state);
    return ok();
  }

  // --- Mensagem recebida ------------------------------------------------------
  if (!event.includes("messages.upsert") && !event.includes("messages_upsert")) {
    return ok();
  }

  const rawData = asObj(body.data);
  const msg =
    rawData && Array.isArray(rawData.messages)
      ? asObj(rawData.messages[0])
      : rawData;
  if (!msg) return ok();

  const key = asObj(msg.key);
  if (!key || key.fromMe === true) return ok(); // ignora mensagens da própria loja

  const remoteJid = typeof key.remoteJid === "string" ? key.remoteJid : "";
  if (!remoteJid || remoteJid.endsWith("@g.us")) return ok(); // ignora grupos

  const text = extractText(asObj(msg.message)).trim();
  if (!text) return ok(); // só atende texto

  const customerPhone = remoteJid.split("@")[0];

  // Se a IA está desligada, não responde (mas a loja ainda recebe a mensagem normalmente).
  if (!cfg.aiEnabled || !isAiConfigured()) return ok();

  try {
    // Dados da loja + catálogo
    const { data: store } = await admin
      .from("stores")
      .select("name, slug")
      .eq("id", cfg.storeId)
      .maybeSingle();
    if (!store?.slug) return ok();

    const { data: productRows } = await admin
      .from("products")
      .select("name, price, stock, description, category, is_promotion, compare_at_price")
      .eq("store_id", cfg.storeId)
      .eq("active", true)
      .order("created_at", { ascending: false })
      .limit(60);

    const products: AttendantProduct[] = (productRows ?? []).map((p) => {
      const row = p as AnyObj;
      const price =
        typeof row.price === "number"
          ? row.price
          : parseFloat(String(row.price ?? 0)) || 0;
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

    const systemPrompt = buildSystemPrompt({
      storeName: typeof store.name === "string" ? store.name : "Loja",
      slug: String(store.slug),
      faq: cfg.faq,
      aiName: cfg.aiName,
      aiTone: cfg.aiTone,
      products,
      baseUrl: process.env.APP_BASE_URL || "",
    });

    const history = await getRecentHistory(admin, cfg.storeId, customerPhone, 10);
    await appendMessage(admin, cfg.storeId, customerPhone, "user", text);

    const reply = await generateReply(systemPrompt, history, text);
    if (reply) {
      await sendText(cfg.evolutionInstance, customerPhone, reply);
      await appendMessage(admin, cfg.storeId, customerPhone, "assistant", reply);
    }
  } catch (err) {
    console.error("[whatsapp/webhook]", err);
  }

  return ok();
}
