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
