import { phoneDigitsOnly, toWhatsAppNumber } from "@/lib/customerPhone";

/**
 * Telefone canônico do CRM: `55` + DDD + 9 dígitos.
 *
 * O projeto tinha TRÊS formas de casar telefone, incompatíveis entre si:
 * `toWhatsAppNumber()` (prefixa o DDI), o `samePhone()` do painel de conversas
 * (compara os 8 últimos dígitos) e a chave crua das tabelas (só os dígitos que
 * vieram). O mesmo cliente virava três registros diferentes.
 *
 * Esta é a chave única do CRM. Constrói em cima do `toWhatsAppNumber` (não o
 * substitui) e acrescenta a correção do 9: celular antigo gravado sem ele.
 *
 * ⚠️ GÊMEA EXATA de `crm_phone_key(text)` em
 * supabase-migration-crm-customers.sql. Se as duas divergirem, o backfill e o
 * sync criam linhas separadas para o mesmo cliente (duplicata que o índice
 * único NÃO pega). Mexeu numa, mexa na outra.
 */
export function crmPhoneKey(raw: string | null | undefined): string {
  const withDdi = toWhatsAppNumber(String(raw ?? ""));
  if (!withDdi) return "";
  // 12 dígitos com DDI = número local de 8 dígitos. O 5º caractere é o primeiro
  // do número local: 6-9 é celular (perdeu o 9 e precisa recuperá-lo), 2-5 é
  // fixo (8 dígitos é o certo, fica como está).
  if (withDdi.length === 12 && withDdi.startsWith("55")) {
    const first = withDdi.charAt(4);
    if (first >= "6" && first <= "9") {
      return `${withDdi.slice(0, 4)}9${withDdi.slice(4)}`;
    }
  }
  return withDdi;
}

/**
 * Os 8 últimos dígitos da chave canônica — o casamento tolerante que o
 * `samePhone()` do painel de conversas fazia na mão. Deriva da chave (e não do
 * número cru) para que `(81) 9 9170-1373` e `(81) 9170-1373` deem o mesmo
 * resultado.
 */
export function crmPhoneTail(raw: string | null | undefined): string {
  return crmPhoneKey(raw).slice(-8);
}

/**
 * Variantes com que este telefone pode estar gravado nas tabelas legadas
 * (`whatsapp_contacts`, `whatsapp_conversation_tags`, `whatsapp_pauses`), que
 * guardam "os dígitos que vieram". Serve para LER essas tabelas sem migrar as
 * chaves antigas — migrar quebraria o webhook e o `findCustomerName`.
 *
 * Da mais completa para a mais curta, sem repetir.
 */
export function crmPhoneVariants(raw: string | null | undefined): string[] {
  const key = crmPhoneKey(raw);
  if (!key) return [];

  const out: string[] = [key];
  const add = (v: string) => {
    if (v && !out.includes(v)) out.push(v);
  };

  if (key.startsWith("55")) {
    const local = key.slice(2);
    add(local); // sem DDI
    // Celular de 9 dígitos: a variante antiga não tem o 9 depois do DDD.
    if (local.length === 11 && local.charAt(2) === "9") {
      const semNove = local.slice(0, 2) + local.slice(3);
      add(`55${semNove}`);
      add(semNove);
    }
  }
  return out;
}

/** Dois telefones são o mesmo cliente? Compara pela chave canônica. */
export function samePhoneKey(
  a: string | null | undefined,
  b: string | null | undefined
): boolean {
  const ka = crmPhoneKey(a);
  const kb = crmPhoneKey(b);
  if (!ka || !kb) return false;
  if (ka === kb) return true;
  // Rede de segurança para números fora do padrão BR (a chave não normaliza
  // DDI estrangeiro): cai no critério antigo dos 8 últimos dígitos.
  return ka.slice(-8) === kb.slice(-8);
}

/** Telefone utilizável (tem dígitos suficientes para virar cliente). */
export function isCrmPhoneUsable(raw: string | null | undefined): boolean {
  return phoneDigitsOnly(String(raw ?? "")).length >= 10;
}
