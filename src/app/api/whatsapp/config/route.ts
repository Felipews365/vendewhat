import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { AI_TONES, type AiTone, ensureConfig, saveAiConfig } from "@/lib/whatsappConfig";
import { isShortMapsLink, parseLatLng, resolveMapsLatLng } from "@/lib/geoLocation";

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
  aiLocationAddress?: string;
  /** Link do Google Maps (ou "lat,lng") de onde a loja fica. */
  aiLocationUrl?: string;
  aiStorePhotoUrl?: string;
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
    .select("id")
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
    aiLocationAddress:
      typeof body.aiLocationAddress === "string" ? body.aiLocationAddress : "",
    aiLocationUrl: locationUrl,
    aiLocationLat: coords ? coords.lat : null,
    aiLocationLng: coords ? coords.lng : null,
    aiStorePhotoUrl:
      typeof body.aiStorePhotoUrl === "string" ? body.aiStorePhotoUrl : "",
  });

  return NextResponse.json({
    ok: true,
    // Avisa o painel se um link de mapa foi colado mas não deu para extrair o pino.
    locationParsed: rawLocationUrl.trim() ? Boolean(coords) : null,
    // Link canônico (quando resolvemos um encurtado) para o painel reexibir.
    resolvedUrl: locationUrl,
  });
}
