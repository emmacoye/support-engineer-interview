export const INVALID_PHONE_MESSAGE = "Please enter a valid phone number";

/** VAL-204: digits only for validation and DB storage — strip spaces, +, dashes, parens, etc. */
export function normalizePhoneNumber(phone: string): string {
  return phone.replace(/\D/g, "");
}

/**
 * VAL-204: US (10 digits, or 11 starting with 1) or international E.164-style length (7–15 digits).
 */
export function validatePhoneNumber(phone: string): boolean {
  const digits = normalizePhoneNumber(phone);

  const isUS = digits.length === 10 || (digits.length === 11 && digits.startsWith("1"));

  const isInternational = digits.length >= 7 && digits.length <= 15;

  return isUS || isInternational;
}
