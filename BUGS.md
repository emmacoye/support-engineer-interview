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

