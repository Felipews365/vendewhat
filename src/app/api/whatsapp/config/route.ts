import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { AI_TONES, type AiTone, ensureConfig, saveAiConfig } from "@/lib/whatsappConfig";
import { isShortMapsLink, parseLatLng, resolveMapsLatLng } from "@/lib/geoLocation";
import {
  saleModeFromDb,
  minOrderTypeFromDb,
  attendanceDaysFromDb,
} from "@/lib/storefront";

export const runtime = "nodejs";

type Body = {
  aiEnabled?: boolean;
  aiName?: string;
  aiTone?: string;
  faq?: string;
  aiHandoffMinutes?: number;
  aiFollowupMinutes?: number;
  aiFollowupMessage?: string;
  aiPostsaleDays?: number;
  aiPostsaleMessage?: string;
  aiCartMinutes?: number;
  aiCartMessage?: string;
  aiOnlineOnly?: boolean;
  aiLocationAddress?: string;
  /** Link do Google Maps (ou "lat,lng") de onde a loja fica. */
  aiLocationUrl?: string;
  aiStorePhotoUrl?: string;
  aiStoreVideoUrl?: string;
  /** Toggle "A IA envia a chave Pix ao fechar o pedido" — mora no storefront. */
  aiSendPixOnCheckout?: boolean;
  /** Chave Pix + titular (moram no storefront). */
  pixKey?: string;
  pixName?: string;
  /** Modo de venda (varejo/atacado/ambos) — mora no storefront. */
  saleMode?: string;
  /** Cidade/UF da loja só online — mora no storefront. */
  onlineCity?: string;
  /** Link do grupo do WhatsApp — mora no storefront (IA envia + aparece na loja). */
  groupUrl?: string;
  /** Dias da semana em que a loja atende — mora no storefront. */
  attendanceDays?: unknown;
  /** Horário de atendimento (texto livre) — mora no storefront. */
  attendanceHours?: string;
  // Configurações da IA que reaproveitam campos reais do storefront (checkout).
  checkoutPixEnabled?: boolean;
  checkoutCardEnabled?: boolean;
  shipExcursaoEnabled?: boolean;
  shipCorreiosEnabled?: boolean;
  shipTransportadoraEnabled?: boolean;
  shipRetiradaEnabled?: boolean;
  minOrderEnabled?: boolean;
  minOrderType?: string;
  minOrderValue?: number;
  minOrderQty?: number;
  minOrderMessage?: string;
};

