/**
 * Validação de blocos para o formulário do painel.
 *
 * Filosofia (usuário não técnico): quase nada bloqueia o salvamento — a gente
 * AVISA (warning) quando o texto passou do tamanho recomendado, e só marca ERRO
 * no mínimo necessário para o bloco funcionar (ex.: WhatsApp sem número).
 */
import { BLOCK_REGISTRY } from "./registry";
import type { StoreBlock } from "./types";

export type FieldIssue = {
  field: string;
  level: "error" | "warning";
  message: string;
};

export function validateBlock(block: StoreBlock): FieldIssue[] {
  const meta = BLOCK_REGISTRY[block.type];
  const cfg = block.config as Record<string, unknown>;
  const issues: FieldIssue[] = [];

  for (const f of meta.fields) {
    const raw = cfg[f.key];
    const value = typeof raw === "string" ? raw.trim() : raw;

    // Obrigatório vazio → erro
    if (f.required && (value === undefined || value === "" || value === null)) {
      issues.push({ field: f.key, level: "error", message: `Preencha “${f.label}”.` });
      continue;
    }

    // Passou do limite recomendado → só aviso (o layout aguenta com clamp)
    if (typeof value === "string" && f.max && value.length > f.max) {
      issues.push({
        field: f.key,
        level: "warning",
        message: `“${f.label}” ficou longo (${value.length}/${f.max}) e pode cortar na tela.`,
      });
    }

    // Telefone precisa ter dígitos suficientes
    if (f.type === "phone" && typeof value === "string" && value) {
      const digits = value.replace(/\D/g, "");
      if (digits.length < 12 || digits.length > 13) {
        issues.push({
          field: f.key,
          level: "error",
          message: "Use o número com DDI e DDD (ex.: 5511999999999).",
        });
      }
    }

    // URL: aceita âncora (#...) ou http(s)
    if (f.type === "url" && typeof value === "string" && value) {
      const ok = value.startsWith("#") || /^https?:\/\//i.test(value);
      if (!ok) {
        issues.push({
          field: f.key,
          level: "warning",
          message: "Link estranho — use #catalogo ou uma URL começando com https://.",
        });
      }
    }
  }

  return issues;
}

/** True se o bloco pode ser salvo (nenhum erro; avisos são permitidos). */
export function blockCanSave(block: StoreBlock): boolean {
  return !validateBlock(block).some((i) => i.level === "error");
}
