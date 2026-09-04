# Astra project health backlog — 4 September 2026

This is a bounded repository health pass, based on product integration commit
`82bf2987189a029516b7e6221f600af931827522`. `docs/MILESTONES.md` remains
authoritative. Existing work, protected branches, live systems, and release
approvals remain separate from this local improvement branch.

## ASTRA-001 — Preserve and reconcile development history

- **Problem / value:** Many branches, worktrees, uncommitted files, and safety
  references make it difficult to identify the current product without losing work.
- **Solution / files:** Read-only Git inventory and explicit dispositions in
  `REPOSITORY_INVENTORY.md` beside this backlog.
- **Dependencies / risk:** None; LOW, preservation-sensitive.
- **Owner:** `preservation_inventory` agent; lead review.
- **Branch / worktree:** `codex/astra-project-health-20260904`,
  `.codex-worktrees/astra-project-health-20260904`.
- **Acceptance / validation:** Every discovered ref/worktree classified; compare
  ancestry and equivalent patches; record dirty/ignored work without exposing secrets.
- **Status:** DONE. All original work preserved; historical cleanup remains deferred under the merged-PR and synced-main gates.

## ASTRA-002 — Correct current-status documentation

- **Problem / value:** Older status summaries call implemented product/Documents
  tracks deferred and present old operational evidence as current.
- **Solution / files:** Align README, PROJECT_STATE, ARCHITECTURE and UI status
  summaries with MILESTONES; preserve the August snapshot as dated history.
- **Dependencies / risk:** ASTRA-001 and live read-only audit results; LOW.
- **Owner:** `preservation_inventory` agent; lead review.
- **Branch / worktree:** `codex/docs-project-status-20260904`,
  `.codex-worktrees/astra-project-status`.
- **Acceptance / validation:** Distinguish main, Pilot, product integration,
  source evidence, operational evidence, and remaining approvals. Focused
  formatting, link review, and diff check.
- **Status:** DONE. Reviewed and integrated; see REPORT.md for exact commits and evidence.

## ASTRA-003 — Protect document browser-test storage

- **Problem / value:** `e2e/documents.spec.ts` recursively deletes an ambient
  `DOCUMENT_STORAGE_ROOT`; the database guard does not protect that filesystem path.
- **Solution / files:** A narrowly shared test-storage guard plus Playwright
  configuration and document fixture changes. Use only fresh task-owned storage;
  refuse unsafe roots before destructive cleanup.
- **Dependencies / risk:** None for local guard tests; CRITICAL test-data safety.
- **Owner:** `tooling_audit` agent; lead and independent safety review.
- **Branch / worktree:** `codex/fix-document-test-storage-20260904`,
  `.codex-worktrees/astra-document-test-storage`.
- **Acceptance / validation:** Unsafe/ambient/pre-existing paths retain harmless
  sentinels; test and server use the same safe root; positive fresh-root lifecycle
  works; focused unit checks and source review before any E2E run.
- **Status:** DONE. Independently accepted; 68 focused tests passed. Integrated as `8bb1c16`; final browser evidence is tracked in ASTRA-009.

## ASTRA-004 — Explain monthly-report aggregate validation

- **Problem / value:** Six individually valid fields can exceed the aggregate
  content limit; the action returns generic retry advice without a useful error.
- **Solution / files:** Monthly-report action/form and focused regression tests;
  bounded Swedish guidance, retained input, and accessible error association.
- **Dependencies / risk:** Existing schema unchanged; MEDIUM.
- **Owner:** `product_audit` agent; lead review.
- **Branch / worktree:** `codex/fix-monthly-report-feedback-20260904`,
  `.codex-worktrees/astra-report-feedback`.
- **Acceptance / validation:** Real schema rejection maps to safe actionable
  feedback; unknown errors remain generic; action/render tests and static checks.
- **Status:** DONE. Reviewed and integrated; see REPORT.md for exact commits and evidence.

## ASTRA-005 — Accept external Windows snapshot paths

- **Problem / value:** Review snapshot containment treats a different Windows
  drive as inside the repository, blocking valid external review snapshots.
