export type CardType = "visa" | "mastercard" | "amex" | "discover";

export function normalizeCardNumber(input: string): string {
  // We intentionally only strip user-friendly separators (spaces/dashes) before validation.
  // Any other non-digit characters should cause validation to fail rather than being silently ignored.
  return input.replace(/[ -]/g, "");
}

function luhn(cardNumber: string): boolean {
  const digits = cardNumber.replace(/\D/g, "");
  let sum = 0;
  let shouldDouble = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = parseInt(digits[i], 10);
    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    shouldDouble = !shouldDouble;
  }
  return sum % 10 === 0;
}

function isAllDigits(value: string): boolean {
  return /^\d+$/.test(value);
}

export function detectCardType(normalizedDigits: string): CardType | null {
  if (!isAllDigits(normalizedDigits)) return null;

  const len = normalizedDigits.length;

  // Visa: starts with 4, 13 or 16 digits
  if (normalizedDigits.startsWith("4") && (len === 13 || len === 16)) return "visa";

  // Amex: starts with 34 or 37, 15 digits
  if (len === 15 && (normalizedDigits.startsWith("34") || normalizedDigits.startsWith("37"))) return "amex";

  // Mastercard: starts with 51-55 or 2221-2720, 16 digits
  if (len === 16) {
    const firstTwo = Number(normalizedDigits.slice(0, 2));
    if (firstTwo >= 51 && firstTwo <= 55) return "mastercard";

    const firstFour = Number(normalizedDigits.slice(0, 4));
    if (firstFour >= 2221 && firstFour <= 2720) return "mastercard";
  }

  // Discover: starts with 6011, 622126-622925, 644-649, or 65, 16 digits
  if (len === 16) {
    if (normalizedDigits.startsWith("6011")) return "discover";
    if (normalizedDigits.startsWith("65")) return "discover";

    const firstThree = Number(normalizedDigits.slice(0, 3));
    if (firstThree >= 644 && firstThree <= 649) return "discover";

    const firstSix = Number(normalizedDigits.slice(0, 6));
    if (firstSix >= 622126 && firstSix <= 622925) return "discover";
  }

  return null;
}

export function validateCard(cardNumber: string): { ok: true; type: CardType; normalized: string } | { ok: false } {
  const normalized = normalizeCardNumber(cardNumber).trim();
  if (normalized.length === 0) return { ok: false };
  if (!isAllDigits(normalized)) return { ok: false };

  const type = detectCardType(normalized);
  if (!type) return { ok: false };

  if (!luhn(normalized)) return { ok: false };

  return { ok: true, type, normalized };
}

