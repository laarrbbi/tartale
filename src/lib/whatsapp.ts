/**
 * WhatsApp deep links. `wa.me` wants digits only (no `+`, spaces or dashes)
 * and silently fails on anything else, which looks like a broken button.
 */
export function normalizeWhatsappNumber(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  let digits = trimmed.replace(/\D/g, '');
  // "0034 600…" is the same number as "+34 600…".
  if (!trimmed.startsWith('+') && digits.startsWith('00')) digits = digits.slice(2);
  // Nine digits starting 6, 7, 8 or 9 with no prefix is a Spanish number.
  else if (!trimmed.startsWith('+') && /^[6-9]\d{8}$/.test(digits)) digits = `34${digits}`;
  if (digits.length < 8 || digits.length > 15) return null;
  return digits;
}

export function whatsappLink(raw: string | null | undefined, text?: string): string | null {
  const number = normalizeWhatsappNumber(raw);
  if (!number) return null;
  const message = text?.trim();
  return message ? `https://wa.me/${number}?text=${encodeURIComponent(message)}` : `https://wa.me/${number}`;
}

/** For a `tel:` link: digits with the leading +. */
export function telHref(raw: string | null | undefined): string | null {
  const number = normalizeWhatsappNumber(raw);
  return number ? `tel:+${number}` : null;
}
