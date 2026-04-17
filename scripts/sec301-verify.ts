import "dotenv/config";
import Database from "better-sqlite3";
import path from "path";
import { appRouter } from "../server/routers";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main() {
  assert(process.env.SSN_ENCRYPTION_KEY, "SSN_ENCRYPTION_KEY must be set in environment (.env)");

  const caller = appRouter.createCaller({
    user: null,
    req: { headers: { cookie: "" } },
    res: new Headers(),
  } as any);

  const email = `sec301.verify+${Date.now()}@example.com`;
  const password = "Password123!";
  const ssn = "123456789"; // server-side validation requires 9 digits (no dashes)

  const signup = await caller.auth.signup({
    email,
    password,
    firstName: "Sec",
    lastName: "Verify",
    phoneNumber: "+15555550123",
    dateOfBirth: "1990-01-01",
    ssn,
    address: "1 Main St",
    city: "Testville",
    state: "CA",
    zipCode: "94105",
  });

  assert(signup?.user?.email === email, "Signup did not return expected user");
  assert(signup.user.ssn === ssn, "Decryption on signup response failed (SSN mismatch)");

  // Verify ciphertext at rest directly in SQLite.
  const dbPath = path.join(process.cwd(), "bank.db");
  const sqlite = new Database(dbPath);
  const row = sqlite.prepare("SELECT ssn FROM users WHERE email = ?").get(email) as { ssn: string } | undefined;
  sqlite.close();

  assert(row?.ssn, "User row missing from DB after signup");
  assert(row.ssn !== ssn, "SSN is still plaintext in DB");
  assert(row.ssn.includes(":"), "Encrypted SSN does not look like iv:ciphertext format");

  // Avoid a rare token collision when signup+login happen in the same second in dev.
  await new Promise((r) => setTimeout(r, 1100));

  const login = await caller.auth.login({ email, password });
  assert(login?.user?.email === email, "Login did not return expected user");
  assert(login.user.ssn === ssn, "Decryption on login response failed (SSN mismatch)");

  console.log("SEC-301 verification PASS");
  console.log(`- Stored SSN (DB): ${row.ssn}`);
  console.log(`- Returned SSN (API): ${login.user.ssn}`);
}

main().catch((err) => {
  console.error("SEC-301 verification FAIL");
  console.error((err as Error).stack || String(err));
  process.exitCode = 1;
});