- **Solution / files:** Correct `scripts/reviewed-slice-snapshot.mjs` containment
  and cover POSIX, Windows, and cross-drive cases in its tests.
- **Dependencies / risk:** None; MEDIUM review-tool correctness.
- **Owner:** Lead; independent agent review.
- **Branch / worktree:** `codex/fix-review-snapshot-paths-20260904`,
  `.codex-worktrees/astra-review-snapshot`.
- **Acceptance / validation:** Repository root/children remain forbidden;
  siblings, parent, different drives and shares classify correctly. Focused tests.
- **Status:** DONE. Twelve path regressions passed; integrated as `22d316c`. The existing Windows Git-fixture timeout is tracked separately.

## ASTRA-006 — Close monthly-report read authorization race

- **Problem / value:** Report listing checks Client access separately from the
  report query; assignment loss or archival between queries can disclose reports.
- **Solution / files:** Apply central current Client access and draft visibility
  inside the protected query in `monthly-report-internal.ts`; add deterministic
  revoke/archive-between-queries integration regressions.
- **Dependencies / risk:** Explicit disposable PostgreSQL resources and dedicated
  security review; CRITICAL confidentiality.
- **Owner:** `product_audit` implementation; lead and independent security review.
- **Branch / worktree:** `codex/fix-monthly-report-integrity-20260904`, `.codex-worktrees/astra-report-integrity`.
- **Acceptance / validation:** No report payload after access revocation; no
  archived drafts; authorized signed history preserved. PostgreSQL regression
  must run before claiming completion.
- **Status:** DONE. Actual PostgreSQL regressions reproduced the defect; final report suite 12/12 passed. Reviewed worker commit `31b3cec`, integrated `7f038fb`.

## ASTRA-007 — Reopen an existing replacement report

- **Problem / value:** The `replacement: null` predicate rejects retries before
  the code can return the existing shared replacement draft.
- **Solution / files:** Resolve the signed predecessor and its direct replacement
  under the existing Client lock; preserve signed lineage and uniqueness.
- **Dependencies / risk:** Disposable PostgreSQL; HIGH domain/concurrency.
- **Owner:** `product_audit` implementation; lead and independent security review.
- **Branch / worktree:** `codex/fix-monthly-report-integrity-20260904`, `.codex-worktrees/astra-report-integrity`.
- **Acceptance / validation:** Sequential and simultaneous requests return one
  draft; signed replacement cannot branch; same-Client/Organisation access holds.
- **Status:** DONE. Actual PostgreSQL regressions reproduced the defect; final report suite 12/12 passed. Reviewed worker commit `31b3cec`, integrated `7f038fb`.

## ASTRA-008 — Preserve dependency audit blockers

- **Problem / value:** Unchanged `audit:ci` rejects deepmerge-ts and mysql2
  advisories. A green compilation does not clear this release gate.
- **Solution / files:** Record exact live audit findings; supported dependency
  remediation requires its own compatibility and security review.
- **Dependencies / risk:** Upstream compatible remediation; CRITICAL supply chain.
- **Owner:** `tooling_audit` investigation; lead tracks gate.
- **Branch / worktree:** No dependency edits in this pass.
- **Acceptance / validation:** Unchanged `npm run audit:ci` exits zero after a
  separately reviewed supported remediation; no overrides, forced installs,
  downgrades, prereleases, or weaker policy.
- **Status:** BLOCKED. Current audit exits 1; four high-severity package entries.

## ASTRA-009 — Strengthen report and document runtime evidence

- **Problem / value:** Monthly-report integration coverage is sparse; document
  reads also separate access checks from payload queries and file integrity work.
- **Solution / files:** Track direct-SQL signed-record/lineage rejection,
  concurrency, revocation-at-download-release, scanner failure, and accessible
  workflow evidence without replacing it with static assertions.
- **Dependencies / risk:** Guarded database/storage, ASTRA-003, explicit test
  resources, relevant review; CRITICAL.
- **Owner:** Lead; independent security review required.
- **Branch / worktree:** `codex/astra-project-health-20260904`, `.codex-worktrees/astra-project-health-20260904`.
- **Acceptance / validation:** Actual PostgreSQL/browser results, exact commit,
  and remaining operator gates recorded separately.
