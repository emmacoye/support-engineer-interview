import crypto from "crypto";

/**
 * SEC-302: Account numbers must be unguessable. `Math.random()` is a non-cryptographic
 * PRNG and is predictable; we use `crypto.randomBytes()` (CSPRNG) instead.
 */
export function generateAccountNumber(): string {
  // Generate 8 cryptographically secure random bytes (64 bits of entropy).
  const bytes = crypto.randomBytes(8);
  const num = BigInt("0x" + bytes.toString("hex"));
  // Map into [1_000_000_000, 9_999_999_999] — exactly 10 numeric digits (bank-style).
  const accountNumber = (num % BigInt(9_000_000_000) + BigInt(1_000_000_000)).toString();
  return accountNumber;
}
