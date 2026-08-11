# Kaul Agent Instructions

## Purpose and Operating Principle

Act as a critical engineering collaborator. Protect Kaul's simplicity,
security, consistency, portability, and maintainability.

Build the smallest secure and reliable solution for the approved requirement.
Do not assume that documentation, generated code, types, or successful
compilation proves correctness.

## Sources of Truth

Before planning or changing code, read this file, `docs/MILESTONES.md`, and the
documents relevant to the task:

- Scope and milestones: `docs/PROJECT_SPEC.md` and `docs/MILESTONES.md`
- Domain and architecture: `docs/DOMAIN_MODEL.md` and `docs/ARCHITECTURE.md`
- Technology and code standards: `docs/TECH_STACK.md` and
  `docs/CODING_STANDARDS.md`
- Security and operations: `docs/SECURITY.md` and `docs/DEPLOYMENT.md`
- User interface: `docs/UI.md`; material decisions: `docs/decisions/`

`docs/MILESTONES.md` is authoritative for current implementation status. Do
not infer current status from README summaries or directory names.

The authority order is:

1. Security and privacy requirements
2. Project specification
3. Domain model
4. Architecture
5. Current milestone
6. Accepted architecture decisions for the decision they govern
7. Technical stack
8. Coding standards
9. Individual implementation requests

If authoritative instructions conflict, stop and explain the conflict before
changing code. Do not silently choose an interpretation.

## Repository Map

Kaul is a Next.js App Router modular monolith using React, strict TypeScript,
PostgreSQL, Prisma, Better Auth, Vitest, and Playwright. `package.json` and its
lockfile define exact versions.

- `src/app/` — routes, Server Components, Server Actions, and client boundaries
- `src/modules/` — domain modules and business rules
- `src/lib/` — shared server-side infrastructure and narrowly reusable support
- `src/components/` — shared presentation components
- `prisma/` — authoritative schema and reviewed, committed migrations
- `src/generated/prisma/` — generated Prisma Client; do not edit manually
- `scripts/` — controlled operator and repository-validation commands
- `e2e/` — Playwright tests; `docs/decisions/` — architecture decisions

## Working and Git Workflow

Before editing:

1. Inspect Git status and the relevant implementation, tests, and documentation.
2. Identify the owning domain module and applicable security boundaries.
3. For non-trivial work, plan files, rules, tests, docs, risks, and open issues.

Inspect files rather than guessing their contents. State assumptions and
uncertainty plainly. Review generated or automated changes critically.

Keep changes limited to the approved task. Preserve unrelated tracked,
untracked, and ignored files. Do not discard or overwrite existing work merely
because the working tree is not clean.

Do not stage, unstage, commit, merge, push, switch branches, or rewrite history
unless the user explicitly authorises that operation.

Treat unexpected dependency, lockfile, Prisma schema, migration, CI, or
security-policy changes as review points. Stop and report them rather than
silently expanding the task.

Challenge conflicts, weakened security or traceability, scope expansion, and
speculative infrastructure. Propose the smallest safe alternative.

### Parallel Work and Worktrees

- Use isolated worktrees for coding tasks when parallel work is useful;
  read-only planning may inspect `main` without an editing worktree.
- Codex-native worktrees may begin on detached `HEAD`. After review and before
  commit, create a named feature branch in that worktree.
- A feature agent must not delete its worktree before reviewed work is
  preserved and its pull request is merged. Post-merge cleanup is a separate,
  verified task and may later be delegated to a maintenance workflow.
- Cleanup must prove that the pull request is `MERGED`, `main` is synced, the
  worktree has no unpreserved work, and any retained safety stash is no longer
  needed before removing a worktree or local branch. GitHub deletes merged
  remote branches automatically.
- Reconcile overlapping branches onto current `main`, resolve only genuine
  conflicts, and rerun verification proportional to their overlapping surface.
- Only one owner may create a Prisma migration at a time unless explicitly
  coordinated. Until isolated parallel-test resources exist, serialise shared
  PostgreSQL and Playwright work; use validated per-task resources once they do.

## Architecture and Scope

Preserve the modular-monolith architecture. Put business rules in their owning
domain module, keep database access server-side, keep client boundaries narrow,
and centralise reusable authorisation checks. Use transactions where outcomes
must remain consistent.

Do not introduce services, infrastructure, or generic abstractions without a
current need and any required architecture decision.

Implement only behaviour required by the current milestone. Future
compatibility comes from clear boundaries, not unused abstractions. Do not add
speculative dashboards, integrations, workflows, or infrastructure.

Enforce authentication, organisation boundaries, authorisation, assignment
access, audit requirements, and signed-record integrity on the server. Treat
browser-supplied identifiers and state as untrusted. Consult
`docs/DOMAIN_MODEL.md` and `docs/SECURITY.md` for the actual rules rather than
duplicating them here.

User-visible work is Swedish, accessible, keyboard usable, calm, and passes the
2 AM Test from `docs/UI.md`. Developer work uses English. Keep customer data
portable and domain logic independent of hosts and Prisma representations.

## Database and Test-Environment Safety

The normal local development database is `kaul`. Never run destructive,
integration, or Playwright setup against it.

