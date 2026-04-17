/**
 * PERF-406: After one-time DB migration (`perf406_dollars_to_cents`), `accounts.balance` and
 * `transactions.amount` are integer **cents** (SQLite REAL columns hold whole numbers).
 *
 * - Use `toCents()` only for **dollar amounts from users or business rules expressed in dollars**
 *   (e.g. funding form input, "$100 opening credit"), never for values read from the DB.
 * - Use `centsFromDb()` when reading stored balances/amounts (integer cents, rounded for REAL quirks).
 * - Use `formatCurrency(cents)` in the UI; API responses expose cents.
 */
/** Opening credit in dollars — convert with `toCents` only at insert time, not when reading DB rows. */
export const OPENING_BALANCE_DOLLARS = 100;

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
