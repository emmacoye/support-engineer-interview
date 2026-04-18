/** VAL-209: user-facing message when amount string fails format rules (leading zeros, decimals, etc.). */
export const INVALID_AMOUNT_MESSAGE =
  "Please enter a valid amount (no leading zeros; up to 2 decimal places).";

/**
 * VAL-209: reject multiple leading zeros and limit to max 2 decimal places; allow `0.xx` only for
 * fractional amounts; whole amounts must start with 1–9. Works alongside VAL-205 (parse & `.positive()` for zero).
 */
export function validateAmount(value: string): boolean {
  if (/^00/.test(value)) return false;

  const amountRegex = /^(0\.\d{1,2}|[1-9]\d*(\.\d{1,2})?)$/;

  return amountRegex.test(value);
}
