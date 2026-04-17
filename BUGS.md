## SEC-301: SSN Plaintext Storage
**Priority**: Critical
**Root Cause**: SSNs were written directly to the SQLite database as plaintext strings with no encryption, making them fully exposed in any database breach or unauthorized read.
**Fix**: Implemented AES-256-GCM encryption using Node.js's built-in `crypto` module. SSNs are encrypted before write and decrypted after read using a key stored in the `SSN_ENCRYPTION_KEY` environment variable. The IV is stored alongside the ciphertext in the DB column as `iv:ciphertext`.
**Prevention**: Treat all PII fields (SSN, DOB, account numbers) as requiring encryption at rest by default. Add a pre-commit lint rule or schema annotation to flag unencrypted sensitive columns. Rotate the encryption key periodically and document a re-encryption migration process.

## SEC-303: XSS Vulnerability in Transaction Descriptions
**Priority**: Critical
**Root Cause**: Transaction descriptions were rendered using `dangerouslySetInnerHTML` (or equivalent), allowing any HTML or script tags stored in the description field to execute in the user's browser.
**Fix**: Replaced unsafe HTML rendering with plain text JSX rendering. Description fields are now treated as strings, never as markup, so any injected HTML is displayed as literal text rather than executed.
**Prevention**: Avoid `dangerouslySetInnerHTML` by default — treat it as a code smell requiring explicit review. Add a linting rule (e.g. eslint-plugin-react with no-danger) to flag any future usage. If rich text is ever required, use a well-maintained sanitization library like DOMPurify and sanitize before render, not before storage.

## VAL-202: Date of Birth Validation
**Priority**: Critical
**Root Cause**: The date of birth field had no age validation — it accepted any valid date string including future dates and dates that would make the user a minor. The server-side Zod schema only checked that the field was a valid date, not that it met age requirements.
**Fix**: Added an 18-year minimum age check and a 120-year maximum age check on both the client (React Hook Form) and server (Zod refine). Future dates are also explicitly rejected. A clear error message is shown to the user when validation fails.
**Prevention**: Any field with compliance implications (age, SSN format, address) should have explicit boundary validation on both client and server from the start. Never rely on the DB or UI alone to enforce compliance rules — Zod schemas should be the single source of truth for input contracts.

## VAL-206: Card Number Validation
**Priority**: Critical
**Root Cause**: The card number field only checked that the input was a non-empty string of digits, with no checksum or format validation. Any sequence of numbers was accepted, leading to failed transactions when invalid card numbers reached the payment processor.
**Fix**: Implemented the Luhn algorithm for checksum validation and added card type detection based on number prefixes (Visa, Mastercard, Amex, Discover). Spaces and dashes are stripped before validation. Validation is enforced on both the client (React Hook Form) and server (Zod refine).
**Prevention**: Payment field validation should always include Luhn as a minimum bar. Consider abstracting all payment validation into a shared utility and covering it with unit tests since it is both security-sensitive and easy to regression-break.

## Pass Criteria
- [ ] `4111111111111111` (valid Visa test number) is accepted
- [ ] `4111111111111112` (invalid checksum) is rejected
- [ ] `1234567890123456` (invalid prefix and checksum) is rejected
- [ ] `378282246310005` (valid Amex test number) is accepted
- [ ] `5500005555555559` (valid Mastercard test number) is accepted
- [ ] Card numbers with spaces (e.g. `4111 1111 1111 1111`) are accepted after stripping
- [ ] Empty or too-short inputs are rejected with a clear error message
- [ ] Validation fires on both the form and the tRPC handler