Each local integration or E2E task must use an explicit validated
`KAUL_TEST_ID` and `KAUL_TEST_PORT`. The disposable database is always
`kaul_test_<id>`; `kaul` and `postgres` are invalid IDs.

For local database-writing tests:

1. Start only the PostgreSQL service if needed.
2. Confirm the normal `kaul` database exists separately.
3. Set both variables, then run `npm run test:db:check` to validate the ID,
   local URLs, matching database name, port (3101–3199), and auth origin.
4. Run `npm run test:db:create`; it refuses existing databases.
5. Run `npm run test:db:migrate`, which uses `prisma migrate deploy` with both
   database URL variables set to the task database.
6. Run the approved integration or Playwright command.
7. If cleanup is explicitly authorised, run `npm run test:db:drop`; it can
   drop only the current derived task database and does not force connections.

Stop if the disposable database already exists unless the user explicitly
authorises its deletion. Tasks share the PostgreSQL service: do not run
`docker compose down` during normal verification and never delete Docker
volumes as test cleanup. `npm run test:db:list` is read-only and may be used
to diagnose abandoned `kaul_test_*` databases.

Do not use `prisma db push`, reset commands, Better Auth migration commands, or
hand-written schema workarounds for verification. Prisma is the only migration
system. Inspect generated SQL and never rewrite an applied shared migration.

CI uses the same guard with its isolated `kaul_test_ci` service database. Do
not reproduce CI credentials or its database outside CI.

Use only fictional identities, credentials, secrets, and data. For
authentication-dependent checks, supply process-local values:

- `DEPLOYMENT_ENV=test`
- A fictional `BETTER_AUTH_SECRET` of at least 32 characters
- An explicit local `BETTER_AUTH_URL`
- The correct disposable database URLs when the test writes to PostgreSQL

Do not modify `.env` merely for verification or read, print, copy, or persist
real secrets. Never log or directly assert credentials, hashes, session data,
connection strings, or real personal data.

## Security-Sensitive Work and Dependencies

Authentication, sessions and cookies, credentials, authorisation, audit,
organisation isolation, assignments, journal integrity, file access, and
exports are security-sensitive.

Inspect their existing implementation and tests before changing them. Avoid
broad refactors. Preserve established fail-closed behaviour, transaction
boundaries, immutable records, secure cookies, and generic public errors. Keep
sensitive data out of URLs, browser bundles, audit metadata, and ordinary logs.

For behaviour that depends on a third-party version:

1. Verify the exact installed or pinned version.
2. Check current official documentation.
3. Inspect installed package source, exports, and types when behaviour is subtle
   or security-sensitive.
4. Prove important runtime and transaction behaviour with focused tests where
   appropriate.

Context7 may be used when already available. Do not require or automatically
install it, or treat it as a substitute for installed-source/runtime proof.

Adding or upgrading a dependency requires a clear current need, maintenance and
security review, normal installation without force flags, and lockfile review.
Do not use `--force`, `--legacy-peer-deps`, npm overrides, prerelease packages,
or automatic audit fixes to bypass a conflict.

Keep Better Auth packages exactly pinned. An upgrade requires dependency-tree,
official-documentation, generated-schema, Prisma migration, runtime
compatibility, and security review. Never use Better Auth's migration command.

## Normal Commands and Proportionate Verification

Use npm and the repository scripts:

- `npm ci` — reproduce dependencies; `npm run dev` — development server
- `npm run format:check` — formatting; `npm run lint` — ESLint
- `npm run typecheck` — strict TypeScript; `npm run test` — unit tests
- `npm run test:integration` — PostgreSQL integration tests; disposable database
  required locally
- `npm run test:e2e` — Playwright; disposable database required locally
- `npm run build` — production build; `npm run audit:ci` — audit policy
- `npm run prisma:generate` — regenerate Prisma Client
- `npm run db:deploy` — apply migrations; `npm run db:status` — migration status

Use `npm ls --all` after dependency changes and `git diff --check` before
hand-off. Review the complete diff and Git status before reporting completion.

Choose verification in proportion to risk:

- Documentation: focused review and `git diff --check`
- TypeScript/presentation: formatting, lint, typecheck, and focused unit tests
- Server or domain behaviour: regression tests and affected suites
- Authentication/audit/database/transactions: disposable PostgreSQL evidence
- User-visible routes and workflows: Playwright when appropriate
- Dependencies: lifecycle review, `npm ls --all`, audit, and regressions
- Prisma: generate, format, validate, inspect SQL, and deploy migrations
- Broad runtime changes: production build with fictional process-local values

Do not run expensive database or E2E suites for trivial documentation work.
Never weaken valid tests or claim a check passed unless it actually did.

## Definition of Done

Meaningful work is complete only when:

- Approved behaviour is implemented without scope creep.
- Important behaviour and defects have regression coverage; relevant checks pass.
- The diff contains no unrelated changes or sensitive information.
- Security, authorisation, organisation isolation, and audit were considered.
- Swedish, accessibility, and the 2 AM Test were considered where applicable.
- Schema, export, migration, backup, and historical integrity were considered.
- Documentation or an ADR was updated when behaviour or architecture materially
  changed.
- Untested, blocked, assumed, or unresolved items are reported clearly.

Review the original request and final diff before hand-off. Stop before staging,
committing, merging, or pushing unless explicitly authorised.