export async function POST(req: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });
  }

  const { data: store } = await supabase
    .from("stores")
    .select("id, storefront")
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

  const admin = createAdminSupabase();
  if (!admin) {
    return NextResponse.json({ ok: false, error: "Servidor sem service role." }, { status: 503 });
  }

  await ensureConfig(admin, store.id as string);
  const tone: AiTone = AI_TONES.includes(body.aiTone as AiTone)
    ? (body.aiTone as AiTone)
    : "simpatico";
  const rawLocationUrl =
    typeof body.aiLocationUrl === "string" ? body.aiLocationUrl : "";
  // Tenta ler o ponto direto; se for link encurtado, segue o redirecionamento.
  let coords = parseLatLng(rawLocationUrl);
  let locationUrl = rawLocationUrl;
  if (!coords && isShortMapsLink(rawLocationUrl)) {
    coords = await resolveMapsLatLng(rawLocationUrl);
    if (coords) {
      // Guarda uma URL canônica (com o ponto) para reabrir já reconhecida.
      locationUrl = `https://www.google.com/maps/search/?api=1&query=${coords.lat},${coords.lng}`;
    }
  }
  await saveAiConfig(admin, store.id as string, {
    aiEnabled: body.aiEnabled === true,
    aiName: typeof body.aiName === "string" ? body.aiName : "Atendente",
    aiTone: tone,
    faq: typeof body.faq === "string" ? body.faq : "",
    aiHandoffMinutes:
      typeof body.aiHandoffMinutes === "number" ? body.aiHandoffMinutes : 30,
    aiFollowupMinutes:
      typeof body.aiFollowupMinutes === "number" ? body.aiFollowupMinutes : 0,
    aiFollowupMessage:
      typeof body.aiFollowupMessage === "string" ? body.aiFollowupMessage : "",
    aiPostsaleDays:
      typeof body.aiPostsaleDays === "number" ? body.aiPostsaleDays : 0,
    aiPostsaleMessage:
      typeof body.aiPostsaleMessage === "string" ? body.aiPostsaleMessage : "",
    aiCartMinutes:
      typeof body.aiCartMinutes === "number" ? body.aiCartMinutes : 0,
    aiCartMessage:
      typeof body.aiCartMessage === "string" ? body.aiCartMessage : "",
    aiOnlineOnly: body.aiOnlineOnly === true,
    aiLocationAddress:
      typeof body.aiLocationAddress === "string" ? body.aiLocationAddress : "",
    aiLocationUrl: locationUrl,
    aiLocationLat: coords ? coords.lat : null,
    aiLocationLng: coords ? coords.lng : null,
    aiStorePhotoUrl:
      typeof body.aiStorePhotoUrl === "string" ? body.aiStorePhotoUrl : "",
    aiStoreVideoUrl:
      typeof body.aiStoreVideoUrl === "string" ? body.aiStoreVideoUrl : "",
  });

  // Campos da IA que moram no JSONB storefront (o toggle "A IA envia a chave Pix"
  // e o modo de venda). Faz um patch preservando o resto do storefront; só grava
  // os campos que vieram no corpo.
  const sfPatch: Record<string, unknown> = {};
  if (typeof body.aiSendPixOnCheckout === "boolean") {
    sfPatch.aiSendPixOnCheckout = body.aiSendPixOnCheckout;
  }
  if (typeof body.pixKey === "string") {
    sfPatch.pixKey = body.pixKey.trim().slice(0, 200);
  }
  if (typeof body.pixName === "string") {
    sfPatch.pixName = body.pixName.trim().slice(0, 200);
  }
  if (typeof body.saleMode === "string") {
    sfPatch.saleMode = saleModeFromDb(body.saleMode);
  }
  if (typeof body.onlineCity === "string") {
    sfPatch.onlineCity = body.onlineCity.trim().slice(0, 120);
  }
  if (typeof body.groupUrl === "string") {
    sfPatch.groupUrl = body.groupUrl.trim().slice(0, 300);
  }
  if (Array.isArray(body.attendanceDays)) {
    sfPatch.attendanceDays = attendanceDaysFromDb(body.attendanceDays);
  }
  if (typeof body.attendanceHours === "string") {
    sfPatch.attendanceHours = body.attendanceHours.slice(0, 120);
  }
  // Formas de pagamento (aceitaPix/aceitaCartao) e de envio — booleanos diretos.
  const boolKeys = [
    "checkoutPixEnabled",
    "checkoutCardEnabled",
    "shipExcursaoEnabled",
    "shipCorreiosEnabled",
    "shipTransportadoraEnabled",
    "shipRetiradaEnabled",
    "minOrderEnabled",
  ] as const;
  for (const k of boolKeys) {
    if (typeof body[k] === "boolean") sfPatch[k] = body[k];
  }
  // Pedido mínimo: tipo, valores e mensagem.
  if (typeof body.minOrderType === "string") {
    sfPatch.minOrderType = minOrderTypeFromDb(body.minOrderType);
  }
  if (typeof body.minOrderValue === "number" && Number.isFinite(body.minOrderValue)) {
    sfPatch.minOrderValue = Math.max(0, body.minOrderValue);
  }
  if (typeof body.minOrderQty === "number" && Number.isFinite(body.minOrderQty)) {
    sfPatch.minOrderQty = Math.max(0, Math.floor(body.minOrderQty));
  }
  if (typeof body.minOrderMessage === "string") {
    sfPatch.minOrderMessage = body.minOrderMessage.slice(0, 500);
  }
  if (Object.keys(sfPatch).length > 0) {
    const current =
      store.storefront && typeof store.storefront === "object"
        ? (store.storefront as Record<string, unknown>)
        : {};
    await admin
      .from("stores")
      .update({ storefront: { ...current, ...sfPatch } })
      .eq("id", store.id as string);
  }

  return NextResponse.json({
    ok: true,
    // Avisa o painel se um link de mapa foi colado mas não deu para extrair o pino.
    locationParsed: rawLocationUrl.trim() ? Boolean(coords) : null,
    // Link canônico (quando resolvemos um encurtado) para o painel reexibir.
    resolvedUrl: locationUrl,
  });
}
