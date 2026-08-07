/**
 * CRM — campanhas (lista de disparo no WhatsApp).
 *
 * ⚠️ LEIA ANTES DE MEXER: o WhatsApp da loja roda em Evolution API (não
 * oficial). Disparo em massa é a forma mais rápida de o número ser banido, e o
 * número banido derruba JUNTO o atendimento da IA — que é o produto que o
 * lojista paga. Por isso todas as travas abaixo são CONSTANTES, não campos de
 * configuração: o lojista escolhe o público e o texto, e mais nada.
 *
 * Afrouxar qualquer número aqui é uma decisão de risco do dono do produto, não
 * um ajuste de performance.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendText } from "@/lib/evolution";
import {
  appendMessage,
  getActivePausedPhones,
  getConfig,
  globalPauseActive,
} from "@/lib/whatsappConfig";

// --- Travas ------------------------------------------------------------------

/** Intervalo entre dois envios (sorteado, para não virar um padrão de robô). */
export const GAP_MIN_MS = 12_000;
export const GAP_MAX_MS = 25_000;

/** Envios por loja em CADA passada do cron (~5 min) ⇒ ~36/hora. */
export const PER_RUN_PER_STORE = 3;

/** Respiro depois de um lote, antes de a loja ser considerada de novo. */
export const REST_MIN_MS = 45_000;
export const REST_MAX_MS = 120_000;

/** Teto de mensagens de campanha por loja por dia (fuso de São Paulo). */
export const DAILY_CAP = 60;

/** Número conectado há pouco tempo manda menos (aquecimento). */
export const WARMUP_DAYS = 7;
export const WARMUP_DAILY_CAP = 20;

/** Só dispara neste intervalo (hora cheia, horário de Brasília). */
export const WINDOW_START_HOUR = 8;
export const WINDOW_END_HOUR = 20;

/** O mesmo cliente não recebe duas campanhas dentro desta janela. */
export const CUSTOMER_COOLDOWN_DAYS = 7;

/** Teto de destinatários que uma campanha pode congelar. */
export const MAX_TARGETS = 2000;

/** Rodapé obrigatório — é o que torna o opt-out possível. Não é editável. */
export const OPT_OUT_FOOTER = "\n\nResponda SAIR para não receber mais.";

/** Palavras que tiram o cliente da lista (comparação EXATA, ver o webhook). */
export const OPT_OUT_WORDS = ["sair", "parar", "cancelar", "descadastrar", "stop"];

const CAMPAIGNS = "crm_campaigns";
const TARGETS = "crm_campaign_targets";

export type CampaignStatus =
  | "rascunho"
  | "enviando"
  | "pausada"
  | "concluida"
  | "cancelada";

// --- Fuso de São Paulo (sem lib) ---------------------------------------------

/**
 * Hora e dia no fuso de São Paulo. A Vercel roda em UTC: sem isto, o "dia" do
 * teto viraria 21h BRT e a janela de envio abriria de madrugada.
 */
function saoPauloParts(now = new Date()): { hour: number; ymd: string } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const hour = Number(get("hour"));
  return {
    // 24 aparece em algumas implementações no lugar de 0.
    hour: hour === 24 ? 0 : hour,
    ymd: `${get("year")}-${get("month")}-${get("day")}`,
  };
}

/** Estamos na janela em que é aceitável mandar promoção? */
export function insideSendWindow(now = new Date()): boolean {
  const { hour } = saoPauloParts(now);
  return hour >= WINDOW_START_HOUR && hour < WINDOW_END_HOUR;
}

/** Início do dia de São Paulo, em ISO — para contar o teto diário. */
function startOfSaoPauloDayIso(now = new Date()): string {
  const { ymd } = saoPauloParts(now);
  // -03:00 o ano inteiro (o Brasil não tem mais horário de verão).
  return new Date(`${ymd}T00:00:00-03:00`).toISOString();
}

