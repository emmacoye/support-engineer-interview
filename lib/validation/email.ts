import { z } from "zod";

const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

const COMMON_TLD_TYPOS: Record<string, string> = {
  ".con": ".com",
  ".cmo": ".com",
  ".ocm": ".com",
  ".vom": ".com",
  ".nset": ".net",
  ".nett": ".net",
  ".ogr": ".org",
  ".rog": ".org",
};

export type EmailValidationResult = {
  isValid: boolean;
  normalized: string;
  wasNormalized: boolean;
  typoWarning: string | null;
};

/**
 * VAL-201: Single source for email format, lowercase normalization metadata, and
 * non-blocking TLD typo hints — reused by React Hook Form and Zod on the server.
 */
export function validateEmail(email: string): EmailValidationResult {
  const normalized = email.toLowerCase().trim();
  const wasNormalized = email !== normalized;

  if (!EMAIL_REGEX.test(normalized)) {
    return { isValid: false, normalized, wasNormalized, typoWarning: null };
  }

  const typoEntry = Object.entries(COMMON_TLD_TYPOS).find(([typo]) => normalized.endsWith(typo));
  const typoWarning = typoEntry
    ? `Did you mean ${normalized.replace(typoEntry[0], typoEntry[1])}?`
    : null;

  return { isValid: true, normalized, wasNormalized, typoWarning };
}

/** Zod pipeline: reject invalid format, then normalize to lowercase for DB / lookup (always, even if client skipped it). */
export function zodEmail() {
  return z
    .string()
    .superRefine((val, ctx) => {
      const r = validateEmail(val);
      if (!r.isValid) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Please enter a valid email address",
        });
      }
    })
    .transform((val) => validateEmail(val).normalized);
}
