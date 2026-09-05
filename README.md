# Kaul

Kaul is a Swedish professional case-management and documentation system for
pedagogues and social-service organisations. It is being built as a secure,
portable modular monolith for organisations that need clear client access and
reliable historical records.

> Kaul is under development and must not be used with real or sensitive
> personal data.

## Current status

The active local development candidate and exact validation gates are tracked
in the [unified integration board](docs/integration/2026-09-05/BOARD.md).

The completed Milestones 0–4 baseline on `main` provides:

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

The separate, unmerged product integration candidate adds the approved tracks:

- Expanded Client information and Stage A Personnummer encryption.
- Six-section Journal drafts that preserve legacy signed records, and
  Client-scoped, manually authored **Månadsrapporter** with immutable signing.
- Client **Dokument** with immutable versions, private storage, malware scanning,
  and combined database/object backup verification.

These implementations do not mark Milestone 5 complete or approve activation.
**Homelab Pilot Readiness** remains an open release track, alongside product
validation. The dependency audit, combined migration and browser evidence,
Personnummer conversion and restore gates, Documents operating requirements,
and stakeholder acceptance remain unresolved. **Production / Cloud Launch
Readiness** is a separate later decision. Global search, exports,
notifications, and other unapproved features remain deferred. Kaul is not
Pilot-ready or production-ready.

See the [current project state](docs/PROJECT_STATE.md) for the short operational
snapshot and open release gates. `docs/MILESTONES.md` remains authoritative for
milestone scope and completion.

## Core stack

Next.js App Router, React, strict TypeScript, PostgreSQL, Prisma, Better Auth,
Zod, Tailwind CSS, Vitest, Playwright, Docker Compose, and GitHub Actions.

## Local prerequisites

- Node.js 24.18.0 LTS and npm 11.16.0 (the exact supported range is in
  `package.json`; the Node version is in `.nvmrc`).
- Docker with Docker Compose.
- Fictional local-development configuration copied from `.env.example`.

## Start development

1. Copy `.env.example` to `.env`; keep fictional local values only. Set
   `KAUL_PERSONNUMMER_KEYRING_FILE` to an absolute path. The committed
   `test-fixtures/personnummer-keyring.json` is fictional and may be used only
   for local development and automated tests; never reuse it elsewhere.
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

Database integration and browser tests need an explicit disposable test ID,
port, matching local URLs, and fictional process-local authentication values as
documented in `AGENTS.md`. Never run their setup against the normal local
`kaul` database. After setting those values, validate and create the new test
database before use:

```powershell
npm run test:db:check
npm run test:db:create
npm run test:db:migrate
npm run test:integration
```

Install the Playwright browser before the first local browser-test run, then use
the same guarded lifecycle for the browser suite:

```powershell
npx playwright install chromium
npm run test:e2e
```

Documents browser tests exclusively create `kaul-documents-e2e-<KAUL_TEST_ID>`
under the operating system's temporary directory. The test server uses that
same directory; `DOCUMENT_STORAGE_ROOT` does not select browser-test storage.
An existing directory is preserved and blocks the Documents tests: select a
new test ID and its matching disposable database configuration. Cleanup removes
only the directory created by the current test after verifying its ownership.

Drop only the current derived test database with `npm run test:db:drop` when
cleanup is explicitly authorised. The command refuses the normal `kaul`
database.

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
- [Current operational snapshot and release gates](docs/PROJECT_STATE.md)
- [Domain model](docs/DOMAIN_MODEL.md) and
  [architecture](docs/ARCHITECTURE.md)
- [Security requirements](docs/SECURITY.md) and
  [deployment planning](docs/DEPLOYMENT.md)
- [User-interface guidance](docs/UI.md),
  [technical stack](docs/TECH_STACK.md), and
  [development workflow](docs/DEVELOPMENT_WORKFLOW.md)

Contributor rules, including test-database safety, are in `AGENTS.md`.
