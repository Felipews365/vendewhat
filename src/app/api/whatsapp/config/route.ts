import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { AI_TONES, type AiTone, ensureConfig, saveAiConfig } from "@/lib/whatsappConfig";
import { isShortMapsLink, parseLatLng, resolveMapsLatLng } from "@/lib/geoLocation";
import { saleModeFromDb } from "@/lib/storefront";

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
  /** Modo de venda (varejo/atacado/ambos) — mora no storefront. */
  saleMode?: string;
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
  if (typeof body.saleMode === "string") {
    sfPatch.saleMode = saleModeFromDb(body.saleMode);
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
