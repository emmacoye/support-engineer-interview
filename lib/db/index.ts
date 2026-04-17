import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import * as schema from "./schema";

const dbPath = "bank.db";

// PERF-408: Single process-wide SQLite handle for Drizzle. Do not open per request and do not close
// during normal request handling (Next.js/tRPC reuse this module across invocations).
const sqlite = new Database(dbPath);
export const db = drizzle(sqlite, { schema });

/**
 * PERF-406: Legacy rows stored balances/amounts in **dollars** (e.g. 120 = $120). New code stores **cents**.
 * One-time migration multiplies existing rows by 100 when the DB already had accounts (non-empty upgrade).
 * Empty DB: record migration without multiplying so new signups are not double-converted.
 * Mixed legacy + already-cent rows: delete `bank.db` or restore from backup — see BUGS.md.
 */
function runPerf406DollarsToCentsMigration(raw: Database.Database) {
  raw.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id TEXT PRIMARY KEY NOT NULL
    );
  `);

  const applied = raw.prepare("SELECT 1 AS ok FROM _migrations WHERE id = ?").get("perf406_dollars_to_cents");
  if (applied) return;

  const row = raw.prepare("SELECT COUNT(*) AS count FROM accounts").get() as { count: number };
  const accountCount = row?.count ?? 0;

  if (accountCount > 0) {
    raw.exec(`
      UPDATE accounts SET balance = ROUND(COALESCE(balance, 0) * 100);
      UPDATE transactions SET amount = ROUND(COALESCE(amount, 0) * 100);
    `);
  }

  raw.prepare("INSERT INTO _migrations (id) VALUES (?)").run("perf406_dollars_to_cents");
}

export function initDb() {
  // PERF-408: DDL and migration run on the singleton only — never open a second connection here
  // (previous code leaked an extra handle on every initDb call).
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      phone_number TEXT NOT NULL,
      date_of_birth TEXT NOT NULL,
      ssn TEXT NOT NULL,
      address TEXT NOT NULL,
      city TEXT NOT NULL,
      state TEXT NOT NULL,
      zip_code TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      account_number TEXT UNIQUE NOT NULL,
      account_type TEXT NOT NULL,
      balance REAL DEFAULT 0 NOT NULL, -- integer cents (PERF-406)
      status TEXT DEFAULT 'pending',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER NOT NULL REFERENCES accounts(id),
      type TEXT NOT NULL,
      amount REAL NOT NULL, -- integer cents (PERF-406)
      description TEXT,
      status TEXT DEFAULT 'pending' NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      processed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      token TEXT UNIQUE NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  runPerf406DollarsToCentsMigration(sqlite);
}

// Initialize database on import
initDb();
