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
