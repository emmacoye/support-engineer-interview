/**
 * VAL-207: ABA routing numbers use a published checksum; validate so ACH routing
 * identifiers are not accepted as arbitrary 9-digit strings.
 */
export function validateRoutingNumber(routing: string): boolean {
  // Must be exactly 9 digits
  if (!/^\d{9}$/.test(routing)) return false;

  // ABA checksum algorithm
  const digits = routing.split("").map(Number);
  const checksum =
    3 * (digits[0] + digits[3] + digits[6]) +
    7 * (digits[1] + digits[4] + digits[7]) +
    1 * (digits[2] + digits[5] + digits[8]);

  return checksum % 10 === 0;
}
