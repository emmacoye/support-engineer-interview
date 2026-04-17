# SecureBank - SDET Technical Interview

This repository contains a banking application for the Software Development Test Engineer (SDET) technical interview.

## 📋 Challenge Instructions

Please see [CHALLENGE.md](./CHALLENGE.md) for complete instructions and requirements.

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Start the application
npm run dev

# Open http://localhost:3000
```

## 🔐 Environment variables

Copy `.env.example` to `.env.local` (or `.env`) and set the values.

- **`SSN_ENCRYPTION_KEY`**: Required for SEC-301. A 32-byte key (AES-256) encoded as base64 (recommended) or 64-char hex.

Generate a base64 key:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

## 🛠 Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run db:list-users` - List all users in database
- `npm run db:clear` - Clear all database data
- `npm run db:reencrypt-ssn` - Re-encrypt existing plaintext SSNs in `bank.db` (SEC-301)
- `npm test` - Run tests (you'll need to configure this)

Good luck with the challenge!