function randomBetween(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// --- Mensagem ----------------------------------------------------------------

/** Personaliza o texto. `{nome}` é obrigatório na campanha (validado na API). */
export function renderCampaignMessage(template: string, name: string): string {
  const first = (name || "").trim().split(/\s+/)[0] ?? "";
  // Sem nome salvo, "Oi {nome}!" viraria "Oi !" — cai numa saudação neutra.
  const safe = first || "tudo bem";
  return template.replace(/\{nome\}/gi, safe) + OPT_OUT_FOOTER;
}

// --- Execução (chamada pelo cron de followups) --------------------------------

type Admin = SupabaseClient;
type Row = Record<string, unknown>;

/** Quantas mensagens de campanha esta loja já mandou hoje (fuso de SP). */
async function sentToday(admin: Admin, storeId: string): Promise<number> {
  const { count } = await admin
    .from(TARGETS)
    .select("id", { count: "exact", head: true })
    .eq("store_id", storeId)
    .eq("status", "enviado")
    .gte("sent_at", startOfSaoPauloDayIso());
  return count ?? 0;
}

/** Teto de hoje: menor durante o aquecimento do número. */
async function dailyCapFor(admin: Admin, storeId: string): Promise<number> {
  const { data } = await admin
    .from("store_whatsapp")
    .select("updated_at")
    .eq("store_id", storeId)
    .maybeSingle();
  const since = (data as Row | null)?.updated_at;
  if (!since) return WARMUP_DAILY_CAP;
  const days = (Date.now() - new Date(String(since)).getTime()) / 86_400_000;
  return days < WARMUP_DAYS ? WARMUP_DAILY_CAP : DAILY_CAP;
}

/**
 * Reserva um destinatário com lock otimista — mesmo padrão do
 * `claimPendingReply` do debounce. Dois crons simultâneos nunca mandam a mesma
 * mensagem duas vezes.
 */
async function claimTarget(admin: Admin, campaignId: string): Promise<Row | null> {
  const nowIso = new Date().toISOString();
  const { data: candidates } = await admin
    .from(TARGETS)
    .select("id, customer_id, wa_phone, name, status, claimed_until")
    .eq("campaign_id", campaignId)
    .in("status", ["pendente", "enviando"])
    .order("status", { ascending: true })
    .limit(10);

  for (const row of (candidates ?? []) as Row[]) {
    const status = String(row.status);
    const claimed = row.claimed_until ? String(row.claimed_until) : null;
    // "enviando" travado só volta à fila depois que a reserva vence (o cron
    // anterior pode ter morrido no meio).
    if (status === "enviando" && claimed && claimed > nowIso) continue;

    const { data: locked } = await admin
      .from(TARGETS)
      .update({
        status: "enviando",
        claimed_until: new Date(Date.now() + 120_000).toISOString(),
      })
      .eq("id", row.id)
      .eq("status", status)
      .select("id, customer_id, wa_phone, name")
      .maybeSingle();

    if (locked) return locked as Row;
  }
  return null;
}

/** Fecha a campanha quando não sobrou ninguém pendente. */
async function finishIfDone(admin: Admin, campaignId: string): Promise<void> {
  const { count } = await admin
    .from(TARGETS)
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaignId)
    .in("status", ["pendente", "enviando"]);
  if ((count ?? 0) > 0) return;

  await admin
    .from(CAMPAIGNS)
    .update({
      status: "concluida",
      finished_at: new Date().toISOString(),
      next_send_at: null,
    })
    .eq("id", campaignId);
}

/**
 * Roda as campanhas ativas. Chamada pelo cron que já existe
 * (/api/whatsapp/followups), então NÃO há agendamento novo a configurar.
 *
 * `deadline` é o instante em que a execução precisa parar — a mesma passada do
 * cron ainda faz follow-up, pós-venda, carrinho e purga, e os `sleep` daqui não
 * podem comer o tempo dos outros.
 */
