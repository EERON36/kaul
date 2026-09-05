# KAUL-219 — Monthly Report signing recovery serialization

Status: CLOSED - accepted, integrated and exact-source CI verified.
Risk: CRITICAL / SECURITY-SENSITIVE. Priority: P2.
Base: `63ba72a1d5eacc24c3cb619cc570f1d8b72c6f05`.

## Confirmed defect and correction

After an unacknowledged signing transaction, the recovery verifier could read
its previous committed draft and no visible audit outcome while the signing
transaction was still unsettled. It classified that state as `ROLLED_BACK` and
attempted `FAILED` prematurely. Audit uniqueness prevents two contradictory
durable outcomes, but does not make that attempted classification correct.

Recovery now receives the known Client ID and acquires the same transaction
lock as signing before reading the report and outcome. The report lookup also
includes that Client ID alongside Organisation and report ID. Signing content,
historical signer snapshots, audit uniqueness and generic errors are unchanged.

## Regression evidence

Two parameterized PostgreSQL tests exercise the actual signing application
path, successful audit write and recovery verifier. A test-only interception
lets the real signing callback return while holding its database transaction,
then injects acknowledgement loss at the transaction-return seam. The tests
observe a matching ungranted advisory lock in `pg_locks`; they do not infer
serialization from an arbitrary sleep. A spy checks the actual failed-outcome
function so audit uniqueness cannot hide a contradictory attempt.

Before releasing the held transaction, both tests require recovery to remain
pending, no `FAILED` attempt, and only the prior draft/no outcome to be visible.
After release:

- Commit recovery returns the signed report with unchanged content and signer
  snapshot, exactly one `SUCCEEDED`, and no `FAILED` attempt.
- Rollback recovery preserves the draft and records exactly one `FAILED` only
  after rollback, returning the existing generic error.

On the unchanged production baseline, both tests failed at the assertion that
`recordFailedAuditOutcome` had not been called: each observed one premature
attempt. After the source fix, both passed.

Self-check commands and results:

- `npm run test:integration -- src/modules/reports/monthly-report.integration.test.ts -t 'unsettled signing'`: baseline 2 failed; corrected 2 passed.
- `npm run test:integration -- src/modules/reports/monthly-report.integration.test.ts src/modules/journal/journal.integration.test.ts src/modules/audit/audit.integration.test.ts src/modules/clients/clients.integration.test.ts src/modules/clients/client-archiving.integration.test.ts`: 83 passed across five files.
- `npm run test -- src/modules/reports src/modules/audit src/app/klienter/[clientId]/manadsrapporter/monthly-report-ui.test.ts`: 35 passed across six files.
- Full `npm run typecheck`, focused ESLint and Prettier for the two changed TypeScript files, and `git diff --check`: passed.

## Environment and limits

Main provisioned fresh `kaul_test_hardening_0905`, assigned task ID
`hardening_0905` and port `3128`, separately confirmed normal `kaul`, and ran
new-only creation plus all ten reviewed migrations. The worker repeated
`npm run test:db:check` before each PostgreSQL run. The allocation was exclusive
and returned to Main after the checks. The task database and worktree remain
preserved; this worker performed no database creation/drop/reset or service
operation. Dependencies and generated Prisma were reused unchanged from the
candidate through local junctions.

These are real PostgreSQL transaction tests with deliberately injected
acknowledgement loss, not a physical Prisma connection-loss experiment. Browser,
build and dependency-audit reruns were not needed for this narrow recovery
change. No schema, migration, dependency, UI, deployment or security-policy
change was made. Independent review and final combined-candidate CI are separate
gates; no staging, commit, push, merge or live operation is implied.
## Main and independent acceptance

Main reviewed the complete delta and accepted worker 49537bf, integrated as f880e2c. Independent Astra verified the exact source/test/evidence blobs, repeated the task guard and passed all 14 Monthly Report PostgreSQL cases. Additional memory-only checks preserved UNKNOWN classification on indeterminate verification and verification exceptions; no payload is returned for that state. Main then passed 107 PostgreSQL cases across six integrated Documents/Reports/Journal/Audit/Client suites. Run 33959074626 at 5968550 passed 692 unit, 224 PostgreSQL and all 44 browser tests. Audit alone failed. The earlier pending-review wording describes worker-stage evidence; no required source review remains for this delta.