## VAL-208: Weak Password Requirements
**Priority**: Critical
**Root Cause**: Password validation only enforced a minimum length check. No complexity requirements existed, allowing users to set passwords like "12345678" that are trivially brute-forced.
**Fix**: Added complexity rules requiring at least one uppercase letter, one lowercase letter, one number, and one special character, with a minimum length of 8 and maximum of 128 characters. Specific error messages are shown per failing rule. Validation is enforced on both the client (React Hook Form) and server (Zod refine).
**Prevention**: Password complexity should be defined in a single shared utility and reused across all auth touch points. The 128 character maximum is important to prevent DoS via bcrypt — document this explicitly so future engineers do not remove it thinking it is arbitrary.

## Pass Criteria
- [ ] "password" is rejected (no uppercase, number, or special character)
- [ ] "Password1" is rejected (no special character)
- [ ] "Password1!" is accepted
- [ ] "12345678" is rejected (no uppercase, lowercase, or special character)
- [ ] Passwords over 128 characters are rejected
- [ ] Each failing rule shows its own specific error message
- [ ] Valid passwords are accepted and registration completes successfully
- [ ] Login form is unaffected — no complexity check on login
- [ ] Validation fires on both the form and the tRPC handler

## PERF-401: Account Creation Error Shows Incorrect Balance
**Priority**: Critical
**Root Cause**: When the database operation for account creation failed, the error was either silently swallowed and a default $100 balance returned, or the UI was optimistically updated before DB confirmation. This caused the UI to display a $100 balance for an account that was never actually created.
**Fix**: Wrapped the DB insert in a proper try/catch and throw a tRPC error on failure. Removed any optimistic balance updates — the $100 balance is only displayed after a confirmed successful DB write. The client now correctly handles the error state and shows a user-friendly failure message.
**Prevention**: Never return default values from a catch block in a financial context — always throw. Optimistic UI updates are acceptable for non-critical state but should never be used for financial balances. DB operations that create or modify financial records should always be wrapped in transactions so partial writes are rolled back automatically.

## Pass Criteria
- [ ] Happy path: account creation succeeds, $100 balance is shown
- [ ] Failure path: simulate a DB failure (e.g. disconnect DB or force an error) and confirm no balance is shown
- [ ] Error message is displayed to the user when account creation fails
- [ ] No $100 balance appears in the UI without a confirmed DB write
- [ ] tRPC handler throws a proper error on DB failure, not a default value

## PERF-405: Missing Transactions in History
**Priority**: Critical
**Root Cause**: The transaction history query had either a hardcoded LIMIT silently truncating results, an incorrect WHERE clause filtering by the wrong ID, or no ORDER BY causing non-deterministic results that appeared to drop records. The UI also showed stale history after funding because React Query kept cached `getTransactions` data for up to 60s without invalidation. The client render does not slice the list.
**Fix**: Server: removed silent LIMIT, filter by `accountId`, `ORDER BY created_at DESC`, and fixed `fundAccount` to fetch the newest transaction per account after insert. Client: after a successful fund, invalidate `account.getTransactions` and `account.getAccounts` so the table refetches immediately.
**Prevention**: Never use a silent LIMIT on financial record queries — if pagination is needed it must be explicit and visible to the user. All transaction queries should have a deterministic ORDER BY. After mutations that add rows, invalidate or refetch the affected queries. Add an integration test that creates more than 10 transactions and asserts all are returned.

## Pass Criteria
- [ ] Create an account and fund it 15+ times
- [ ] Transaction history shows all 15+ transactions
- [ ] Transactions are ordered newest first
- [ ] Transactions are scoped correctly to the account, not mixed with other accounts
- [ ] No client-side array slicing is truncating the displayed list

