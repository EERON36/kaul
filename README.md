# Kaul

Kaul is a Swedish professional case-management and documentation system for
pedagogues and social-service organisations. It is being built as a secure,
portable modular monolith for organisations that need clear client access and
reliable historical records.

> Kaul is under development and must not be used with real or sensitive
> personal data.

## Current status

Implemented now:

- Individual email-and-password authentication, Administrator and Staff Member
  management, and a maximum 12-hour session lifetime.
- Persistent, immutable audit operations for the implemented authentication,
  staff, client, and assignment mutations.
- Client creation with separate **Ungdomar** and **Vuxna** areas, plus primary
  and secondary Staff assignments with server-side access control.
- A laptop-first, mobile-functional authenticated application foundation.

Planned work includes the remaining client management features, journal entries
and signing, documents, reports, search, exports, pilot readiness, and a later
production-readiness decision. Kaul is not production-ready.

## Core stack

Next.js App Router, React, strict TypeScript, PostgreSQL, Prisma, Better Auth,
Zod, Tailwind CSS, Vitest, Playwright, Docker Compose, and GitHub Actions.

## Local prerequisites

- Node.js 24.18.0 LTS and npm 11.16.0 (the exact supported range is in
  `package.json`; the Node version is in `.nvmrc`).
- Docker with Docker Compose.
- Fictional local-development configuration copied from `.env.example`.

## Start development

1. Copy `.env.example` to `.env`; keep fictional local values only.
2. Start PostgreSQL:

   ```powershell
   docker compose up -d database
   ```

3. Install dependencies, generate Prisma Client, and apply committed
   migrations:

   ```powershell
   npm ci
   npm run prisma:generate
   npm run db:deploy
   ```

4. For an empty local installation, create the initial Administrator once:

   ```powershell
   npm run bootstrap:admin
   ```

5. Start Kaul and open `http://localhost:3000`:

   ```powershell
   npm run dev
   ```

## Verification

Common checks:

```powershell
npm run format:check
npm run lint
npm run typecheck
npm run test
npm run build
npm run audit:ci
```

Database integration and browser tests need their documented disposable test
resources; do not run their setup against the normal local `kaul` database.
Install the Playwright browser before the first local browser-test run:

```powershell
npx playwright install chromium
npm run test:integration
npm run test:e2e
```

Use `npm run db:status` to inspect migration status. Prisma migrations are
committed to Git and applied shared migrations must not be rewritten.

## Authoritative documentation

- [Project scope and milestones](docs/PROJECT_SPEC.md) and
  [current milestone status](docs/MILESTONES.md)
- [Domain model](docs/DOMAIN_MODEL.md) and
  [architecture](docs/ARCHITECTURE.md)
- [Security requirements](docs/SECURITY.md) and
  [deployment planning](docs/DEPLOYMENT.md)
- [User-interface guidance](docs/UI.md),
  [technical stack](docs/TECH_STACK.md), and
  [development workflow](docs/DEVELOPMENT_WORKFLOW.md)

Contributor rules, including test-database safety, are in `AGENTS.md`.
