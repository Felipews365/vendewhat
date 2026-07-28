import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import {
  EMPTY_VERIFICATION_FORM,
  VERIFICATION_LIMITS,
  isValidCpf,
  normalizeVerificationStatus,
  onlyDigits,
  validateVerificationForm,
  type VerificationFormData,
} from "@/lib/storeVerification";

export const runtime = "nodejs";

/** Loja do usuário logado (id + slug), ou null. */
async function ownerStore() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: store } = await supabase
    .from("stores")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!store) return null;
  return { userId: user.id, storeId: store.id as string, email: user.email ?? null };
}

/** Status + dados já enviados (para pré-preencher o formulário de atualização). */
export async function GET() {
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
  if (!store) {
    return NextResponse.json({ ok: true, status: "none", form: EMPTY_VERIFICATION_FORM });
  }

  // RLS deixa o dono ler a própria verificação (a tabela pode não existir ainda).
  const { data, error } = await supabase
    .from("store_verifications")
    .select(
      "full_name, cpf, birth_date, cep, street, number, complement, neighborhood, city, uf, selfie_path, doc_front_path, doc_back_path, status, review_notes, reviewed_at"
    )
    .eq("store_id", store.id)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ ok: true, status: "none", form: EMPTY_VERIFICATION_FORM });
  }

  const form: VerificationFormData = {
    fullName: data.full_name ?? "",
    cpf: data.cpf ?? "",
    birthDate: (data.birth_date as string | null) ?? "",
    cep: data.cep ?? "",
    street: data.street ?? "",
    number: data.number ?? "",
    complement: data.complement ?? "",
    neighborhood: data.neighborhood ?? "",
    city: data.city ?? "",
    uf: data.uf ?? "",
  };
  return NextResponse.json({
    ok: true,
    status: normalizeVerificationStatus(data.status),
    reviewNotes: data.review_notes ?? null,
    form,
    hasFiles: {
      selfie: Boolean(data.selfie_path),
      docFront: Boolean(data.doc_front_path),
      docBack: Boolean(data.doc_back_path),
    },
  });
}

type Body = Partial<VerificationFormData> & {
  selfiePath?: string;
  docFrontPath?: string;
  docBackPath?: string;
};

function cap(v: unknown, max: number): string {
  return String(v ?? "").trim().slice(0, max);
}

/** Recebe o cadastro do lojista e grava como `pending` (só via service role). */
export async function POST(req: Request) {
  const owner = await ownerStore();
  if (!owner) {
    return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });
  }
  const db = createAdminSupabase();
  if (!db) {
    return NextResponse.json(
      { ok: false, error: "Serviço indisponível no momento." },
      { status: 503 }
    );
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido." }, { status: 400 });
  }

  const form: VerificationFormData = {
    fullName: cap(body.fullName, VERIFICATION_LIMITS.text),
    cpf: onlyDigits(cap(body.cpf, 20)),
    birthDate: cap(body.birthDate, 10),
    cep: onlyDigits(cap(body.cep, 12)),
    street: cap(body.street, VERIFICATION_LIMITS.text),
    number: cap(body.number, 20),
    complement: cap(body.complement, VERIFICATION_LIMITS.text),
    neighborhood: cap(body.neighborhood, VERIFICATION_LIMITS.text),
    city: cap(body.city, VERIFICATION_LIMITS.text),
    uf: cap(body.uf, VERIFICATION_LIMITS.uf).toUpperCase(),
  };

  const errors = validateVerificationForm(form);
  if (errors.length > 0) {
    return NextResponse.json({ ok: false, error: errors.join(" ") }, { status: 400 });
  }
  if (!isValidCpf(form.cpf)) {
    return NextResponse.json({ ok: false, error: "CPF inválido." }, { status: 400 });
  }

  // Caminhos de arquivo só valem se estiverem na PASTA desta loja (defesa extra
  // além da policy de storage). Vazio = mantém o que já havia (atualização parcial).
  const prefix = `${owner.storeId}/`;
  const safePath = (p: unknown): string | null => {
    const s = String(p ?? "").trim();
    if (!s) return null;
    return s.startsWith(prefix) ? s.slice(0, 400) : null;
  };
  const selfiePath = safePath(body.selfiePath);
  const docFrontPath = safePath(body.docFrontPath);
  const docBackPath = safePath(body.docBackPath);

  // Lê o que já existe para não apagar fotos quando o lojista reenvia só os dados.
  const { data: existing } = await db
    .from("store_verifications")
    .select("selfie_path, doc_front_path, doc_back_path")
    .eq("store_id", owner.storeId)
    .maybeSingle();

  const finalSelfie = selfiePath ?? existing?.selfie_path ?? null;
  const finalDocFront = docFrontPath ?? existing?.doc_front_path ?? null;
  const finalDocBack = docBackPath ?? existing?.doc_back_path ?? null;

  if (!finalSelfie || !finalDocFront) {
    return NextResponse.json(
      { ok: false, error: "Envie a selfie e a foto da frente do documento." },
      { status: 400 }
    );
  }

  const now = new Date().toISOString();
  const { error } = await db.from("store_verifications").upsert(
    {
      store_id: owner.storeId,
      full_name: form.fullName,
      cpf: form.cpf,
      birth_date: form.birthDate,
      cep: form.cep || null,
      street: form.street || null,
      number: form.number || null,
      complement: form.complement || null,
      neighborhood: form.neighborhood || null,
      city: form.city || null,
      uf: form.uf || null,
      selfie_path: finalSelfie,
      doc_front_path: finalDocFront,
      doc_back_path: finalDocBack,
      status: "pending",
      review_notes: null,
      reviewed_at: null,
      reviewed_by: null,
      submitted_at: now,
      updated_at: now,
    },
    { onConflict: "store_id" }
  );

  if (error) {
    const missing = /relation .* does not exist|store_verifications/i.test(error.message);
    return NextResponse.json(
      {
        ok: false,
        error: missing
          ? "A verificação ainda não foi ativada no servidor. Rode a migration supabase-migration-store-verification.sql."
          : "Não foi possível salvar. Tente novamente.",
      },
      { status: missing ? 503 : 500 }
    );
  }

  return NextResponse.json({ ok: true, status: "pending" });
}