## PERF-406: Incorrect Balance Calculation
**Priority**: Critical
**Root Cause**: Account balances were calculated using JavaScript floating point arithmetic on dollar values. Floating point cannot represent decimal values exactly, so errors compound over many transactions (e.g. 0.1 + 0.2 = 0.30000000000000004). After enough transactions the displayed balance drifts from the correct value.
**Fix**: Converted all balance arithmetic to integer cent-based math. Dollar values are converted to cents before any arithmetic and converted back to dollars only for display using a shared currency utility (`lib/currency.ts`). This eliminates floating point drift entirely since integer arithmetic is exact.
**Schema / migration**: `accounts.balance` and `transactions.amount` remain SQLite `REAL` columns but hold **whole-number cents**. `toCents()` is used only for **user-entered dollar amounts** and **dollar-denominated business rules** (e.g. opening balance constant), never for values read from the DB (`centsFromDb()` only). A one-time migration (`perf406_dollars_to_cents` in `_migrations`) multiplies existing balances and transaction amounts by 100 when upgrading a **non-empty** legacy DB (dollar storage). **Empty DB**: migration is recorded without multiplying so new accounts are not double-converted. **Re-test**: `npm run db:clear` (clears `_migrations` too), restart app, register fresh — opening balance should show **$100.00** and funding should stay exact. If data is **mixed** (some rows dollars, some cents), delete `bank.db` and start clean.
**Prevention**: Never use floating point for currency in any context. Store monetary values as integers (cents) in the DB and perform all arithmetic in cents. Use a shared currency utility for all conversions and display formatting so there is one place to audit.

## Pass Criteria
- [ ] Create an account and fund it with $0.10 ten times — balance should show exactly $1.00 + $100.00 opening balance = $101.00
- [ ] Fund with amounts that are known to cause floating point drift (e.g. $0.10, $0.20, $0.30) and confirm balance is exact
- [ ] Opening balance of $100.00 is stored and displayed correctly
- [ ] All currency displays show 2 decimal places and correct dollar formatting
- [ ] No balance drift after 50+ transactions

## PERF-408: Database Connection Resource Leak
**Priority**: Critical
**Root Cause**: Database connections were being opened per request without guaranteed cleanup. If an error occurred mid-operation the connection was never closed, causing connections to accumulate over time and exhaust system resources.
**Fix**: The Drizzle app uses a **single** better-sqlite3 handle created once in `lib/db/index.ts` and reused for all tRPC/Next requests (do not close it during normal handling). Removed the **extra** `new Database(dbPath)` inside `initDb()` that was pushed to an array and never closed—each process boot leaked one unused connection. For **short-lived** CLI/verification scripts that open their own handle, wrapped work in **`try/finally`** so `close()` always runs on errors.
**Prevention**: Always use try/finally for resource cleanup — never rely on the happy path to close connections. In Next.js, DB connections should use the singleton pattern to avoid re-initializing on every hot reload or request. Add connection pool monitoring to catch leaks early in production.

## Pass Criteria
- [ ] DB connection is initialized once as a singleton, not per request
- [ ] All DB operations that open a **dedicated** connection use `try/finally` (or process exit) so `close()` is guaranteed
- [ ] Simulating a DB error mid-request does not leave an **extra** connection open (singleton remains the only long-lived handle)
- [ ] App functions normally after fix — all queries and mutations work as expected
- [ ] Server/runtime code does not open additional `new Database(` handles; scripts that do must close in `finally`

## PERF-407: Performance Degradation Under Multiple Transactions
**Priority**: High
**Root Cause**: Performance degradation was caused by a combination of missing database indexes on frequently queried columns (accountId, createdAt), N+1 query patterns fetching records in loops, and sequential async operations that could run in parallel. Each issue compounds under load.
**Fix**: Added a composite Drizzle index on `(account_id, created_at)` for `transactions` plus `CREATE INDEX IF NOT EXISTS` in `initDb` for existing DBs; added `accounts(user_id)` for listing by user. `getTransactions` now uses one `innerJoin` query when rows exist (empty history still does a small ownership probe). `fundAccount` parallelizes post-insert “newest tx” read and balance `update`; tRPC context loads session + user with `Promise.all` and validates `session.userId` matches the JWT subject.
**Prevention**: Always index foreign key columns and columns used in ORDER BY. Review any loop containing an await as a potential N+1. Use Promise.all() for independent async operations as a default pattern. Add query performance logging in development to catch slow queries early.

