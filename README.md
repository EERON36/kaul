# Kaul

Kaul is a professional case-management and documentation system for pedagogues and social-service organisations.

## Status

Milestone 0 — Project Foundation.

The repository currently contains the technical application foundation only. It does not contain authentication, client records, journals, documents, reports, search, or other business functionality.

> Kaul is under development and must not be used with real or sensitive personal data.

## Requirements

- Node.js 24.18.0 LTS
- npm 11.16.0
- Docker with Docker Compose

The Node.js version is recorded in `.nvmrc`. Use the same Node.js major version in development and CI.

## Local setup

1. Copy `.env.example` to `.env` and keep the fictional development values.
2. Start PostgreSQL:

   ```powershell
   docker compose up -d database
   ```

3. Install dependencies and prepare Prisma:

   ```powershell
   npm install
   npm run prisma:generate
   npm run db:deploy
   ```

4. Start Kaul:

   ```powershell
   npm run dev
   ```

Open `http://localhost:3000`.

## Validation

Run the foundation checks separately so failures remain easy to identify:

```powershell
npm run format:check
npm run lint
npm run typecheck
npm run test
npm run build
npx playwright install chromium
npm run test:e2e
npm run audit:ci
```

The Playwright smoke test starts the development server automatically. PostgreSQL must be running.

The CI audit policy prints all npm audit findings. It temporarily accepts only
the reviewed Next.js transitive advisories encoded in the repository and still
fails for every unexpected high- or critical-severity finding.

## Database commands

```powershell
npm run prisma:generate
npm run db:migrate
npm run db:deploy
npm run db:status
```

Prisma migrations are committed to Git. Applied shared migrations must not be rewritten.

## Environment safety

- `.env` files are ignored by Git.
- `.env.example` contains fictional local-development credentials only.
- PostgreSQL is bound to `127.0.0.1` in the local Compose configuration.
- Development, pilot, and production must use different credentials and data.
- Production data must never be copied into development.
