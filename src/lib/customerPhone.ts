/** Dígitos do telefone (apenas números). */
export function phoneDigitsOnly(input: string): string {
  return input.replace(/\D/g, "");
}

/**
 * Telefone brasileiro / WhatsApp: pelo menos DDD + número (10 dígitos fixo ou 11 com 9 celular).
 * Aceita até 15 dígitos (E.164 máximo comum).
 */
export function isCustomerPhoneValid(input: string): boolean {
  const d = phoneDigitsOnly(input);
  return d.length >= 10 && d.length <= 15;
}

/**
 * Número pronto para enviar pelo WhatsApp (Evolution): DDI + DDD + número.
 * Como o cliente costuma digitar só DDD + número (10/11 dígitos), prefixa o
 * DDI do Brasil (55). Números que já têm DDI (12+ dígitos) ficam como estão.
 */
export function toWhatsAppNumber(input: string): string {
  const d = phoneDigitsOnly(input);
  if (!d) return "";
  if (d.length === 10 || d.length === 11) return `55${d}`;
  return d;
}

/**
 * Telefone brasileiro para LEITURA: `(81) 99170-1373`. Tira o DDI 55 quando ele
 * está lá (é como o WhatsApp/Evolution guarda) e devolve o que veio, sem
 * formatar, se não for um número BR reconhecível.
 */
export function formatBrPhone(input: string | null | undefined): string {
  const raw = (input ?? "").trim();
  if (!raw) return "";
  let d = phoneDigitsOnly(raw);
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) d = d.slice(2);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return raw;
}
