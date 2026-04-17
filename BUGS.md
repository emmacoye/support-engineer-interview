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

