/**
 * Kuwait phone-number normalization helpers.
 *
 * Canonical format: E.164 with Kuwait country code, i.e.
 *   "+965" + 8-digit local mobile number  ->  "+96566001030"
 *
 * Used by signup, profile edit, admin user create/edit, and any
 * future WhatsApp integration that needs to match an inbound sender's
 * number against profiles.phone.
 *
 * Examples:
 *   normalizeKuwaitPhone("66001030")          -> "+96566001030"
 *   normalizeKuwaitPhone("+965 6600 1030")    -> "+96566001030"
 *   normalizeKuwaitPhone("00965-66001030")    -> "+96566001030"
 *   normalizeKuwaitPhone("96566001030")       -> "+96566001030"
 *   normalizeKuwaitPhone("(965) 6600-1030")   -> "+96566001030"
 *   normalizeKuwaitPhone("+9651829000")       -> null   // 7-digit, not a KW mobile
 *   normalizeKuwaitPhone("123")               -> null
 *   normalizeKuwaitPhone("")                  -> null
 *
 * Returns null when the input cannot be confidently normalized; the
 * caller decides whether to reject with a validation error or store
 * the raw value.
 *
 * v1 is KW-only and dependency-free. If we ever need multi-country
 * support, swap the body for libphonenumber-js without changing the
 * signature.
 */
export function normalizeKuwaitPhone(input: string | null | undefined): string | null {
  if (!input) return null;

  // Trim and strip everything except digits and a leading '+'.
  const trimmed = String(input).trim();
  if (!trimmed) return null;

  const hasPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/[^\d]/g, '');
  if (!digits) return null;

  // Case 1: starts with country code 965 + 8 digits  (11 total)
  if (digits.length === 11 && digits.startsWith('965')) {
    return '+' + digits;
  }

  // Case 2: starts with international-prefix 00965 + 8 digits (13 total)
  if (digits.length === 13 && digits.startsWith('00965')) {
    return '+965' + digits.slice(5);
  }

  // Case 3: bare 8-digit local mobile
  // Only accept if user did NOT type a leading '+' (a '+' implies a
  // country code, so a bare 8-digit with '+' is malformed).
  if (!hasPlus && digits.length === 8) {
    return '+965' + digits;
  }

  // Anything else (landlines, foreign numbers, malformed) — caller decides.
  return null;
}

/**
 * Convenience boolean wrapper. True iff the value normalizes to a
 * canonical KW mobile.
 */
export function isValidKuwaitPhone(input: string | null | undefined): boolean {
  return normalizeKuwaitPhone(input) !== null;
}

/**
 * Pretty-print an E.164 KW number for UI display:
 *   "+96566001030" -> "+965 6600 1030"
 * Falls back to the raw value if it isn't a canonical KW E.164.
 */
export function displayPhone(e164: string | null | undefined): string {
  if (!e164) return '';
  const m = /^\+965(\d{4})(\d{4})$/.exec(e164);
  if (!m) return e164;
  return `+965 ${m[1]} ${m[2]}`;
}
