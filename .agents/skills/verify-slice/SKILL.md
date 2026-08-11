---
name: verify-slice
description: Select and run proportionate Kaul verification from the LOW, MEDIUM, HIGH, or CRITICAL / SECURITY-SENSITIVE risk class in DEVELOPMENT_WORKFLOW.md. Use while planning verification or before handoff; do not choose checks by model name or blindly run every suite.
---

# Verify slice

Read `AGENTS.md` and `docs/DEVELOPMENT_WORKFLOW.md`. Classify the slice by its
highest affected boundary, list the smallest evidence needed, and run only
relevant repository commands.

- **LOW:** Use focused documentation or mechanical checks, focused Prettier
  where applicable, and `git diff --check`.
- **MEDIUM:** Add focused tests plus lint and typecheck when the changed
  TypeScript or presentation surface requires them.
- **HIGH:** Add focused domain, server, transaction, or PostgreSQL integration
  evidence. Add browser evidence when behavior crosses UI and server
  boundaries.
- **CRITICAL / SECURITY-SENSITIVE:** Use HIGH evidence plus focused dependency
  or compatibility proof where relevant, database and browser regressions where
  relevant, and a dedicated final security review.

Do not duplicate database safety logic. For database-writing or E2E checks,
require explicit `KAUL_TEST_ID` and `KAUL_TEST_PORT`, run the existing
`test:db:check`, `test:db:create`, and `test:db:migrate` commands, and use only
that task's database. Drop it only with explicit cleanup authorization.

Never choose a free port, derive a database name outside the validator, remove
an existing or abandoned database, stop shared PostgreSQL, or run Playwright
merely because it exists.

Report the risk class, evidence run and passed, checks intentionally omitted,
and every blocker or remaining risk. Never describe an unrun check as passed.
