# Unified Kaul candidate — execution board

Updated: 6 September 2026. This is the active source of truth for the accepted reconciliation work. Historical reports retain their original dates and evidence.

## Bounded mobile remediation reopened

Owner authorization reopens former frozen candidate 3a931225 only for verified mobile findings. The earlier no-READY and acceptance checkpoints below are historical until this delta is reviewed and validated.

- KAUL-223 ACCEPTED / INTEGRATED - [Journal date/time reflow](KAUL-223.md); Journal mobile worker.
- KAUL-224 ACCEPTED / INTEGRATED - [Administrator search proximity](KAUL-224.md); Client mobile worker.
- KAUL-225 CLASSIFIED / INTEGRATED (verification) - [repeated-signing request capture](KAUL-225.md); separate diagnosis, no signing defect presumed.

Updated executable source: `f60cb6776e72a24bc7ba4c60872ac566cc503695`. Main and fresh independent review accepted the bounded delta; worker responsive/browser regressions passed. Broader integrated mobile QA and exact-candidate CI remain pending. The former SHA is not the updated candidate.

Retained fictional Documents storage from mobile_qa_20260905_01 is handled separately in the [safe disposition](MOBILE_STORAGE_DISPOSITION.md). The [physical-phone checklist](MOBILE_PHONE_SMOKE.md) remains owner-attended. Cleanup requires positive exclusive-ownership proof; no broad deletion or Documents polish is authorized. Main/Pilot/deployment remain outside scope.

## Active candidate

