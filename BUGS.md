## SEC-301: SSN Plaintext Storage
**Priority**: Critical
**Root Cause**: SSNs were written directly to the SQLite database as plaintext strings with no encryption, making them fully exposed in any database breach or unauthorized read.
**Fix**: Implemented AES-256-GCM encryption using Node.js's built-in `crypto` module. SSNs are encrypted before write and decrypted after read using a key stored in the `SSN_ENCRYPTION_KEY` environment variable. The IV is stored alongside the ciphertext in the DB column as `iv:ciphertext`.
**Prevention**: Treat all PII fields (SSN, DOB, account numbers) as requiring encryption at rest by default. Add a pre-commit lint rule or schema annotation to flag unencrypted sensitive columns. Rotate the encryption key periodically and document a re-encryption migration process.

