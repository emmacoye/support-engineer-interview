export function getAge(dob: Date): number {
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
    age--;
  }
  return age;
}

function parseDateOnly(value: string): Date | null {
  // Expecting YYYY-MM-DD from `<input type="date" />`.
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;

  const dob = new Date(year, month - 1, day);
  // Guard against JS Date overflow (e.g. 2024-99-99).
  if (dob.getFullYear() !== year || dob.getMonth() !== month - 1 || dob.getDate() !== day) return null;
  return dob;
}

export type DobValidationError =
  | "invalid_format"
  | "future_date"
  | "too_young"
  | "too_old";

export function validateDob(value: string): { ok: true; dob: Date } | { ok: false; code: DobValidationError } {
  const dob = parseDateOnly(value);
  if (!dob) return { ok: false, code: "invalid_format" };

  const today = new Date();
  const todayDateOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (dob.getTime() > todayDateOnly.getTime()) return { ok: false, code: "future_date" };

  const age = getAge(dob);
  if (age < 18) return { ok: false, code: "too_young" };
  if (age > 120) return { ok: false, code: "too_old" };

  return { ok: true, dob };
}

export function dobErrorMessage(code: DobValidationError): string {
  switch (code) {
    case "invalid_format":
      return "Please enter a valid date of birth";
    case "future_date":
      return "Date of birth cannot be in the future";
    case "too_young":
      return "You must be at least 18 years old to register";
    case "too_old":
      return "Please enter a realistic date of birth";
  }
}

