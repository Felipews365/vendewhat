import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import {
  appendMessage,
  getActivePausedPhones,
  getConversationTimes,
  getFollowupTimes,
  getRecentHistory,
  globalPauseActive,
  listAbandonedCartConfigs,
  listDueAbandonedCarts,
  listDuePostsaleOrders,
  listFollowupConfigs,
  listPostsaleConfigs,
  markCartRecovered,
  markFollowup,
  markPostsaleSent,
  type WhatsAppConfig,
} from "@/lib/whatsappConfig";
import { toWhatsAppNumber } from "@/lib/customerPhone";
import { consumeTokens, hasAiBalance, storePlanHasAi } from "@/lib/aiCredits";
import { isEvolutionConfigured, sendText } from "@/lib/evolution";
import {
  type AttendantProduct,
  buildSystemPrompt,
  defaultPostsaleMessage,
  generateAbandonedCartReply,
  generateFollowupReply,
  generatePostsaleReply,
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
): Promise<{ slug: string; storeName: string; systemPrompt: string } | null> {
  if (!admin) return null;
  const { data: store } = await admin
    .from("stores")
    .select("name, slug")
    .eq("id", cfg.storeId)
    .maybeSingle();
  if (!store?.slug) return null;

  const storeName = typeof store.name === "string" ? store.name : "Loja";
  const { data: productRows } = await admin
    .from("products")
    .select("name, price, stock, description, category, is_promotion, compare_at_price")
    .eq("store_id", cfg.storeId)
    .eq("active", true)
    .order("created_at", { ascending: false })
    .limit(60);

  const systemPrompt = buildSystemPrompt({
    storeName,
    slug: String(store.slug),
    faq: cfg.faq,
    aiName: cfg.aiName,
    products: mapProducts((productRows ?? []) as AnyObj[]),
    baseUrl: process.env.APP_BASE_URL || "",
    isFirstContact: false,
    onlineOnly: cfg.aiOnlineOnly,
  });
  return { slug: String(store.slug), storeName, systemPrompt };
}

/** Nome da loja (para a mensagem de pós-venda sem IA). */
async function getStoreName(
  admin: ReturnType<typeof createAdminSupabase>,
  storeId: string
): Promise<string> {
  if (!admin) return "Loja";
  const { data } = await admin
    .from("stores")
    .select("name")
    .eq("id", storeId)
    .maybeSingle();
  return typeof data?.name === "string" && data.name.trim() ? data.name : "Loja";
}

