# Unified candidate execution board

Accepted reconciliation: 5 September 2026. This board tracks Phase 2 execution.
[Full ticket definitions and preservation inventory](RECONCILIATION.md) remain the starting scope.

## Active candidate

- Branch: codex/unified-candidate-20260905.
- Worktree: C:/Projects/kaul/.codex-worktrees/unified-candidate-20260905.
- Starting commit: 27df04ef18d397e1693dad747df803e2604ed748, a direct descendant of PR #44 at 82bf2987189a029516b7e6221f600af931827522.
- Protected main and Pilot branches remain unchanged. Existing worktrees and ignored evidence stay preserved.
- The owner authorized ordinary development, commits, development-branch pushes for CI and internal integration. Live deployment, secrets/key custody, protected-branch merges and destructive cleanup remain outside execution.

## Current tickets

- KAUL-201 CLOSED — reconciliation accepted by owner; 25 original registered worktrees and 20 distinct local-branch commits absent from remote heads were verified.
- KAUL-202 INTEGRATED — retained report access/direct-replacement changes accepted by independent Astra and lead; fresh 215-test PostgreSQL suite passed. Final combined validation pending.
- KAUL-203 INTEGRATED — retained Documents read/download authorization accepted by independent Astra and lead; fresh PostgreSQL evidence passed. Final combined validation pending.
- KAUL-204 INTEGRATED — owned test storage accepted by independent Astra and lead; unit evidence passed. Combined browser evidence remains pending.
- KAUL-205 IN PROGRESS — Sol: diagnostic-only reproduction from exact PR #44 baseline in kaul-205-upload-diagnostics. Capture only allowlisted upload status/code, not arbitrary payloads/secrets. Diagnose before changing runtime.
- KAUL-206 IN PROGRESS — Astra: durable execution board and evidence correction; historical reports remain dated snapshots.
- KAUL-207 IN PROGRESS — Luna: isolated Windows tooling/harness investigation, preserving assertions and global Git settings.
- KAUL-208 BLOCKED — combined candidate freeze, validation and fresh separate Astra Red-Team depend on scoped work.
- KAUL-209 BLOCKED — supported upstream audit remediation. WAIT FOR UPSTREAM; no suppression/override/downgrade/prerelease. Development continues.
- KAUL-210 INTEGRATED — Terra a08ff2d, Astra-reviewed and integrated as 2d3c0a8: stored historical signer title/role with truthful Swedish fallback; focused unit and static checks passed.
- KAUL-211 REVIEW / REVISION — Terra 3f8d847; Astra requested lifecycle and browser regression coverage before acceptance. No integration yet.
- KAUL-212 IN PROGRESS — Sol owns isolated scanner connection-timer cleanup with deterministic regressions; no claim of KAUL-205 causality.
- KAUL-213 BACKLOG — preservation disposition only; no cleanup until stable integration and explicit per-target gates.
- KAUL-214 BACKLOG — owner-attended operations, outside this development phase.

## Verification resources and boundaries

Lead owns serial PostgreSQL/browser execution. The normal local kaul database is separate and untouched.
The explicitly named disposable task is unified_0905, port 3119; repository guards validate its derived database before creation/migration. Existing task databases are not reused or deleted.
Only the locally verified Docker Desktop engine and loopback services are used; no homelab access.
All credentials and data used for tests are fictional. No .env was opened or modified.

## Evidence checkpoints

- Phase 1: PR #44 GitHub run 33919394787, attempts 1/2: 570 units and 197 PostgreSQL pass; 43/44 browsers; audit skipped after failure.
- Astra source 90f1eb3 retained logs: 601 units, 215 PostgreSQL, 44 browsers locally. These do not prove GitHub's upload issue fixed.
- Fresh Phase 1 checks: 24 report/storage units plus 12 pure snapshot path cases pass. Strict audit exits 1 on four High package entries.
- Phase 2 source 27df04e plus documentation: exact locked npm ci, Prisma generation, guarded database create and all ten migrations passed. Fresh PostgreSQL: 215/215 tests in 19 files. Formatting, lint (three existing warnings), typecheck and production build passed. No audit policy or lockfile changes.

## Integration rules

Each worker self-checks and commits a bounded slice. Astra reviews the exact diff and evidence before incorporation. Security-sensitive work receives a fresh independent Astra Red-Team, with fixes/rejections supported by evidence. Review can group related exact commits without claiming inherited approval.

No candidate is release-ready while the mandatory audit or operational gates remain open. A failed audit remains visible even when all other validation succeeds.

## Runtime availability finding — KAUL-215

IN PROGRESS / ENVIRONMENT: During the fresh full local Playwright attempt, Docker Desktop became unavailable. The browser run used the repository default of six local workers and ended with 11 failures, 29 not run and four passes; Documents failed at login before upload. Afterwards loopback PostgreSQL port 5432 was not listening and the already-verified local Docker Desktop API returned HTTP 500 for container inspect/version. The cause of the Docker failure is not established and is not attributed to the application or worker count.

No engine restart, shared-service stop, database deletion or homelab access was performed. The guarded kaul_test_unified_0905 database and owned temporary storage root remain preserved. A retry needs healthy local services and a newly validated disposable task, run serially. GitHub validation can continue independently. This attempt is a failed environment validation, not passing browser evidence and not reproduction of KAUL-205's upload-stage failure.

## Independent diagnostic review

Fresh Astra Red-Team accepted the four-file KAUL-205 diagnostic-only diff for publication: strict public-code/status output, exact artifact glob, original assertions retained. Seventeen adversarial in-memory sanitizer checks passed independently. A nonblocking diagnostic filesystem-error robustness finding was sent to Sol for correction before publication. This acceptance does not establish the upload failure cause or approve the final combined candidate.

KAUL-205 diagnostic publication: de079f5180167d987896866c5d54a0de11dff582, Draft PR #45, run 33949791534. P3 review correction accepted. Actual GitHub investigation continues. See [independent review evidence](RED_TEAM.md).