export async function runCampaigns(admin: Admin, deadline: number): Promise<number> {
  if (!insideSendWindow()) return 0;

  const nowIso = new Date().toISOString();
  const { data: campaigns } = await admin
    .from(CAMPAIGNS)
    .select("id, store_id, message, sent, failed")
    .eq("status", "enviando")
    .or(`next_send_at.is.null,next_send_at.lte.${nowIso}`)
    .limit(20);

  let total = 0;

  for (const c of (campaigns ?? []) as Row[]) {
    if (Date.now() > deadline) break;

    const campaignId = String(c.id);
    const storeId = String(c.store_id);
    const template = String(c.message ?? "");

    // --- pré-condições da loja
    const cfg = await getConfig(admin, storeId);
    if (!cfg || cfg.connectionStatus !== "connected" || !cfg.connectedNumber) continue;
    // Loja com a IA pausada em geral não é hora de mandar promoção.
    if (globalPauseActive(cfg)) continue;

    const cap = await dailyCapFor(admin, storeId);
    const already = await sentToday(admin, storeId);
    if (already >= cap) continue;

    const pausedPhones = await getActivePausedPhones(admin, storeId);
    const budget = Math.min(PER_RUN_PER_STORE, cap - already);
    let sentNow = 0;

    for (let i = 0; i < budget; i++) {
      if (Date.now() > deadline) break;

      const target = await claimTarget(admin, campaignId);
      if (!target) break;

      const targetId = String(target.id);
      const customerId = String(target.customer_id);
      const phone = String(target.wa_phone ?? "").replace(/\D/g, "");

      // O cliente pode ter saído da lista DEPOIS de a campanha ser criada
      // (o público é congelado, a vontade dele não).
      const { data: cust } = await admin
        .from("crm_customers")
        .select("opted_out_at")
        .eq("store_id", storeId)
        .eq("id", customerId)
        .maybeSingle();

      const optedOut = Boolean((cust as Row | null)?.opted_out_at);
      const isPaused = pausedPhones.has(phone);

      if (!phone || optedOut || isPaused) {
        await admin
          .from(TARGETS)
          .update({
            status: "pulado",
            claimed_until: null,
            error: optedOut
              ? "Cliente pediu para não receber."
              : isPaused
                ? "Conversa em atendimento manual."
                : "Telefone inválido.",
          })
          .eq("id", targetId);
        continue;
      }

      // Ritmo humano ANTES de mandar (nunca dois envios colados).
      if (sentNow > 0) await sleep(randomBetween(GAP_MIN_MS, GAP_MAX_MS));

      const text = renderCampaignMessage(template, String(target.name ?? ""));

      try {
        const waId = await sendText(cfg.evolutionInstance, phone, text);
        await admin
          .from(TARGETS)
          .update({
            status: "enviado",
            sent_at: new Date().toISOString(),
            claimed_until: null,
            error: null,
          })
          .eq("id", targetId);

        // Aparece na conversa do painel, como qualquer mensagem da loja.
        await appendMessage(admin, storeId, phone, "assistant", text, {
          waMessageId: waId,
          sender: "owner",
        });

        await admin
          .from("crm_customers")
          .update({ last_campaign_at: new Date().toISOString() })
          .eq("store_id", storeId)
          .eq("id", customerId);

        sentNow++;
        total++;
      } catch (err) {
        console.error("[crm/campaigns] envio", err);
        await admin
          .from(TARGETS)
          .update({
            status: "falhou",
            claimed_until: null,
            error: String(err).slice(0, 300),
          })
          .eq("id", targetId);
      }
    }

    // Recontagem real (em vez de somar em memória): o painel mostra a verdade
    // mesmo se uma execução anterior tiver morrido no meio.
    const [{ count: sentCount }, { count: failCount }] = await Promise.all([
      admin
        .from(TARGETS)
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", campaignId)
        .eq("status", "enviado"),
      admin
        .from(TARGETS)
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", campaignId)
        .eq("status", "falhou"),
    ]);

    await admin
      .from(CAMPAIGNS)
      .update({
        sent: sentCount ?? 0,
        failed: failCount ?? 0,
        next_send_at: new Date(
          Date.now() + randomBetween(REST_MIN_MS, REST_MAX_MS)
        ).toISOString(),
      })
      .eq("id", campaignId);

    await finishIfDone(admin, campaignId);
  }

  return total;
}

// --- Opt-out (chamado pelo webhook) -------------------------------------------

/**
 * O cliente pediu para sair? Comparação EXATA com a lista de palavras — um
 * `includes` tiraria da lista quem escreveu "vou sair agora" ou "quero cancelar
 * meu pedido", que é justamente quem está falando com a loja.
 */
export function isOptOutMessage(text: string): boolean {
  const clean = text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
  return OPT_OUT_WORDS.includes(clean);
}

/** Marca o cliente como fora das campanhas. Não mexe no atendimento. */
export async function markOptOut(
  admin: Admin,
  storeId: string,
  phone: string
): Promise<boolean> {
  const { crmPhoneKey } = await import("@/lib/crm/phone");
  const key = crmPhoneKey(phone);
  if (!key) return false;
  try {
    const { data } = await admin
      .from("crm_customers")
      .update({ opted_out_at: new Date().toISOString() })
      .eq("store_id", storeId)
      .eq("phone_key", key)
      .select("id")
      .maybeSingle();
    return Boolean(data);
  } catch (err) {
    console.error("[crm/campaigns] markOptOut", err);
    return false;
  }
}
