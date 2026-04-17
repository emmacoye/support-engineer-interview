import "dotenv/config";
import Database from "better-sqlite3";
import path from "path";
import { decryptSSN, encryptSSN } from "../lib/crypto";

/**
 * One-time migration helper for SEC-301.
 * Re-encrypts any plaintext SSNs currently stored in `users.ssn`.
 *
 * - If a value decrypts successfully, it is assumed already encrypted and is left unchanged.
 * - If a value does not look encrypted, it is treated as plaintext and encrypted in-place.
 * - If a value looks encrypted but cannot be decrypted, the script fails fast (wrong key / corrupted data).
 */
function main() {
  const dbPath = path.join(process.cwd(), "bank.db");
  const sqlite = new Database(dbPath);

  try {
    const rows = sqlite.prepare("SELECT id, ssn FROM users").all() as Array<{ id: number; ssn: string }>;
    if (rows.length === 0) {
      console.log("No users found; nothing to migrate.");
      return;
    }

    let updated = 0;
    let skipped = 0;

    const updateStmt = sqlite.prepare("UPDATE users SET ssn = ? WHERE id = ?");

    const tx = sqlite.transaction(() => {
      for (const row of rows) {
        const value = String(row.ssn ?? "");
        const looksEncrypted = value.includes(":");

        if (looksEncrypted) {
          try {
            decryptSSN(value);
            skipped++;
            continue;
          } catch (err) {
            throw new Error(
              `User ${row.id} has an SSN that looks encrypted but cannot be decrypted. ` +
                `Check SSN_ENCRYPTION_KEY (rotation?) and DB integrity. Original error: ${(err as Error).message}`
            );
          }
        }

        // Plaintext path: encrypt and overwrite.
        updateStmt.run(encryptSSN(value), row.id);
        updated++;
      }
    });

    tx();

    console.log(`SEC-301 migration complete. Updated: ${updated}. Already-encrypted: ${skipped}.`);
  } finally {
    // PERF-408: guarantee close on error paths (e.g. transaction throws).
    sqlite.close();
  }
}

main();

