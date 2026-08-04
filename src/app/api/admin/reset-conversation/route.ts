import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { isCustomerPhoneValid, phoneDigitsOnly, toWhatsAppNumber } from "@/lib/customerPhone";

export const runtime = "nodejs";

/**
 * Tabelas que guardam o "estado" de uma conversa com um cliente. Zerar a
 * conversa = apagar a linha do cliente em todas elas, para o próximo "oi" cair
 * de novo no PRIMEIRO CONTATO (a IA se apresenta e recomeça do zero).
 *
 * `whatsapp_contacts` fica de fora daqui: o nome salvo só é apagado quando o
 * admin marca "esquecer o nome" (é justamente o que permite testar os dois
 * caminhos — cliente novo × cliente da casa chamado pelo nome).
 */
const CONVERSATION_TABLES = [
  "whatsapp_messages", // histórico (é ele que define "primeiro contato")
  "whatsapp_pending_replies", // agendamento do debounce
  "whatsapp_pauses", // pausa por cliente (handoff)
  "whatsapp_followups", // marca de "já cutuquei"
  "whatsapp_abandoned_carts", // rascunho de carrinho
  "whatsapp_conversation_tags", // etiquetas do painel
] as const;

type Body = { storeId?: string; phone?: string; forgetName?: boolean };

/**
 * Zera a conversa de um cliente numa loja (ferramenta de teste do dono do SaaS).
 * Só admin. Escreve por service role — essas tabelas não têm policy de escrita.
 */
export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ ok: false, error: "Não autorizado." }, { status: 401 });
  }
  const db = createAdminSupabase();
  if (!db) {
    return NextResponse.json({ ok: false, error: "Service role não configurada." }, { status: 503 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido." }, { status: 400 });
  }

  const storeId = String(body.storeId ?? "").trim();
  if (!storeId) {
    return NextResponse.json({ ok: false, error: "storeId obrigatório." }, { status: 400 });
  }
  const rawPhone = String(body.phone ?? "");
  if (!isCustomerPhoneValid(rawPhone)) {
    return NextResponse.json(
      { ok: false, error: "Telefone inválido. Use DDD + número (ex.: 81 99645-4656)." },
      { status: 400 }
    );
  }

  // O mesmo cliente aparece em formatos diferentes (com/sem DDI 55, com/sem o 9
  // do celular), então o casamento é pelos 8 últimos dígitos — igual ao
  // `samePhone` do painel de conversas.
  const digits = phoneDigitsOnly(rawPhone);
  const tail = digits.slice(-8);
  const canonical = toWhatsAppNumber(rawPhone);

  let deleted = 0;
  const failed: string[] = [];
  for (const table of CONVERSATION_TABLES) {
    const { error, count } = await db
      .from(table)
      .delete({ count: "exact" })
      .eq("store_id", storeId)
      .like("customer_phone", `%${tail}`);
    // Tabela ausente (migration não aplicada) não pode derrubar o resto.
    if (error) failed.push(table);
    else deleted += count ?? 0;
  }

  let nameCleared = false;
  if (body.forgetName) {
    const { error } = await db
      .from("whatsapp_contacts")
      .delete()
      .eq("store_id", storeId)
      .like("customer_phone", `%${tail}`);
    nameCleared = !error;
  }

  return NextResponse.json({
    ok: true,
    phone: canonical,
    deleted,
    nameCleared,
    // Só informativo: tabela que não existe neste projeto não é erro de verdade.
    skipped: failed,
  });
}
