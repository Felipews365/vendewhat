"use client";

/**
 * Verificação de identidade do dono da loja (KYC anti-golpe).
 *
 * O lojista informa os dados pessoais + envia selfie e foto do documento
 * (frente/verso). O dono do SaaS revisa no painel admin. É só informativo — nada
 * é bloqueado. Os arquivos vão para o bucket PRIVADO `verification-docs`; o status
 * e os dados são gravados por `/api/store/verification` (service role), então o
 * lojista não consegue se auto-aprovar.
 */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";
import {
  EMPTY_VERIFICATION_FORM,
  VERIFICATION_BUCKET,
  VERIFICATION_STATUS_LABEL,
  formatCep,
  formatCpf,
  onlyDigits,
  validateVerificationForm,
  type VerificationFormData,
  type VerificationStatus,
} from "@/lib/storeVerification";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

type DocKind = "selfie" | "docFront" | "docBack";

type PickedFile = { file: File; preview: string };

const UF_LIST = [
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB",
  "PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO",
];

export default function VerificacaoPage() {
  const router = useRouter();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [storeId, setStoreId] = useState<string | null>(null);
  const [status, setStatus] = useState<VerificationStatus>("none");
  const [reviewNotes, setReviewNotes] = useState<string | null>(null);
  const [hasFiles, setHasFiles] = useState({ selfie: false, docFront: false, docBack: false });
  const [form, setForm] = useState<VerificationFormData>(EMPTY_VERIFICATION_FORM);
  const [picked, setPicked] = useState<Record<DocKind, PickedFile | null>>({
    selfie: null,
    docFront: null,
    docBack: null,
  });

  const fileRefs = {
    selfie: useRef<HTMLInputElement>(null),
    docFront: useRef<HTMLInputElement>(null),
    docBack: useRef<HTMLInputElement>(null),
  };

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }
      const { data: store } = await supabase
        .from("stores")
        .select("id")
        .eq("user_id", user.id)
        .single();
      if (!store) {
        router.push("/dashboard");
        return;
      }
      setStoreId(store.id);
      try {
        const res = await fetch("/api/store/verification", { cache: "no-store" });
        const data = await res.json();
        if (data?.ok) {
          setStatus((data.status as VerificationStatus) ?? "none");
          setReviewNotes(data.reviewNotes ?? null);
          if (data.form) setForm(data.form as VerificationFormData);
          if (data.hasFiles) setHasFiles(data.hasFiles);
        }
      } catch {
        /* mantém o formulário vazio se a leitura falhar */
      }
      setLoading(false);
    }
    load();
  }, [router]);

  const set = (patch: Partial<VerificationFormData>) => setForm((f) => ({ ...f, ...patch }));

  function pick(kind: DocKind, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      showToast("Envie uma foto (JPG ou PNG).", "error");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      showToast("Foto muito grande (máximo 8 MB).", "error");
      return;
    }
    setPicked((p) => {
      if (p[kind]?.preview) URL.revokeObjectURL(p[kind]!.preview);
      return { ...p, [kind]: { file, preview: URL.createObjectURL(file) } };
    });
  }

  async function uploadOne(kind: DocKind): Promise<string | null> {
    const chosen = picked[kind];
    if (!chosen || !storeId) return null;
    const supabase = createClient();
    const ext = chosen.file.name.split(".").pop()?.toLowerCase() || "jpg";
    const path = `${storeId}/verification/${kind}-${Date.now()}-${Math.round(
      Math.random() * 1e6
    )}.${ext}`;
    const { error } = await supabase.storage
      .from(VERIFICATION_BUCKET)
      .upload(path, chosen.file, { upsert: true });
    if (error) {
      throw new Error(error.message);
    }
    return path;
  }

  async function submit() {
    if (!storeId || saving) return;

    const errors = validateVerificationForm(form);
    if (errors.length > 0) {
      showToast(errors[0], "error");
      return;
    }
    // Selfie e frente do documento são obrigatórias (a não ser que já estejam salvas).
    if (!picked.selfie && !hasFiles.selfie) {
      showToast("Envie uma selfie (foto do seu rosto).", "error");
      return;
    }
    if (!picked.docFront && !hasFiles.docFront) {
      showToast("Envie a foto da frente do documento.", "error");
      return;
    }

    setSaving(true);
    try {
      const [selfiePath, docFrontPath, docBackPath] = await Promise.all([
        uploadOne("selfie"),
        uploadOne("docFront"),
        uploadOne("docBack"),
      ]);

      const res = await fetch("/api/store/verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          cpf: onlyDigits(form.cpf),
          cep: onlyDigits(form.cep),
          selfiePath,
          docFrontPath,
          docBackPath,
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        showToast(data.error || "Não foi possível enviar.", "error");
        return;
      }
      setStatus("pending");
      setReviewNotes(null);
      setHasFiles({
        selfie: hasFiles.selfie || Boolean(selfiePath),
        docFront: hasFiles.docFront || Boolean(docFrontPath),
        docBack: hasFiles.docBack || Boolean(docBackPath),
      });
      setPicked({ selfie: null, docFront: null, docBack: null });
      showToast("Cadastro enviado! Vamos analisar em breve.");
    } catch (err) {
      showToast(
        err instanceof Error ? `Erro ao enviar: ${err.message}` : "Erro ao enviar.",
        "error"
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center text-slate-500 dark:text-slate-400">
        Carregando…
      </div>
    );
  }

  const badge = VERIFICATION_STATUS_LABEL[status];
  const isPending = status === "pending";

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">
            Verificação da conta
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Confirme sua identidade para deixar sua loja mais confiável e segura.
          </p>
        </div>
        <span
          className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${badge.cls}`}
        >
          {badge.label}
        </span>
      </div>

      {status === "approved" && (
        <div className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">
          ✅ Sua conta está verificada. Se precisar atualizar seus dados, é só editar abaixo e enviar
          de novo.
        </div>
      )}
      {isPending && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
          ⏳ Recebemos seu cadastro e estamos analisando. Você pode reenviar se precisar corrigir algo.
        </div>
      )}
      {status === "rejected" && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
          <p className="font-semibold">Precisamos que você reenvie o cadastro.</p>
          {reviewNotes && <p className="mt-1">Motivo: {reviewNotes}</p>}
        </div>
      )}

      <div className="space-y-6">
        {/* Dados pessoais */}
        <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">Seus dados</h2>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Nome completo" className="sm:col-span-2">
              <input
                value={form.fullName}
                onChange={(e) => set({ fullName: e.target.value })}
                placeholder="Como está no documento"
                className={inputCls}
              />
            </Field>
            <Field label="CPF">
              <input
                value={formatCpf(form.cpf)}
                onChange={(e) => set({ cpf: onlyDigits(e.target.value) })}
                inputMode="numeric"
                placeholder="000.000.000-00"
                className={inputCls}
              />
            </Field>
            <Field label="Data de nascimento">
              <input
                type="date"
                value={form.birthDate}
                onChange={(e) => set({ birthDate: e.target.value })}
                className={inputCls}
              />
            </Field>
          </div>
        </section>

        {/* Endereço */}
        <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
            Endereço <span className="font-normal text-slate-400">(opcional)</span>
          </h2>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-6">
            <Field label="CEP" className="sm:col-span-2">
              <input
                value={formatCep(form.cep)}
                onChange={(e) => set({ cep: onlyDigits(e.target.value) })}
                inputMode="numeric"
                placeholder="00000-000"
                className={inputCls}
              />
            </Field>
            <Field label="Rua" className="sm:col-span-3">
              <input value={form.street} onChange={(e) => set({ street: e.target.value })} className={inputCls} />
            </Field>
            <Field label="Número" className="sm:col-span-1">
              <input value={form.number} onChange={(e) => set({ number: e.target.value })} className={inputCls} />
            </Field>
            <Field label="Bairro" className="sm:col-span-3">
              <input value={form.neighborhood} onChange={(e) => set({ neighborhood: e.target.value })} className={inputCls} />
            </Field>
            <Field label="Complemento" className="sm:col-span-3">
              <input value={form.complement} onChange={(e) => set({ complement: e.target.value })} className={inputCls} />
            </Field>
            <Field label="Cidade" className="sm:col-span-4">
              <input value={form.city} onChange={(e) => set({ city: e.target.value })} className={inputCls} />
            </Field>
            <Field label="UF" className="sm:col-span-2">
              <select value={form.uf} onChange={(e) => set({ uf: e.target.value })} className={inputCls}>
                <option value="">—</option>
                {UF_LIST.map((uf) => (
                  <option key={uf} value={uf}>
                    {uf}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </section>

        {/* Documentos */}
        <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">Documentos</h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Tire fotos nítidas, em local iluminado, com os dados legíveis. Suas fotos são privadas —
            só o VendeWhat vê.
          </p>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Uploader
              title="Selfie (seu rosto)"
              kind="selfie"
              picked={picked.selfie}
              hasSaved={hasFiles.selfie}
              inputRef={fileRefs.selfie}
              onPick={pick}
              required
            />
            <Uploader
              title="Documento — frente"
              kind="docFront"
              picked={picked.docFront}
              hasSaved={hasFiles.docFront}
              inputRef={fileRefs.docFront}
              onPick={pick}
              required
            />
            <Uploader
              title="Documento — verso"
              kind="docBack"
              picked={picked.docBack}
              hasSaved={hasFiles.docBack}
              inputRef={fileRefs.docBack}
              onPick={pick}
            />
          </div>
          <p className="mt-3 text-xs text-slate-400">RG ou CNH. O verso não é obrigatório na CNH.</p>
        </section>

        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={submit}
            disabled={saving}
            className="rounded-xl bg-landing-primary px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-landing-accent disabled:opacity-50"
          >
            {saving ? "Enviando…" : status === "none" ? "Enviar cadastro" : "Atualizar cadastro"}
          </button>
        </div>
      </div>
    </main>
  );
}

const inputCls =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-landing-primary/40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100";

function Field({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`block ${className ?? ""}`}>
      <span className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">{label}</span>
      {children}
    </label>
  );
}

function Uploader({
  title,
  kind,
  picked,
  hasSaved,
  inputRef,
  onPick,
  required,
}: {
  title: string;
  kind: DocKind;
  picked: PickedFile | null;
  hasSaved: boolean;
  inputRef: React.RefObject<HTMLInputElement>;
  onPick: (kind: DocKind, e: React.ChangeEvent<HTMLInputElement>) => void;
  required?: boolean;
}) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-slate-600 dark:text-slate-300">
        {title} {required && <span className="text-red-500">*</span>}
      </p>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 text-center transition hover:border-landing-primary hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-800/70"
      >
        {picked ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={picked.preview} alt={title} className="h-full w-full object-cover" />
        ) : hasSaved ? (
          <span className="px-3 text-xs font-medium text-emerald-600 dark:text-emerald-400">
            ✓ Enviado
            <br />
            <span className="text-slate-400">Toque para trocar</span>
          </span>
        ) : (
          <span className="px-3 text-xs font-medium text-slate-500 dark:text-slate-400">
            📷 Tirar / enviar foto
          </span>
        )}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(e) => onPick(kind, e)}
        className="hidden"
      />
    </div>
  );
}