- Draft [PR #46](https://github.com/EERON36/kaul/pull/46), branch `codex/unified-candidate-20260905`.
- Worktree: `C:/Projects/kaul/.codex-worktrees/unified-candidate-20260905`.
- Final hardened source: 0173710, including closed KAUL-217 through KAUL-222. Documentation closure may advance the branch tip; resolve PR #46 for its current SHA.
- [Final source run 33962467276](https://github.com/EERON36/kaul/actions/runs/33962467276) passed 752 unit, 224 PostgreSQL and all 44 browser tests; static/build/migration/scanner, firewall/ingress and actual combined backup/restore checks passed. Overall CI failed only at unchanged mandatory dependency audit.
- Prior exact-source [run 33959433118](https://github.com/EERON36/kaul/actions/runs/33959433118) at 9f0d9a8 passed 704 unit tests, 224 PostgreSQL tests and 44 browser tests, static/build/migration/scanner checks, the new Pilot Documents readiness adapter and three operational rehearsals. Overall CI failed only at mandatory dependency audit. That run's backup rehearsal was PostgreSQL-only; the final run above now supplies KAUL-222 combined evidence.
- Direct ancestry retains Product `406aa755b74c8908b360c64ffe3b9f7bb5c3630f`, Documents `d22fe0b59a8708febdc89daa7cdf8516cc8f9c15`, PR #44 `82bf2987189a029516b7e6221f600af931827522` and Astra `27df04ef18d397e1693dad747df803e2604ed748`.

This is a repository integration candidate, not Pilot or production approval. Main, Pilot and existing PRs #41/#43/#44 remain unmerged and unchanged. No live infrastructure, production keys or live data were accessed.

## Ticket disposition

- KAUL-201 CLOSED — accepted reconciliation; original 25 worktrees and 20 local-only commits accounted for.
- KAUL-202 CLOSED — retained report access and direct-child replacement retry; independent Astra acceptance and exact-candidate PostgreSQL/browser validation.
- KAUL-203 CLOSED — retained Documents read/download authorization and lock/audit boundaries; independent Astra acceptance and exact-candidate validation.
- KAUL-204 CLOSED — owned test storage and safe retry lifecycle retained, reviewed and validated; ambient-root deletion was not restored.
- KAUL-205 CLOSED — stale ClamAV signatures root-caused on GitHub; bounded CI refresh and real adapter readiness resolve the upload on both original baseline and unified candidate. See the [causal evidence](CI_UPLOAD_INVESTIGATION.md).
- KAUL-206 CLOSED — current source-of-truth, review and CI handoff recorded; historical evidence remains dated and retained report feedback is validated.
- KAUL-207 PARTIAL / DEFERRED — cross-drive/LF fixes accepted; measured single Windows Git-fixture allowance passes all 13 cases. Broader incomplete operator timeout proposal rejected and preserved. Full Windows shell-harness reliability is unproven.
- KAUL-208 CLOSED — exact combined CI and fresh separate Astra final acceptance complete at dc29c03. Main Astra accepts the development candidate; audit remains a distinct merge/release blocker.
- KAUL-209 BLOCKED — WAIT FOR UPSTREAM. Strict audit rejects supported pinned Prisma/deepmerge-ts/mysql2 findings; no suppression, override, downgrade or prerelease.
- KAUL-210 CLOSED — historical signer title/role snapshot with truthful Swedish fallback; worker, lead and independent review accepted, full candidate validation passed.
- KAUL-211 CLOSED — controlled Client edits preserve failed saves, guard dirty navigation/cancel and handle consecutive saves; review corrections resolved and enhanced real browser cases pass.
- KAUL-212 CLOSED — settled scanner connection timer cleared without weakening socket/freshness/error handling; eight focused scanner tests and real scanner CI pass. This timer was not the upload root cause.
- KAUL-213 CLOSED (classification) — [preservation disposition](PRESERVATION.md) accounts for original local-only work and worker derivatives; no physical cleanup performed.
- KAUL-214 BACKLOG — owner-attended activation/operations; outside this repository execution phase.
- KAUL-215 OPEN (historical environment evidence) — the failed local E2E run and resources remain preserved. Docker API and PostgreSQL are healthy again; KAUL-216 passed newly guarded local PostgreSQL validation. The original API failure cause and full local E2E recovery remain unproven; current availability is not root-cause evidence.
- KAUL-216 CLOSED — [download transaction failure coverage](KAUL-216.md); seven real-PostgreSQL/filesystem fault cases, Main 88 PostgreSQL and 80 surrounding unit passes, independent Astra acceptance and 24 Documents passes. Tests only; integrated as 2721891 and pushed to Draft PR #46 under explicit owner authorization. Exact-source CI passed 628 unit, 222 PostgreSQL and all 44 browser tests; only the unchanged mandatory dependency audit failed.

## Whole-candidate hardening complete

[Integrated assessment and refreshed external blocker](HARDENING.md).

At base 63ba72a, independent whole-candidate review identified three bounded P2 findings. These are evidence-backed hardening work; the earlier no-READY checkpoint is historical.

- KAUL-217 CLOSED - [raw profile mutation](KAUL-217.md); Sol worker.
- KAUL-218 CLOSED - [scanner freshness ceiling](KAUL-218.md); Main Astra worker.
- KAUL-219 CLOSED - [uncertain report signing recovery](KAUL-219.md); real PostgreSQL reproduction and settled commit/rollback proof.

- KAUL-220 CLOSED - [release validation gate](KAUL-220.md); bounded image-publication false-green correction.
- KAUL-221 CLOSED - [combined activation prerequisites](KAUL-221.md); supported transition and truthful backup evidence.

- KAUL-222 CLOSED - [quiesced combined backup and isolated restore](KAUL-222.md); Sol operator worker and separate Records rehearsal worker. Main and independent source/conflict/runtime review passed. Actual combined PostgreSQL/Restic capture and isolated restore, two authorised byte downloads, four denials, audit and read-only permission checks passed in the final CI run.

KAUL-217-222 have Main and independent Astra acceptance. Whole-candidate engineering review is complete; no further evidence-backed repository READY ticket remains. KAUL-209 stays externally blocked. KAUL-207/215 are preserved historical environment limitations; KAUL-214 is owner-attended work. None is silently reported as resolved.

## KAUL-216 integration checkpoint

Worker commit d052392f24d5fd015a3a8a58c3c427b49c7201c3 was accepted by Main
Astra and fresh independent Astra Red-Team, then integrated without conflict as
2721891144fdc80cadbba77f0551998b345af782 and pushed to Draft PR #46.
The test blob remains ca7af578f3831f83f259ff80a5d13733f9e0dfa0. No production
source, dependency, lockfile, schema, migration or CI policy changed.

[Run 33956697235](https://github.com/EERON36/kaul/actions/runs/33956697235) at
2721891 passed 628 unit tests in 75 files, 222 PostgreSQL tests in 19 files,
and all 44 browser tests. Formatting, lint, typecheck, production build,
migration/conversion rehearsals, real scanner refresh/readiness and all three
operational rehearsals passed (the backup rehearsal proves database restore and standalone object validation, not a manifest-bound database-plus-object restore). Only mandatory dependency audit failed, on the
same recorded deepmerge-ts/mysql2 advisories. Main accepts and closes KAUL-216;
this does not clear KAUL-209 or grant merge/release/activation approval.

Subsequent closure edits are documentation only; resolve the branch tip for its
current documentation SHA. This P2 closure is separate from KAUL-205 upload
root-cause proof and the prior KAUL-208 combined acceptance. No full initial
source re-review was repeated for this bounded test delta. No independent READY
ticket was identified; historical Windows/Docker evidence and owner-attended
activation remain distinct open work.

## Prior exact-candidate validation

Run 33952908177 at dc29c03 passed:

- 628 unit tests in 75 files; 215 PostgreSQL integration tests in 19 files; 44 browser tests, including Documents and both enhanced Client-edit workflows.
- Locked install, Prisma generation, all ten migrations, legacy structured-record migration rehearsal and Personnummer conversion rehearsal.
- Formatting, lint, strict TypeScript and production build.
- Explicit signature refresh and genuine ClamAvDocumentScanner readiness under the unchanged 24-hour policy.
- Firewall, private ingress and append-only PostgreSQL backup/exact-restore CI rehearsal. Standalone object-manifest verification is separate; combined database-plus-object restore is not proved.

Audit ran and FAILED on High GHSA-ggr8-5vv4-36mx (deepmerge-ts) and GHSA-3f6p-5ww8-9rcr (mysql2); mysql2 also reports Moderate GHSA-rgwj-5xj2-c3m3. The four High package entries include Prisma/config aggregates. No dependency, lockfile, schema, migration or audit-policy change was introduced by this execution phase.

## Documents before-and-after proof

Original diagnostic source 0e62b6b, run 33951865295: stale signature classification, actual adapter rejection, initial upload 503 with storage directories present, 43 other browser cases passed. The single CI fix was applied as 0e41352, run 33952919474: successful explicit refresh, real adapter readiness and 44/44 browser passes, plus 598 unit and 197 PostgreSQL passes. Only audit failed.

Unified source dc29c03 independently passed the same real upload within its full 44-browser suite. The large diagnostic probe stays on PR #45 and is not a candidate dependency. The small allowlisted failure diagnostic remains available for future failures. [Full investigation](CI_UPLOAD_INVESTIGATION.md).

## Review and preservation

Worker self-checks, Main Astra acceptance and fresh independent critical reviews precede integration. The separate combined-candidate Astra review covers the retained security work, conflict resolution, Client lifecycle and final CI fix. Findings and corrections are recorded in [RED_TEAM.md](RED_TEAM.md).

The original 20 local-only commits are classified as eight retained Astra commits and twelve patch-equivalent alternatives. No duplicates were replayed. Historical dirty work, unique concepts, safety refs and ignored evidence remain preserved. New worker-to-candidate commit provenance is in [PRESERVATION.md](PRESERVATION.md).

Protected refs verified unchanged: remote/local main a93c863cd906b3e25157c1d04a3529fb2ed7db67; remote Pilot a631d8e66f4a039553eafdf86254acd04144b140; local Pilot d20e45369e5a0ebb768d9a791c7ee47607cfdb32.

## Local evidence and limits

Lead-created guarded task unified_0905, port 3119, passed test:db:check, new-only database creation, all ten migrations and 215 PostgreSQL tests before Docker Desktop became unavailable. Normal kaul was confirmed separately and untouched. The subsequent local E2E run failed with 11 failures, 29 not run and four passes; Documents failed at login, not upload. Afterwards the verified local engine returned API HTTP 500 and PostgreSQL connectivity failed. Cause is unestablished; this is not application pass evidence or proof of worker-count causality.

The disposable database, owned temporary storage and ignored logs remain preserved. No database deletion, reset, Docker restart, compose down or volume cleanup occurred. Any local retry requires healthy services and a newly guarded task. Windows fixtures measured 5.7/9.4 seconds for real Git and 13.1–27.45 seconds for fake-only operator cases; even a diagnostic 30-second allowance failed. Only the measured single Git case received a 15-second Windows allowance; Linux and pure-case defaults remain unchanged.

Focused local regressions, formatting/lint/typecheck/build passed as recorded in the investigation and review documents. GitHub supplies the current complete Linux/runtime validation; it does not establish full Windows reliability, manual assistive-technology acceptance, live host configuration, production restore/key custody or stakeholder approval.

## Next gate

Repository hardening is complete. Stop before live deployment and await supported upstream audit remediation under unchanged policy. Follow the [exact owner-attended gate](../../../deploy/pilot/UNIFIED_CANDIDATE_ACCEPTANCE.md). Any later transition requires separately authorized owner-attended activation, retained-key restore/conversion proof, persistent Documents/scanner configuration and operational/stakeholder acceptance. Physical cleanup is a separate verified per-target task.

[Accepted Phase 1 report and original ticket definitions](RECONCILIATION.md) remain preserved; this board supersedes their dated execution statuses.