- **Status:** DONE for this local pass at source `90f1eb3`: PostgreSQL 215/215, Linux units 601/601, Chromium 44/44, format/lint/typecheck/build pass. Audit and unexecuted release/manual gates remain explicit in REPORT.md.

## ASTRA-010 — Preserve smaller product and runtime follow-ups

- **Problem / value:** Signed report detail omits stored historical signer
  title/role; Client edit cancellation lacks an unsaved-work warning; scanner
  connection timeout timers remain pending after successful connections.
- **Solution / files:** Separate focused follow-ups in report detail, Client form,
  and document scanner; avoid unrelated redesign in this pass.
- **Dependencies / risk:** Product/accessibility and scanner protocol review;
  MEDIUM to HIGH depending on subtask.
- **Owner:** Lead triage, implementation unassigned.
- **Branch / worktree:** None.
- **Acceptance / validation:** Reproduce each symptom, define expected behavior,
  add focused regression and appropriate browser/runtime evidence.
- **Status:** DEFERRED. Lower priority than data preservation and access safety.

## ASTRA-011 — Revalidate document access before releasing a download

- **Problem / value:** List/detail/version reads can outlive their separate Client
  check; a download can authorize after assignment or account access is revoked
  during file integrity I/O. This risks disclosure and misleading audit success.
- **Solution / files:** Central Client detail predicates in protected Documents
  queries; after hashing, use the existing short Client lock to refresh actor and
  Client access and record authorization success transactionally. Close handles
  and record definitive denied authorization safely. Two Documents module files.
- **Dependencies / risk:** ASTRA-003, approved disposable PostgreSQL; CRITICAL.
- **Owner:** `tooling_audit` reproduction/tests, lead production patch and review,
  `preservation_inventory` independent security review.
- **Branch / worktree:** `codex/fix-document-read-access-20260904`,
  `.codex-worktrees/astra-document-read-access`.
- **Acceptance / validation:** Six original failures reproduced; final real
  PostgreSQL 17/17, Documents/Audit units 43/43, types/lint/format/diff checks pass.
  Real lock waiting, failed audit, closed handles and archived Admin reads proven.
  This does not claim complete serialization against every account-state change.
- **Status:** DONE. Worker `7b0e73c`, integrated `90f1eb3`; independently accepted.

## ASTRA-012 — Keep Windows and Linux text checkouts consistent

- **Problem / value:** Host `core.autocrlf=true` creates CRLF checkouts while
  Prettier expects LF, producing 307 formatting warnings in a fresh worktree.
- **Solution / files:** Add `* text=auto eol=lf` to `.gitattributes`, retaining
  existing explicit rules and automatic binary detection. No global settings,
  mass file rewrite, historical worktree conversion or dependency changes.
- **Dependencies / risk:** None; LOW checkout policy, broad file reach.
- **Owner:** Lead implementation; independent preservation review.
- **Branch / worktree:** Main Astra health branch/worktree.
- **Acceptance / validation:** Fresh checkout-index sample under autocrlf=true
  has LF and passes Prettier; a binary sentinel retains the same Git content hash.
  All source-archive formatting checks pass on pinned Linux Node 24.18.0.
- **Status:** DONE. Integrated commit `4695b53`.

## ASTRA-013 — Diagnose Windows operator-test execution

- **Problem / value:** Broad Windows unit run hits existing 5-second Git-fixture
  timeouts and stalls in the Bash operator harness; no full Windows pass exists.
- **Solution / files:** Compare unchanged tests in a pinned local Linux container,
  keep Windows failure evidence, and pursue a focused host/harness correction.
- **Dependencies / risk:** Reproducible host evidence; MEDIUM test reliability.
- **Owner:** Lead investigation; follow-up implementation unassigned.
- **Branch / worktree:** Validation only in the Astra health worktree.
- **Acceptance / validation:** Full Windows run completes without weakened tests;
  Linux evidence and host evidence are reported separately.
- **Status:** DEFERRED. Linux diagnosis completed: all 601 tests pass with exact source-tree identity and required temporary Git metadata. Full Windows operator-harness remediation remains open; no timeouts or assertions were weakened.
