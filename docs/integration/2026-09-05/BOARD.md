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
- KAUL-202 REVIEW — report access/replacement changes retained; exact-candidate PostgreSQL validation and fresh Astra Red-Team pending. Owner Sol; lead coordinates validation.
- KAUL-203 REVIEW — Documents read/download authorization retained; exact-candidate validation and Red-Team pending. Owner Sol.
- KAUL-204 REVIEW — owned test-storage changes retained; focused unit evidence passes; combined browser and Red-Team pending. Owner Luna.
- KAUL-205 IN PROGRESS — Sol: diagnostic-only reproduction from exact PR #44 baseline in kaul-205-upload-diagnostics. Capture only allowlisted upload status/code, not arbitrary payloads/secrets. Diagnose before changing runtime.
- KAUL-206 IN PROGRESS — Astra: durable execution board and evidence correction; historical reports remain dated snapshots.
- KAUL-207 IN PROGRESS — Luna: isolated Windows tooling/harness investigation, preserving assertions and global Git settings.
- KAUL-208 BLOCKED — combined candidate freeze, validation and fresh separate Astra Red-Team depend on scoped work.
- KAUL-209 BLOCKED — supported upstream audit remediation. WAIT FOR UPSTREAM; no suppression/override/downgrade/prerelease. Development continues.
- KAUL-210 IN PROGRESS — Terra: historical signer title/role presentation.
- KAUL-211 IN PROGRESS — Terra: bounded dirty Client-edit cancellation/navigation protection using existing UX.
- KAUL-212 READY — scanner connection-timer lifecycle; coordinate with KAUL-205 evidence and assign after the critical diagnostic stage.
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
- Phase 2: exact locked dependencies installed in fresh integration worktree. PostgreSQL setup/validation in progress.

## Integration rules

Each worker self-checks and commits a bounded slice. Astra reviews the exact diff and evidence before incorporation. Security-sensitive work receives a fresh independent Astra Red-Team, with fixes/rejections supported by evidence. Review can group related exact commits without claiming inherited approval.

No candidate is release-ready while the mandatory audit or operational gates remain open. A failed audit remains visible even when all other validation succeeds.
