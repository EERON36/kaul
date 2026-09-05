# KAUL-216 — Documents download transaction failure evidence

Status: CLOSED — accepted, integrated and CI verified. Owner: Sol. Lead: Main Astra.
Risk: CRITICAL / SECURITY-SENSITIVE (Documents authorization and audit before release).
Priority: P2 verification gap, not a demonstrated production defect.
Base: ec5c5ea9146c35853ef976c482a52228a79788cd.

## Scope and result

Seven new regression cases prove the existing download failure boundaries using
real PostgreSQL transactions and actual FileSystemDocumentStorage handles:

- Audit intent and SUCCEEDED outcome write failures reject generically, release
  no payload and close the opened handle. Assertions identify the exact intended
  action/outcome and target, with expected durable audit state.
- Real commit followed by injected acknowledgement loss releases no payload,
  closes the handle, preserves one SUCCEEDED and creates no FAILED. A spy also
  proves no attempted recordFailedAuditOutcome call, so uniqueness enforcement
  cannot mask a contradictory attempt.
- Real revocation during integrity reading, followed by failure to persist the
  exact FAILED denial outcome, still closes the handle and releases no payload.
- Pending intent, authorization transaction and post-commit acknowledgement
  gates prevent early release. The final gate proves SUCCEEDED can be durable
  while the download remains withheld until acknowledgement. Successful caller
  ownership and closure are retained.

Only documents.integration.test.ts changed in executable code (+386/-1).
Reviewed Git blob: ca7af578f3831f83f259ff80a5d13733f9e0dfa0.
No production defect emerged; no source fix, redesign, dependency, schema,
migration, CI or security-policy change was needed. Authorization, Organisation
and Client scoping, assignments, audit ordering and response protections remain.

## Execution and review

Sol implemented and self-checked the tests. Main Astra reviewed the complete
delta and required explicit evidence against contradictory FAILED attempts and
release during pending post-commit acknowledgement. Sol supplied those bounded
test corrections; Main accepted the revised delta after independent validation.

Fresh independent Astra Red-Team accepted the exact test blob with no actionable
findings, inspected unchanged authorization/audit/storage/route code, independently
ran all 24 Documents PostgreSQL tests and verified the unchanged hash/diff.
This reviewer did not plan, implement, manage or integrate the work.

## Executed evidence

- Worker: Documents PostgreSQL 24/24; storage/download-route units 6/6; full
  typecheck, focused lint, Prettier and diff checks passed.
- Main: PostgreSQL 88/88 in five files (Documents, Audit, Clients/Assignments,
  Client archiving and Monthly Reports), including all 24 Documents cases.
  Baseline had 81 tests in the same files; the delta adds seven.
- Main: 80/80 surrounding unit tests in 13 unchanged files, covering Documents
  routes, storage, scanner, test-storage lifecycle, diagnostics and Audit.
- Main: full lint passed with zero errors and three unchanged Authentication
  navigation warnings; full typecheck, focused Prettier and diff checks passed.
- Independent Red-Team: guarded Documents PostgreSQL 24/24 and diff check passed.

Commands:

```text
npm run test:integration -- src/modules/documents/documents.integration.test.ts src/modules/audit/audit.integration.test.ts src/modules/clients/clients.integration.test.ts src/modules/clients/client-archiving.integration.test.ts src/modules/reports/monthly-report.integration.test.ts
npm run test -- documents src/modules/audit src/test/document-test-storage.test.ts src/test/document-upload-diagnostic.test.ts
npm run lint
npm run typecheck
```

Local Node 24.18.1 / npm 11.16.0 used the pinned lockfile and Prisma 7.9.1.
Only the verified stopped local development PostgreSQL service was started.
Normal kaul was confirmed separately; new task kaul216_0905, port 3126 passed
check, new-only creation and all ten migrate-deploy migrations. Each later
PostgreSQL run repeated test:db:check. The task database is retained; no database
reset/drop, service restart, existing-resource cleanup or live access occurred.

## Limits and separate work

Faults are deliberately injected at persistence/transaction-return seams around
real database/filesystem operations. They are not production incidents or a
physical connection-loss experiment inside Prisma. No payload is proved at the
domain return boundary; existing route tests separately cover bodyless denial
and protected attachment responses. No browser behavior changed.

KAUL-202/203/204 remain closed under their prior evidence; KAUL-216 supplies the
previously missing direct fault regressions. KAUL-205 upload root cause and
KAUL-208 prior combined acceptance retain their separate GitHub evidence at
source dc29c03 and documentation head ec5c5ea. Neither is inferred from this P2
closure. Any new-head CI is separate evidence. Dependency audit KAUL-209 remains
blocked without bypass. KAUL-215's historical Docker failure remains preserved;
current PostgreSQL availability does not establish its cause or complete E2E
recovery. Terra verified there are no independent READY tickets on the current
board; deferred Windows and owner-attended activation work were not promoted.

## Integration checkpoint

Main and independent Red-Team accepted the exact test delta above. The initial
automatic approval block preserved the work without any Git mutation. The owner
then explicitly authorized staging, committing, integration into
codex/unified-candidate-20260905 and pushing that development branch for CI.

Worker commit d052392f24d5fd015a3a8a58c3c427b49c7201c3 was integrated without
conflict as 2721891144fdc80cadbba77f0551998b345af782 and pushed to Draft PR #46.
The integrated test blob matches independent acceptance.

CI run 33956697235 passed 628 unit tests, 222 PostgreSQL tests and all 44 browser
tests. Formatting, lint, typecheck, build, migrations, real scanner refresh and
readiness, and the three operational rehearsals passed. Only the unchanged
mandatory dependency audit failed (GHSA-ggr8-5vv4-36mx, GHSA-3f6p-5ww8-9rcr and
GHSA-rgwj-5xj2-c3m3). Main Astra closes KAUL-216; KAUL-209 remains blocked. No
protected merge, Pilot change, deployment, live data/key operation or destructive
cleanup is authorized. The worker worktree and task database remain preserved.

Exact integrated validation: [GitHub run 33956697235](https://github.com/EERON36/kaul/actions/runs/33956697235). Closure changes after 2721891 are documentation only.
