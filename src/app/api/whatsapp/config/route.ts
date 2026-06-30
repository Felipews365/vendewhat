import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { AI_TONES, type AiTone, ensureConfig, saveAiConfig } from "@/lib/whatsappConfig";

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
  });

  return NextResponse.json({ ok: true });
}
