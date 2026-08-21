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
- Complete Milestone 2 Client management: separate **Ungdomar** and **Vuxna**
  areas, Client creation and editing, read-only archiving, primary and secondary
  Staff assignments, and central assignment-based server access.
- Permission-aware basic Client search, a Staff Home showing currently assigned
  Clients, and clear primary/secondary responsibility context in Client lists
  and workspaces.
- Laptop-first, mobile-functional authenticated Client workflows.
- Complete Milestone 3 Journal and Signed Records: author-private drafts,
  explicit signing, immutable signed records, signed history and detail, and
  separate flat corrections.
- Complete Milestone 4 Goals and Follow-ups: shared Client planning,
  lifecycle and responsibility history, the current user's authorised **Att
  göra**, and immutable signing-time Goal context in Journal records.

The next project focus is **Pilot Readiness**: a repeatable, isolated pilot
using fictional or sanitised data, with HTTPS, environment separation,
operational monitoring, and verified backup and restore procedures. Documents,
reports, global search, exports, and other deferred features are not pulled
into the pilot merely by this change; initial user feedback should determine
which are blocking needs. Production credential-delivery,
sole-Administrator recovery, legal, operational, and security gates remain
unresolved. Kaul is not production-ready.

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

## Pilot deployment foundation

The repository contains a separate production-like Pilot stack with Caddy,
Kaul, and PostgreSQL, plus manual release, migration, backup, restore, and
update tooling. It does not deploy anything or approve real data. Start with
the [Pilot operator runbook](deploy/pilot/README.md).

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
