export function normalizeWhatsAppPhone(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 10) return null;
  if (digits.length === 11 && !digits.startsWith("55")) {
    return `55${digits}`;
  }
  if (digits.length === 10) {
    return `55${digits}`;
  }
  return digits;
}

export function whatsAppLink(phone: string | null, message: string): string | null {
  const wa = normalizeWhatsAppPhone(phone);
  if (!wa) return null;
  return `https://wa.me/${wa}?text=${encodeURIComponent(message)}`;
}