/** Cutuca clientes que ficaram em silêncio. Precisa da IA configurada. */
async function runSilenceFollowups(
  admin: NonNullable<ReturnType<typeof createAdminSupabase>>
): Promise<number> {
  const configs = await listFollowupConfigs(admin);
  const now = Date.now();
  let sent = 0;

  for (const cfg of configs) {
    if (sent >= MAX_TOTAL) break;
    if (globalPauseActive(cfg)) continue;
    if (!(await storePlanHasAi(admin, cfg.storeId))) continue; // plano "Sem IA"

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
          // Follow-up por IA consome créditos: sem saldo, não cutuca (mensagem
          // fixa continua funcionando, pois não passa por aqui).
          const bal = await hasAiBalance(admin, cfg.storeId);
          if (!bal.ok) continue;
          const history = await getRecentHistory(admin, cfg.storeId, phone, 10);
          const reply = await generateFollowupReply(prompt.systemPrompt, history);
          if (reply) {
            message = reply.text;
            await consumeTokens(admin, cfg.storeId, reply.tokens, {
              customerPhone: phone,
              kind: "followup",
            });
          }
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
  return sent;
}

/**
 * Pós-venda: dias após o pedido, pergunta se chegou tudo certinho.
 * Usa mensagem fixa quando a loja escreveu uma; senão gera com a IA (e, se a IA
 * não estiver disponível, cai numa mensagem padrão).
 */
async function runPostsale(
  admin: NonNullable<ReturnType<typeof createAdminSupabase>>
): Promise<number> {
  const configs = await listPostsaleConfigs(admin);
  const aiOn = isAiConfigured();
  let sent = 0;

  for (const cfg of configs) {
    if (sent >= MAX_TOTAL) break;
    if (globalPauseActive(cfg)) continue;

    if (!(await storePlanHasAi(admin, cfg.storeId))) continue; // plano "Sem IA"

    const [orders, pausedSet] = await Promise.all([
      listDuePostsaleOrders(admin, cfg.storeId, cfg.aiPostsaleDays, MAX_PER_STORE),
      getActivePausedPhones(admin, cfg.storeId),
    ]);
    if (orders.length === 0) continue;

    const custom = cfg.aiPostsaleMessage.trim();
    // Só monta o prompt da IA quando vai realmente gerar a mensagem.
    let prompt: Awaited<ReturnType<typeof buildStorePrompt>> = null;
    let storeName = "";
    if (!custom) {
      if (aiOn) prompt = await buildStorePrompt(admin, cfg);
      storeName = prompt?.storeName ?? (await getStoreName(admin, cfg.storeId));
    }

    for (const order of orders) {
      if (sent >= MAX_TOTAL) break;
      const phone = toWhatsAppNumber(order.customerPhone);
      if (!phone) {
        await markPostsaleSent(admin, order.id); // telefone inválido: não tenta de novo
        continue;
      }
      if (pausedSet.has(phone)) continue; // loja assumiu este cliente
      try {
        let message = custom;
        if (!message) {
          // Pós-venda por IA consome créditos; sem saldo, cai na mensagem padrão
          // (grátis, sem IA) — o pós-venda ainda sai, só não personalizado.
          if (prompt) {
            const bal = await hasAiBalance(admin, cfg.storeId);
            if (bal.ok) {
              const reply = await generatePostsaleReply(
                prompt.systemPrompt,
                order.customerName,
                order.orderNumber
              );
              if (reply) {
                message = reply.text;
                await consumeTokens(admin, cfg.storeId, reply.tokens, {
                  customerPhone: phone,
                  kind: "postsale",
                });
              }
            }
          }
          if (!message) {
            message = defaultPostsaleMessage(
              storeName,
              order.customerName,
              order.orderNumber
            );
          }
        }
        if (!message) continue;

        await sendText(cfg.evolutionInstance, phone, message);
        await appendMessage(admin, cfg.storeId, phone, "assistant", message);
        await markPostsaleSent(admin, order.id);
        sent += 1;
      } catch (err) {
        console.error("[whatsapp/postsale]", cfg.storeId, order.id, err);
      }
    }
  }
  return sent;
}

/**
 * Recuperação de carrinho abandonado: cutuca quem montou o carrinho na loja
 * (deixando nome + telefone) mas não finalizou. Depende da IA configurada
 * quando a loja não escreveu uma mensagem fixa.
 */
async function runAbandonedCarts(
  admin: NonNullable<ReturnType<typeof createAdminSupabase>>
): Promise<number> {
  const configs = await listAbandonedCartConfigs(admin);
  const aiOn = isAiConfigured();
  let sent = 0;

  for (const cfg of configs) {
    if (sent >= MAX_TOTAL) break;
    if (globalPauseActive(cfg)) continue;

    if (!(await storePlanHasAi(admin, cfg.storeId))) continue; // plano "Sem IA"

    const [carts, pausedSet] = await Promise.all([
      listDueAbandonedCarts(admin, cfg.storeId, cfg.aiCartMinutes, MAX_PER_STORE),
      getActivePausedPhones(admin, cfg.storeId),
    ]);
    if (carts.length === 0) continue;

    const custom = cfg.aiCartMessage.trim();
    // Só monta o prompt da IA quando vai realmente gerar a mensagem.
    let prompt: Awaited<ReturnType<typeof buildStorePrompt>> = null;
    if (!custom) {
      if (!aiOn) continue; // sem IA e sem mensagem fixa: não dá para cutucar
      prompt = await buildStorePrompt(admin, cfg);
      if (!prompt) continue;
    }

    for (const cart of carts) {
      if (sent >= MAX_TOTAL) break;
      const phone = cart.customerPhone; // já normalizado no upsert
      if (pausedSet.has(phone)) continue; // loja assumiu este cliente
      try {
        let message = custom;
        if (!message && prompt) {
          // Recuperação por IA consome créditos: sem saldo, não cutuca.
          const bal = await hasAiBalance(admin, cfg.storeId);
          if (!bal.ok) continue;
          const reply = await generateAbandonedCartReply(
            prompt.systemPrompt,
            cart.customerName,
            cart.items
          );
          if (reply) {
            message = reply.text;
            await consumeTokens(admin, cfg.storeId, reply.tokens, {
              customerPhone: phone,
              kind: "cart",
            });
          }
        }
        if (!message) continue;

        await sendText(cfg.evolutionInstance, phone, message);
        await appendMessage(admin, cfg.storeId, phone, "assistant", message);
        await markCartRecovered(admin, cart.id);
        sent += 1;
      } catch (err) {
        console.error("[whatsapp/abandoned-cart]", cfg.storeId, cart.id, err);
      }
    }
  }
  return sent;
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
  if (!admin || !isEvolutionConfigured()) {
    return NextResponse.json({ ok: true, skipped: true, sent: 0 });
  }

  let sent = 0;
  // Follow-up de silêncio depende da IA; pós-venda funciona com mensagem fixa.
  if (isAiConfigured()) {
    sent += await runSilenceFollowups(admin);
  }
  sent += await runPostsale(admin);
  sent += await runAbandonedCarts(admin);

  return NextResponse.json({ ok: true, sent });
}

export async function POST(req: Request) {
  return run(req);
}

// Permite acionar também por GET (alguns agendadores só fazem GET).
export async function GET(req: Request) {
  return run(req);
}