## Pass Criteria
- [ ] Transactions table has indexes on accountId and createdAt
- [ ] No await calls inside loops fetching DB records
- [ ] Independent async operations in handlers use Promise.all()
- [ ] Transaction history query is noticeably faster with 50+ records
- [ ] All existing functionality works correctly after changes

## PERF-403: Session Expiry Buffer Missing
**Priority**: High
**Root Cause**: Session validity was checked with an exact timestamp comparison (`expiresAt > now`), meaning a session was considered valid right up until the millisecond it expired. This created a narrow but real window where an attacker with a captured session token could use it even as it was expiring.
**Fix**: Added a 60 second buffer constant (`SESSION_EXPIRY_BUFFER_MS`) to the session validity check. Sessions expiring within the next 60 seconds are now treated as already expired, closing the window near expiration.
**Prevention**: Session expiry checks should always include a buffer. Define the buffer as a named constant so it is easy to audit and adjust. Never use exact timestamp comparisons for security-sensitive time checks.

## Pass Criteria
- [ ] A session with more than 60 seconds remaining is accepted
- [ ] A session with less than 60 seconds remaining is rejected
- [ ] A fully expired session is rejected
- [ ] Valid sessions well within expiry work normally across all protected routes

## SEC-304: Multiple Valid Sessions Per User
**Priority**: High
**Root Cause**: The login flow created new sessions without invalidating existing ones, allowing unlimited simultaneous sessions per user. The logout flow only cleared the client-side cookie without deleting the session from the DB, meaning the token remained valid server-side. Session validation only checked the JWT signature without confirming the session still existed in the DB.
**Fix**: Login deletes all `sessions` rows for that user before inserting the new session. Logout deletes the DB row for the cookie token whenever a token is present (even if `ctx.user` is already null), then clears the cookie. `createContext` already required a matching `sessions` row after JWT verify — documented explicitly. Added `auth.logoutAllDevices` plus a dashboard control to revoke every session server-side and clear the cookie. **Follow-up**: Login/signup use **sequential** Drizzle `delete` then `insert` (better-sqlite3 sync driver cannot use async `db.transaction` callbacks), normalized login email to match stored lower-case emails, added **`UNIQUE INDEX ON sessions(user_id)`** plus startup **dedupe** of legacy duplicate rows so only one session per user can exist in SQLite even under races or older builds.
**Prevention**: Session invalidation must always be server-side and DB-backed. JWT validity alone is not sufficient — always cross-reference against the DB session store. Log out all devices functionality should be a standard feature in any banking application.

## Pass Criteria
- [ ] Log in on two browsers — second login invalidates the first session
- [ ] First browser session is rejected after second login
- [ ] Logout deletes the session from DB — confirm with `npm run db:list-sessions`
- [ ] Using a previously valid token after logout is rejected
- [ ] Valid active sessions work normally across all protected routes

## SEC-302: Insecure Account Number Generation
**Priority**: High
**Root Cause**: Account numbers were generated using Math.random() which is a pseudorandom number generator not suitable for security-sensitive values. Math.random() output is predictable and can be reverse-engineered, making account numbers guessable by an attacker.
**Fix**: Replaced Math.random() with crypto.randomBytes() from Node.js's built-in crypto module. This uses a cryptographically secure pseudorandom number generator (CSPRNG) that is suitable for generating sensitive identifiers. The output is converted to a 10-digit numeric account number.
**Prevention**: Never use Math.random() for any security-sensitive value — account numbers, session tokens, verification codes, or any identifier that must be unguessable. Always use crypto.randomBytes() or crypto.randomUUID() for these cases. Add a linting rule to flag Math.random() usage in auth and account-related files.

## Pass Criteria
- [ ] No Math.random() calls remain in account number generation code
- [ ] New accounts are created successfully with a 10 digit numeric account number
- [ ] Running account creation 10 times produces 10 different account numbers
- [ ] Account numbers are numeric only, no letters or special characters

