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

