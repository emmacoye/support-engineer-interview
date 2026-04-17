export type CardType =
  | "visa"
  | "mastercard"
  | "amex"
  | "discover"
  | "dinersclub"
  | "jcb"
  | "unionpay"
  | "unknown";

/** Card brands we accept for funding (excludes `unknown`). */
export type SupportedCardType = Exclude<CardType, "unknown">;

export function normalizeCardNumber(input: string): string {
  // We intentionally only strip user-friendly separators (spaces/dashes) before validation.
  // Any other non-digit characters should cause validation to fail rather than being silently ignored.
  return input.replace(/[\s-]/g, "");
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

/**
 * VAL-210: BIN ranges are multi-digit and change over time (e.g. Mastercard 2221–2720).
 * We match full IIN patterns — not a single leading digit — then fall back to `unknown`.
 */
export function detectCardType(cardNumber: string): CardType {
  const num = normalizeCardNumber(cardNumber).trim();
  if (!isAllDigits(num)) return "unknown";

  const patterns: { type: SupportedCardType; pattern: RegExp }[] = [
    { type: "amex", pattern: /^3[47][0-9]{13}$/ },
    { type: "dinersclub", pattern: /^3(?:0[0-5]|[68][0-9])[0-9]{11}$/ },
    // Discover before UnionPay — both use 62…; only 622126–622925 (among 62…) is Discover here.
    {
      type: "discover",
      pattern:
        /^6(?:011\d{12}|5[0-9]{14}|4[4-9]\d{13}|622(?:12[6-9]|1[3-9]\d|[2-8]\d{2}|9[01]\d|92[0-5])\d{10})$/,
    },
    {
      type: "jcb",
      pattern:
        /^(?:(?:2131|1800)\d{11}|35(?:2[89]|[3-8]\d|9[0-8])\d{12})$/,
    },
    {
      type: "mastercard",
      pattern:
        /^(?:5[1-5][0-9]{14}|2(?:2[2-9][1-9]|[3-6]\d{2}|7[01]\d|720)[0-9]{12})$/,
    },
    { type: "unionpay", pattern: /^62[0-9]{14,17}$/ },
    { type: "visa", pattern: /^4[0-9]{12}(?:[0-9]{3})?$/ },
  ];

  for (const { type, pattern } of patterns) {
    if (pattern.test(num)) return type;
  }
  return "unknown";
}

export type ValidateCardResult =
  | { ok: true; type: SupportedCardType; normalized: string }
  | { ok: false; message: string };

export function validateCard(cardNumber: string): ValidateCardResult {
  const normalized = normalizeCardNumber(cardNumber).trim();
  if (normalized.length === 0) {
    return { ok: false, message: "Please enter a valid card number" };
  }
  if (!isAllDigits(normalized)) {
    return { ok: false, message: "Please enter a valid card number" };
  }

  // VAL-210: known network vs unknown is independent of VAL-206 Luhn — reject unsupported brands first.
  const type = detectCardType(normalized);
  if (type === "unknown") {
    return {
      ok: false,
      message:
        "Unsupported card type. Use Visa, Mastercard, American Express, Discover, Diners Club, JCB, or UnionPay.",
    };
  }

  if (!luhn(normalized)) {
    return { ok: false, message: "Please enter a valid card number" };
  }

  return { ok: true, type, normalized };
}
