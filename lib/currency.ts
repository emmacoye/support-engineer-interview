/**
 * PERF-406: All monetary values in the DB and API are integer **cents** (stored in REAL columns as whole numbers).
 * Never add/subtract dollar floats — convert to cents, use integer math, format for display only.
 */
export function toCents(dollars: number): number {
  return Math.round(dollars * 100);
}

export function toDollars(cents: number): number {
  return cents / 100;
}

export function formatCurrency(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(toDollars(cents));
}

/** Normalize a DB REAL that should hold whole cents (SQLite may round-trip as float). */
export function centsFromDb(value: number): number {
  return Math.round(Number(value));
}
