/**
 * Verificação de identidade (KYC) do dono da loja — helpers compartilhados
 * (browser + servidor). Sem imports server-only.
 *
 * Fonte da verdade: a tabela `store_verifications` (migration
 * `supabase-migration-store-verification.sql`). Os arquivos moram no bucket
 * PRIVADO `verification-docs` (paths guardados em `*_path`).
 */

export const VERIFICATION_BUCKET = "verification-docs";

/** Status do fluxo de revisão. `none` = a loja ainda não enviou nada. */
export type VerificationStatus = "none" | "pending" | "approved" | "rejected";

export const VERIFICATION_STATUS_LABEL: Record<
  VerificationStatus,
  { label: string; cls: string }
> = {
  none: {
    label: "Não enviado",
    cls: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  },
  pending: {
    label: "Em análise",
    cls: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  },
  approved: {
    label: "Verificado",
    cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  },
  rejected: {
    label: "Recusado",
    cls: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
  },
};

/** Normaliza um status vindo do banco (tolera valores estranhos). */
export function normalizeVerificationStatus(
  raw: string | null | undefined
): VerificationStatus {
  if (raw === "approved" || raw === "rejected" || raw === "pending") return raw;
  return "none";
}

/** Campos de texto do formulário (o que o lojista digita). */
export type VerificationFormData = {
  fullName: string;
  cpf: string;
  birthDate: string; // YYYY-MM-DD
  cep: string;
  street: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  uf: string;
};

export const EMPTY_VERIFICATION_FORM: VerificationFormData = {
  fullName: "",
  cpf: "",
  birthDate: "",
  cep: "",
  street: "",
  number: "",
  complement: "",
  neighborhood: "",
  city: "",
  uf: "",
};

/** Tetos de tamanho (bate com o que a UI aceita; o servidor corta também). */
export const VERIFICATION_LIMITS = {
  text: 200,
  uf: 2,
  notes: 500,
} as const;

export function onlyDigits(v: string): string {
  return (v || "").replace(/\D+/g, "");
}

/** Formata CPF `12345678909` → `123.456.789-09` (parcial enquanto digita). */
export function formatCpf(v: string): string {
  const d = onlyDigits(v).slice(0, 11);
  const parts = [d.slice(0, 3), d.slice(3, 6), d.slice(6, 9), d.slice(9, 11)];
  let out = parts[0];
  if (parts[1]) out += "." + parts[1];
  if (parts[2]) out += "." + parts[2];
  if (parts[3]) out += "-" + parts[3];
  return out;
}

/** Formata CEP `50000000` → `50000-000`. */
export function formatCep(v: string): string {
  const d = onlyDigits(v).slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

/** Validação real de CPF (dígitos verificadores). */
export function isValidCpf(value: string): boolean {
  const cpf = onlyDigits(value);
  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false; // todos iguais
  const calcDigit = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(cpf[i]) * (len + 1 - i);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  return calcDigit(9) === Number(cpf[9]) && calcDigit(10) === Number(cpf[10]);
}

/** Erros de preenchimento (vazio = pronto para enviar). Usado no front e no back. */
export function validateVerificationForm(f: VerificationFormData): string[] {
  const errors: string[] = [];
  if (f.fullName.trim().length < 5) errors.push("Informe o nome completo.");
  if (!isValidCpf(f.cpf)) errors.push("CPF inválido.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.birthDate)) errors.push("Informe a data de nascimento.");
  else {
    const d = new Date(`${f.birthDate}T00:00:00`);
    const now = new Date();
    const age = (now.getTime() - d.getTime()) / (365.25 * 24 * 3600 * 1000);
    if (!Number.isFinite(age) || age < 16 || age > 120) errors.push("Data de nascimento inválida.");
  }
  return errors;
}
