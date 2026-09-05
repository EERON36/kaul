# SOURCE OF TRUTH

Reconciliation date: 5 September 2026. Phase 1 was read-only except for this analysis artifact and isolated unit-test temporary fixtures. No source edits, staging, commits, pushes, branch changes, merges, cleanup, database execution, deployment, or infrastructure access were performed.

**Conclusion:** Astra is a clean, local-only descendant of PR #44. Its tip is a documentation commit; the fixes already form separate commits. Preserve that history as the proposed next local candidate. The GitHub-only Documents upload failure remains unresolved, and the unchanged dependency audit remains red. Neither candidate is release-ready or Pilot-ready.

Evidence comes from exact Git objects and diffs, all registered worktree inventories, live GitHub REST/CLI queries, complete reads of the three prior Astra reports, filtered retained validation summaries, fresh focused unit checks, and independent Sol/Terra/Luna investigations. Prior review claims were not treated as approval. No final Astra Red-Team was launched.

## VERIFIED / HANDOFF CLAIM CONFIRMED

- Repository and sole remote: `C:/Projects/kaul`; `origin` = `https://github.com/EERON36/kaul.git`. Live `git ls-remote --heads --tags origin` found 11 heads, matching cached remote-tracking refs. A fetch was unnecessary. No remote tags or GitHub releases; no issues; four open PRs, including older dependency PR #15.
- `main`, local and remote: `a93c863cd906b3e25157c1d04a3529fb2ed7db67`. Completed Milestones 0–4 baseline. No Product/Documents/Astra merge into main.
- Remote Pilot RC and [PR #41](https://github.com/EERON36/kaul/pull/41): `a631d8e66f4a039553eafdf86254acd04144b140`; OPEN, Draft, base `main`, unmerged. Its [run 33433456405](https://github.com/EERON36/kaul/actions/runs/33433456405) fails the dependency-audit step; three rehearsal jobs succeed.
- Product source and [PR #43](https://github.com/EERON36/kaul/pull/43): `406aa755b74c8908b360c64ffe3b9f7bb5c3630f`, branch `codex/client-journal-monthly-reports`; OPEN, Draft, base `main`, unmerged. [Run 33788088661](https://github.com/EERON36/kaul/actions/runs/33788088661) fails the dependency-audit step; three rehearsal jobs succeed.
- Documents source: `d22fe0b59a8708febdc89daa7cdf8516cc8f9c15`, local/remote `codex/client-documents`.
- Product + Documents and [PR #44](https://github.com/EERON36/kaul/pull/44): `82bf2987189a029516b7e6221f600af931827522`, local/remote `codex/product-integration`; OPEN, Draft, base `main`, unmerged. Title: **Integrate client product features and secure Documents**.
- Astra: `codex/astra-project-health-20260904` at `27df04ef18d397e1693dad747df803e2604ed748`. GitHub has no matching branch; commit lookup returns HTTP 422, “No commit found”; Actions query for this full SHA returns zero runs. All eight post-PR-44 commits remain local only.
- Authoritative candidate scope: `docs/MILESTONES.md:1242` approves the parallel Product/Documents tracks while retaining M7/M8 gates. Main's older milestone text describes main, not the unmerged candidate.

## HANDOFF CLAIM CHANGED / CORRECTED

- The **local** `pilot/release-candidate` branch is `d20e45369e5a0ebb768d9a791c7ee47607cfdb32`, two commits behind remote Pilot. It was not advanced.
- `27df04e` is **not an aggregate implementation commit**. It adds three reports, 715 lines. Its parent `90f1eb3` is the validated production-source checkpoint. Seven earlier commits contain the changes.
- “Astra fixed Documents” must be qualified: it fixes read/download access and test-storage safety. It does not establish a fix for GitHub's upload failure.

## UNKNOWN / INTENTIONALLY NOT REVERIFIED

The actual live deployment SHA, live keys, storage, scanner, database and backups were not inspected. The owner's earlier-Pilot deployment description remains a handoff statement, not fresh operational proof. No inference from GitHub establishes live-host state.

# WORKTREE INVENTORY

Inventory details are recorded below. “Clean” means no staged, modified or ordinary untracked files; ignored artifacts are listed separately and remain protected. Every worktree has **zero staged changes**. Full HEADs are supplied to avoid relying on branch names.

### 1. C:/Projects/kaul

Branch: `main`. HEAD: `a93c863cd906b3e25157c1d04a3529fb2ed7db67`.

State: **dirty / preserve all listed work**; staged 0; ignored top-level entries 7; commits not reachable from any current remote head: **0**. Disposition: **ACTIVE / IMPORTANT; retain**.

Ordinary untracked content is the nested `.codex-worktrees/` container; no tracked main edits. Its subdirectories are inventoried separately.

### 2. C:/Projects/kaul/.codex-worktrees/astra-document-read-access

Branch: `codex/fix-document-read-access-20260904`. HEAD: `7b0e73cf056f37c4a6a0cdcf3af5c04ff48faa59`.

State: **clean**; staged 0; ignored top-level entries 3; commits not reachable from any current remote head: **1**. Disposition: **PRESERVE UNTIL REVIEWED**.

### 3. C:/Projects/kaul/.codex-worktrees/astra-document-test-storage

Branch: `codex/fix-document-test-storage-20260904`. HEAD: `02b06c0dd1309f1add1864bd18161b57b6c9e093`.

State: **clean**; staged 0; ignored top-level entries 3; commits not reachable from any current remote head: **1**. Disposition: **PRESERVE UNTIL REVIEWED**.

### 4. C:/Projects/kaul/.codex-worktrees/astra-project-health-20260904

Branch: `codex/astra-project-health-20260904`. HEAD: `27df04ef18d397e1693dad747df803e2604ed748`.

State: **clean**; staged 0; ignored top-level entries 6; commits not reachable from any current remote head: **8**. Disposition: **ACTIVE / IMPORTANT; retain**.

### 5. C:/Projects/kaul/.codex-worktrees/astra-project-status

Branch: `codex/docs-project-status-20260904`. HEAD: `5517419f7a49c624f8f85c993d422be3bf28778b`.

State: **clean**; staged 0; ignored top-level entries 0; commits not reachable from any current remote head: **1**. Disposition: **PRESERVE UNTIL REVIEWED**.

### 6. C:/Projects/kaul/.codex-worktrees/astra-report-feedback

Branch: `codex/fix-monthly-report-feedback-20260904`. HEAD: `c7879a06bbd53eb056a124d59161a6a6fcc3bc33`.

State: **clean**; staged 0; ignored top-level entries 3; commits not reachable from any current remote head: **1**. Disposition: **PRESERVE UNTIL REVIEWED**.

### 7. C:/Projects/kaul/.codex-worktrees/astra-report-integrity

Branch: `codex/fix-monthly-report-integrity-20260904`. HEAD: `31b3cec24723092368f26d6215bd8cc7ae4574cd`.

State: **clean**; staged 0; ignored top-level entries 3; commits not reachable from any current remote head: **1**. Disposition: **PRESERVE UNTIL REVIEWED**.

### 8. C:/Projects/kaul/.codex-worktrees/astra-review-snapshot

Branch: `codex/fix-review-snapshot-paths-20260904`. HEAD: `e6924fad14a5f9abfc2113f325abcb0569605f00`.

State: **clean**; staged 0; ignored top-level entries 1; commits not reachable from any current remote head: **1**. Disposition: **PRESERVE UNTIL REVIEWED**.

### 9. C:/Projects/kaul/.codex-worktrees/client-journal-monthly-product

Branch: `codex/client-journal-monthly-reports`. HEAD: `406aa755b74c8908b360c64ffe3b9f7bb5c3630f`.

State: **dirty / preserve all listed work**; staged 0; ignored top-level entries 6; commits not reachable from any current remote head: **0**. Disposition: **ACTIVE / IMPORTANT; retain**.

Preserved status entries (M = tracked modification, ?? = untracked):

```text
?? deploy/pilot/OWNER_ATTENDED_PRODUCT_PERSONNUMMER_DEPLOYMENT.md
```

### 10. C:/Projects/kaul/.codex-worktrees/client-journal-monthly-ui

Branch: `codex/client-journal-monthly-ui`. HEAD: `874be11d78016fd4bdcdec168b147e36f5e59328`.

State: **clean**; staged 0; ignored top-level entries 2; commits not reachable from any current remote head: **1**. Disposition: **PRESERVE UNTIL REVIEWED**.

### 11. C:/Projects/kaul/.codex-worktrees/gate-c-rollback

Branch: `codex/fix-gate-c-rollback`. HEAD: `4a25c4ef429bf82ffcc91870f0e3204acd44a410`.

State: **dirty / preserve all listed work**; staged 0; ignored top-level entries 4; commits not reachable from any current remote head: **0**. Disposition: **PRESERVE UNTIL REVIEWED**.

Preserved status entries (M = tracked modification, ?? = untracked):

```text
?? .codex-local-gate-c-rehearsal.sh
?? .codex-local-gate-c-repeat.sh
?? .codex-local-gate-c-runtime.sh
?? .codex-local-gate-c-storage.sh
```

### 12. C:/Projects/kaul/.codex-worktrees/gate-c-sequencing

Branch: `codex/fix-gate-c-sequencing`. HEAD: `03dee2992d1eb5cb3e00227672e3ca994a542f3c`.

State: **clean**; staged 0; ignored top-level entries 2; commits not reachable from any current remote head: **0**. Disposition: **DUPLICATED/CONTAINED ELSEWHERE; retain until cleanup gates**.

### 13. C:/Projects/kaul/.codex-worktrees/gate-c-transient-probe

Branch: `codex/fix-gate-c-transient-probe`. HEAD: `764bf9e6645f457faddf430801d4b707e68bbb4f`.

State: **clean**; staged 0; ignored top-level entries 1; commits not reachable from any current remote head: **0**. Disposition: **DUPLICATED/CONTAINED ELSEWHERE; retain until cleanup gates**.

### 14. C:/Projects/kaul/.codex-worktrees/homelab-infrastructure-prep

Branch: `codex/homelab-infrastructure-preparation`. HEAD: `1febb5c845ade0fb0e64e4991e0351acc3dbcc70`.

State: **clean**; staged 0; ignored top-level entries 4; commits not reachable from any current remote head: **0**. Disposition: **DUPLICATED/CONTAINED ELSEWHERE; retain until cleanup gates**.

### 15. C:/Projects/kaul/.codex-worktrees/journal-history

Branch: `codex/fix-journal-history-race`. HEAD: `047387735774a286eb71f365c719d75f8ca0e02d`.

State: **clean**; staged 0; ignored top-level entries 4; commits not reachable from any current remote head: **4**. Disposition: **PRESERVE UNTIL REVIEWED**.

### 16. C:/Projects/kaul/.codex-worktrees/klienter-child-navigation

Branch: `codex/klienter-child-navigation`. HEAD: `a631d8e66f4a039553eafdf86254acd04144b140`.

State: **clean**; staged 0; ignored top-level entries 5; commits not reachable from any current remote head: **0**. Disposition: **DUPLICATED/CONTAINED ELSEWHERE; retain until cleanup gates**.

### 17. C:/Projects/kaul/.codex-worktrees/pristine-first-migration

Branch: `codex/allow-pristine-first-migration`. HEAD: `45976e491ed176f1e18b471dc436b83b3ff5d43e`.

State: **clean**; staged 0; ignored top-level entries 2; commits not reachable from any current remote head: **0**. Disposition: **DUPLICATED/CONTAINED ELSEWHERE; retain until cleanup gates**.

### 18. C:/Projects/kaul/.codex-worktrees/restic-parser-correction

Branch: `codex/fix-rest-server-trailing-blank`. HEAD: `ccd49b4c1442e99e3c65dd4e8922316159ca1006`.

State: **clean**; staged 0; ignored top-level entries 2; commits not reachable from any current remote head: **1**. Disposition: **PRESERVE UNTIL REVIEWED**.

### 19. C:/Projects/kaul/.codex-worktrees/visual-concepts-20260901

Branch: `codex/kaul-visual-concepts-20260901`. HEAD: `d0844e317e6f841b7c725201db5829c0cd7cc37a`.

State: **clean**; staged 0; ignored top-level entries 0; commits not reachable from any current remote head: **0**. Disposition: **ACTIVE / IMPORTANT; retain**.

### 20. C:/Projects/kaul/.codex-worktrees/vuxna-ungdomar-primary-choices

Branch: `codex/vuxna-ungdomar-primary-choices`. HEAD: `d20e45369e5a0ebb768d9a791c7ee47607cfdb32`.

State: **clean**; staged 0; ignored top-level entries 5; commits not reachable from any current remote head: **0**. Disposition: **DUPLICATED/CONTAINED ELSEWHERE; retain until cleanup gates**.

### 21. C:/Projects/kaul-client-documents

Branch: `codex/client-documents`. HEAD: `d22fe0b59a8708febdc89daa7cdf8516cc8f9c15`.

State: **dirty / preserve all listed work**; staged 0; ignored top-level entries 6; commits not reachable from any current remote head: **0**. Disposition: **ACTIVE / IMPORTANT; retain**.

Preserved status entries (M = tracked modification, ?? = untracked):

```text
 M AGENTS.md
```

### 22. C:/Projects/kaul-product-integration

Branch: `codex/product-integration`. HEAD: `82bf2987189a029516b7e6221f600af931827522`.

State: **dirty / preserve all listed work**; staged 0; ignored top-level entries 6; commits not reachable from any current remote head: **0**. Disposition: **ACTIVE / IMPORTANT; retain**.

Preserved status entries (M = tracked modification, ?? = untracked):

```text
 M AGENTS.md
```

### 23. C:/Users/EERON/.codex/worktrees/3a8d/kaul

Branch: `codex/vuxna-ungdomar-ui`. HEAD: `c42c6431cf67eaa4300f0517993ca4a38dc901cd`.

State: **dirty / preserve all listed work**; staged 0; ignored top-level entries 4; commits not reachable from any current remote head: **0**. Disposition: **PRESERVE UNTIL REVIEWED**.

Preserved status entries (M = tracked modification, ?? = untracked):

```text
 M e2e/client-foundation.spec.ts
 M e2e/client-search.spec.ts
 M src/app/globals.css
 M src/app/klienter/client-list-client.tsx
 M src/app/klienter/page.tsx
?? src/app/klienter/client-category-view.test.ts
?? src/app/klienter/client-category-view.ts
?? src/app/klienter/client-list-client.test.ts
```

### 24. C:/Users/EERON/.codex/worktrees/b32f/kaul

Branch: `DETACHED`. HEAD: `c42c6431cf67eaa4300f0517993ca4a38dc901cd`.

State: **clean**; staged 0; ignored top-level entries 0; commits not reachable from any current remote head: **0**. Disposition: **DUPLICATED/CONTAINED ELSEWHERE; retain until cleanup gates**.

### 25. C:/Users/EERON/.codex/worktrees/pilot-release-candidate/kaul

Branch: `pilot/release-candidate`. HEAD: `d20e45369e5a0ebb768d9a791c7ee47607cfdb32`.

State: **clean**; staged 0; ignored top-level entries 6; commits not reachable from any current remote head: **0**. Disposition: **ACTIVE / IMPORTANT; retain**.

### Additional repositories and local branches

The unregistered standalone clone `C:/Projects/kaul/.codex-worktrees/client-journal-monthly-validation` has its own Git directory and local origin, detached at `eb1b11f2644317e447c93477f3f7615c8001ea2f`. It has no tracked/untracked changes or ordinary stash; ignored validation artifacts remain. Its committed work is preserved in the parent repository. Class: LIKELY TEMPORARY / PRESERVE UNTIL REVIEWED. It is additional to the 25 registered worktrees.

Five branches have no registered worktree: `codex/fix-rest-server-version-parser` (`80a8508`), `feat/pilot-accessibility` (`e6adc5a`), `feat/pilot-deployment-foundation` (`0e45a4b`), `feat/pilot-orientation` (`6c28a6a`), `feat/pilot-product-hardening` (`f279800`). All are remote-contained ancestors of PR #44, absent from main; preserve until normal cleanup gates.

There are 29 local branches and 20 distinct commits absent from current remote heads: Astra 8; Journal-history 4; the UI alternative 1; six Astra worker tips 6; Restic alternative 1. The union was directly verified from Git. See LOST-WORK RISK for safety references. Branch absence alone does not imply unique work: other unpushed branch names point to remote-contained commits.

# ASTRA COMMIT ANALYSIS

## Identity and ancestry

- Tip: `27df04ef18d397e1693dad747df803e2604ed748`.
- Exact parent: `90f1eb3b77900977a0c7d43d3c4a614ea55ef8f7`.
- Tip tree: `8d8b4a2f09ce590455adae6f7290ba6c1fc19acd`.
- Parent/source tree: `b4bc91a885e77798b6a9a214629c58476def3b9f`.
- Normal one-parent documentation commit, authored/committed 5 September 2026 at 00:33:26 +02:00. No merge or squash aggregate at this tip.
- Only the Astra branch contains the tip. Its worktree is `C:/Projects/kaul/.codex-worktrees/astra-project-health-20260904`.

Merge bases with Astra, followed by commits unique to the comparison ref / Astra:

1. `main`: `a93c863cd906b3e25157c1d04a3529fb2ed7db67`; **0 / 88**.
2. Product: `406aa755b74c8908b360c64ffe3b9f7bb5c3630f`; **0 / 12**.
3. Product integration: `82bf2987189a029516b7e6221f600af931827522`; **0 / 8**.
4. Documents source: `d22fe0b59a8708febdc89daa7cdf8516cc8f9c15`; **0 / 21**.
5. Pinned PR #44 head: the same `82bf298…`; **0 / 8**.

```text
Product 406aa755 ─────┐
                     ├─ 43a5f6b8 (two-parent integration)
Documents d22fe0b5 ───┘     │
                         237ab29b (CI storage)
                            │
                         82bf2987 (PR #44)
                            │
                         cbc86643 report feedback
                            │
                         22d316c1 snapshot paths
                            │
                         42f9b50d status documentation
                            │
                         8bb1c16d test-storage safety
                            │
                         4695b532 LF checkout policy
                            │
                         7f038fb6 report access/replacements
                            │
                         90f1eb3b document read/download access
                            │
                         27df04ef health reports
```

`43a5f6b84b10c98afcc0c117b64d6b0f08793810` has exactly the Product and Documents source SHAs as parents. Astra therefore contains both reviewed source lines through PR #44; it is category **A, a clean descendant**.

## Exact diff and change groups

Tip-only diff: `BACKLOG.md` +200, `REPORT.md` +321, `REPOSITORY_INVENTORY.md` +194, all under `docs/astra/2026-09-04/`; **3 files, +715 / −0**.

Cumulative PR #44 → Astra: **22 files, +2314 / −313**. Exact `git diff --numstat` below; paths are repository-relative identifiers, additions/deletions respectively:

```text
   3    0  .gitattributes
  23   10  README.md
  17    8  docs/ARCHITECTURE.md
 103  225  docs/PROJECT_STATE.md
  17    7  docs/UI.md
 200    0  docs/astra/2026-09-04/BACKLOG.md
 235    0  docs/astra/2026-09-04/PROJECT_STATE_2026-08-23.md
 321    0  docs/astra/2026-09-04/REPORT.md
 194    0  docs/astra/2026-09-04/REPOSITORY_INVENTORY.md
  15    9  e2e/documents.spec.ts
   2    5  playwright.config.ts
   5    3  scripts/reviewed-slice-snapshot.mjs
  26    0  scripts/reviewed-slice-snapshot.test.mjs
  21    2  src/app/klienter/[clientId]/manadsrapporter/actions.ts
  90    1  src/app/klienter/[clientId]/manadsrapporter/monthly-report-ui.test.ts
  28    2  src/modules/documents/documents-internal.ts
 306    1  src/modules/documents/documents.integration.test.ts
  72   38  src/modules/reports/monthly-report-internal.ts
 338    1  src/modules/reports/monthly-report.integration.test.ts
   2    1  src/modules/reports/monthly-report.test-support.ts
 220    0  src/test/document-test-storage.test.ts
  76    0  src/test/document-test-storage.ts
```

The eight unique commits, oldest first:

1. `cbc86643391c4e146cb6c025e3c2d03833c07210`: safe Swedish aggregate-limit feedback, retained form values, recovery tests. Worker equivalent `c7879a0`.
2. `22d316c136b9419492679d9c95bb942906f5cea8`: correctly classify external Windows drives/shares for review snapshots; twelve path cases. Worker equivalent `e6924fa`.
3. `42f9b50d376d7e3e5e38fb320f52742199f4ee15`: separate current candidate status from dated deployment evidence; archive the former PROJECT_STATE with a historical warning. Worker equivalent `5517419`.
4. `8bb1c16d87c8666f5a2e0e3bd0e2e62c12e2ad1f`: derive test storage from validated test ID; refuse existing roots; require identity/ownership before fixture deletion; recreate subdirectories for cached-adapter retries. Worker equivalent `02b06c0`.
5. `4695b532d14f7a677cc0d0c6c3f65795a89cf07c`: `.gitattributes` text auto-detection with LF checkout, preserving binary detection. Independent tooling policy, not a Documents runtime fix.
6. `7f038fb6eb1a6864f74202e4c9d2735ddbd4e60d`: report read predicates, current actor checks, direct replacement draft reopening under existing Client lock; access/concurrency/SQL integrity tests. Worker equivalent `31b3cec`.
7. `90f1eb3b77900977a0c7d43d3c4a614ea55ef8f7`: Documents payload access predicates and post-integrity-I/O download reauthorization/audit under Client lock. Worker equivalent `7b0e73c`.
8. `27df04ef18d397e1693dad747df803e2604ed748`: final health documentation only.

No committed temporary logs, source exports, generated Prisma output, debug endpoint or diagnostic instrumentation appears in this range. The test-only query hook is gated by the existing test-dependency mechanism. Ignored validation logs/source exports/generated-file backups are separate local artifacts.

Astra's ignored tmp artifacts were inventoried by name: astra-final-linux-with-git.log, astra-final-integration.log and astra-final-e2e.log are retained final-result evidence; astra-final-linux-validation.log, astra-final-windows-format.log and astra-final-windows-format-refreshed.log preserve failed/refreshed diagnostics. astra-final-source.tar and astra-linux-validation.sh are local source-export/validation tooling, not product files. astra-eol-proof/, astra-lf-refresh/ and astra-generated-backup/ preserve checkout proofs and generated-file backups; pilot-ops-tests-694892/ is a retained operator fixture. None is included in the candidate diff or approved for deletion. The four committed Astra documents are durable reports/history, not temporary artifacts.
This is a broad **branch**, but not one indivisible commit. Keep the existing separation. Do not squash all changes or blindly cherry-pick only `27df04e`; the latter would copy reports without fixes. Technical continuation on this ancestry is appropriate, subject to the bounded review and evidence gates below.

# PR #44 COMPARISON

Common ancestor is exactly `82bf2987189a029516b7e6221f600af931827522`. PR #44 has **zero** unique commits; Astra has the eight listed above. The older candidate is fully contained. Advancing along this ancestry introduces no divergence conflict; this is a graph conclusion, not an executed merge.

Fourteen Astra-changed files also changed between main and PR #44: `.gitattributes`, README, ARCHITECTURE, PROJECT_STATE, UI, Documents E2E, Playwright configuration, both report action/UI-test files, both Documents module/test files, and all three report module/integration/test-support files. The eight other files are the four Astra documents, two snapshot-tool files and two new test-storage files. Source overlap is intentional extension of existing Product/Documents behavior.

Logical differences:

- **Reports:** authorization moves into payload selection; drafts and signed records retain different archived-client rules. Replacement retries find only the direct draft child, preserving signed lineage.
- **Documents:** list/detail/version queries repeat Client access. Downloads finish integrity verification, take the existing Client lock, revalidate current actor/access and atomically record authorization before releasing the handle. Upload/ClamAV implementation is unchanged.
- **Browser environment:** test storage no longer honors ambient `DOCUMENT_STORAGE_ROOT`; both fixture and launched server use the validated task root. Runtime deployment storage is unchanged. This environmental difference needs GitHub evidence.
- **Tooling/docs:** Windows path classification, LF policy and status clarification are independent maintenance changes. No architecture service, dependency, deployment script or workflow was introduced.

Prisma schema and all ten migrations are byte-identical between candidates. The six Pilot migrations are followed by `20260901090000_add_structured_records_and_monthly_reports`, `20260902120000_encrypt_client_personal_identity_number`, `20260903120000_add_client_documents`, and `20260903121000_protect_client_document_lifecycle`. No ordering, SQL, encryption conversion or trigger rewrite occurred.

No duplicated new fix within the linear candidate was found. Worker branches preserve alternate commit IDs for equivalent changes; they must not be integrated a second time. Selectively replaying entire worker histories would risk redundant work and obscure provenance.

# DOCUMENTS CI STATUS

**ROOT CAUSE NOT PROVEN — DIAGNOSTIC TICKET STILL REQUIRED**

[Run 33919394787](https://github.com/EERON36/kaul/actions/runs/33919394787) is attached to exact PR #44 head 82bf2987189a029516b7e6221f600af931827522. Attempt 1 (validate job 101173971842) and attempt 2 (101177918007) both show 570 units and 197 PostgreSQL tests passing, followed by **43 browser passes and one failure**. Both retry the Documents workflow twice and still cannot see “Dokumentet har laddats upp.” at original e2e/documents.spec.ts:215.

Firewall, ingress and backup rehearsals, migration application, legacy structured-record rehearsal, Personnummer migration/conversion rehearsal, formatting, lint, typecheck and build pass. **Audit was skipped after the browser failure**; it did not pass.

Astra changes the E2E storage lifecycle and read/download authorization. Upload request/route, content validation, streaming, size limit, quarantine, production adapter, ClamAV protocol/freshness rules, promotion, upload error mappings, scanner host/port, workflow YAML and browser upload assertions are unchanged.

Playwright now ignores the workflow's runner-temp DOCUMENT_STORAGE_ROOT and uses an owned OS-temp root. This might change runner behavior. Both are runner-local temporary paths and the existing adapter creates subdirectories, but no captured runtime ownership/permission comparison proves equivalence or identifies the first failure's cause. Cached-adapter retry support is also not proof of the initial upload cause.

The route already exposes bounded HTTP status/application codes. Capture these with scoped fictional E2E evidence; never expose arbitrary exceptions, paths, contents, credentials, scanner internals or keys. Trace-on-first-retry exists, but the workflow has no artifact-upload step and the run's artifacts API returns **zero artifacts**.

GitHub has no Astra run or commit. Local 44/44 cannot prove the same GitHub failure was reproduced and eliminated. The previous report does not explicitly claim a GitHub fix, but omits this known blocker from its remaining-work list.

# TEST DELTA

## Exact counts and evidence

- **PR #44, 82bf298:** 570/570 units, 70 files; 197/197 PostgreSQL, 19 files; 44 browser cases, **43 pass / 1 fail**. Confirmed from both GitHub attempts.
- **Astra, source 90f1eb3:** retained local summaries show 601/601 units, 71 files; 215/215 PostgreSQL, 19 files; 44/44 browsers, 10 files. Tip 27df04e changes documentation only.
- **Fresh Phase 1 execution:** 24/24 document-storage/report-UI unit cases; 12/12 pure snapshot-containment cases. One other snapshot Git-fixture case was intentionally filtered out, reported skipped. Cumulative git diff --check passed. Fresh npm run audit:ci failed, exit 1.

Unit delta **+31**:

1. src/test/document-test-storage.test.ts: **+16**, one new file. Fresh/ambient/pre-existing paths, marker tampering, root replacement, links, validated IDs, cleanup, server-root consistency and cached-adapter retries.
2. scripts/reviewed-slice-snapshot.test.mjs:64: **+12**, five POSIX and seven Windows/drive/share cases.
3. src/app/klienter/[clientId]/manadsrapporter/monthly-report-ui.test.ts:121: **+3**, aggregate-limit feedback retaining values, exact-limit recovery and clearing stale validation before conflict feedback.

PostgreSQL delta **+18**:

1. src/modules/documents/documents.integration.test.ts:309: **+8**. Three list/detail/download revocations after preflight; three assignment/ban/password-change denials during integrity I/O; one real pending-assignment lock waiter; one archived-client Administrator download.
2. src/modules/reports/monthly-report.integration.test.ts:392: **+10**. Two access/archive timing cases; three actor-state cases; direct replacement reopening, concurrency, signed-row delete/truncate rejection, audit-required signing and predecessor-lineage rejection.

Vitest/package discovery is unchanged. Parameter expansion explains why declaration counts undercount. No removed assertions, duplicated suite, widened discovery, new exclusion/skip, increased retry or weakened expectation was found. Browser declarations/content/success assertions remain unchanged.

These are legitimate regressions. Documents integration uses a fake clean scanner and its additions test reads/downloads, not GitHub upload with real ClamAV. Rendering checks do not prove human assistive-technology acceptance.

## Prior-report claim classification

The requested REPORT.md, BACKLOG.md and REPOSITORY_INVENTORY.md were read completely. Repeated claims inherit these classifications.

- **VERIFIED:** exact source/parent tree, PR #44 ancestry, eight commits, six worker patch equivalences, unchanged dependency/schema/migration/audit files, 25 registered worktrees, 29 local branches, Pilot lag, current PR/ref identities, empty ordinary stashes, no tags/releases/issues.
- **VERIFIED source behavior:** report access repair, direct replacement retry, download reauthorization, owned test storage, aggregate feedback, Windows path classification and LF policy.
- **VERIFIED as retained summaries; PARTIALLY VERIFIED historical execution provenance:** 601 units, 215 PostgreSQL and 44 browsers. Astra tmp/astra-final-linux-with-git.log contains source tree b4bc91a885e77798b6a9a214629c58476def3b9f and successful format/lint/typecheck/unit/build markers. astra-final-integration.log records 215/215; astra-final-e2e.log records 44 passed. These logs were read through summary filters; they were not independently recreated or treated as tamper-evident records.
- **PARTIALLY VERIFIED:** pinned historical Node/container environment and source-archive run that failed two Git-metadata cases before a later complete unit pass. The older astra-final-linux-validation.log remains failed diagnostic evidence, not the final pass.
- **PARTIALLY VERIFIED:** baseline reproduction counts, previous worker reviews, LF refresh index equality and byte-preservation during the earlier pass. Current commits, tests, backups and dirty states support the account; Phase 1 did not replay every earlier operation. Prior review does not satisfy the future fresh Astra Red-Team gate.
- **VERIFIED:** fresh audit still red. Four High package entries include aggregate entries; mysql2 also has a Moderate advisory within its High package entry. Do not call these four independent High vulnerabilities.
- **PARTIALLY VERIFIED:** complete Windows harness failure/portability narrative. The report correctly leaves full Windows success unproven. Twelve fresh path cases do not close that harness issue.
- **STALE as current totals, valid dated snapshots:** initial 18 worktrees/22 branches/154 commits; pre-final 167 reachable commits. Current shared Git has 168 reachable commits after the documentation tip. 90f1eb3 remains the source checkpoint, while 27df04e is the branch tip.
- **NEEDS FURTHER INVESTIGATION if operational confirmation is required:** prior database retention, port release, removed containers, LF cleanup operations and “no live access during the prior pass.” Repository inspection alone cannot conclusively establish those historical operations. They do not block source reconciliation.
- **VERIFIED follow-ups:** stored signer title/role omitted in report detail; Client cancel loses unsaved input; scanner connection timer persists after success.
- **UNSUPPORTED:** treating local 44/44 or ASTRA-009 “DONE for this local pass” as a GitHub fix, final integration acceptance or release approval.
- **INCORRECT as a complete current remaining-work list:** REPORT/BACKLOG omit the verified GitHub Documents blocker. The local result itself is not incorrect. Status correction should preserve the historical report and distinguish local, remote and human/operational evidence.

The archived PROJECT_STATE_2026-08-23.md preserves the earlier text with a dated warning. README/ARCHITECTURE/UI correctly distinguish main from unmerged work, but their remaining-validation wording should now distinguish completed local tests from failed GitHub and unrun human/operational gates.

No full PostgreSQL, migration, E2E, build or Linux-container rerun occurred in Phase 1. These were not necessary to prove ancestry; a local rerun would not replace missing GitHub diagnostic evidence.

# SECURITY FINDINGS

**No new CRITICAL or HIGH source regression was found in Astra's cumulative diff.** This is the lead/independent reviewed-diff conclusion, not release approval or proof against every possible race.

## CRITICAL boundaries: retain fixes, require final review

- **Reports:** baseline had separate access-preflight/payload queries. Astra embeds current Client predicates and refreshes actor state in monthly-report-internal.ts:260–340. Drafts require ordinary active-client access; signed history retains archived Administrator detail access.
- **Documents:** list/detail/version selection now embeds Client access. After integrity verification, Client locking protects fresh actor/access evaluation and successful authorization audit before handle release (documents-internal.ts:793–867). Failure closes the handle. Streaming does not hold the lock.
- **Test filesystem safety:** baseline recursively deleted an ambient path. Astra requires fresh ownership, device/inode identity, canonical root and non-link marker checks before deletion (document-test-storage.ts:23–72). This valid serious discovery is separate from upload CI.

## HIGH boundary assessment

Authentication/session/cookie/password/protected-route implementations are unchanged. Central organisation/Client/Assignment policy remains; current-user checks improve affected reads. Complete serialization against every concurrent account change is not claimed: a Client lock is not a universal account lock.

Signed Journal, legacy narrative and correction implementations/triggers are unchanged. Monthly replacement reopening now requires the direct unsigned child under the existing lock; signed replacement prevents branching. Immutable SQL/audit/lineage constraints remain and receive negative tests.

Personnummer/client/encryption/conversion files and migration are identical. AES-256-GCM key/envelope handling, separate Personreferens, legacy conversion source and idempotence remain. No plaintext output path was added. Stage A does not imply legacy plaintext removal: attended conversion, retained-key restore and separately approved Stage C still apply.

Documents keeps client scope, immutable versions, logical archive, opaque IDs, SHA-256 verification, 25 MiB limit, PDF/JPEG/PNG/UTF-8 validation, streaming/quarantine, clean/fresh-signature requirements, fail-closed ClamAV, private storage, server-mediated attachment downloads, safe cache headers and auditing. Production storage/scanner code is unchanged.

All ten migrations, Prisma schema, backup manifest/object verification, deployment/ingress/backup scripts are unchanged. This is no new proof of live ownership/mount permissions, snapshot consistency or restore.

Fresh dependency audit fails on deepmerge-ts@7.1.5 (High GHSA-ggr8-5vv4-36mx), mysql2@3.15.3 (High GHSA-3f6p-5ww8-9rcr and Moderate GHSA-rgwj-5xj2-c3m3), plus Prisma/config aggregate entries. Prisma/config remain 7.9.1; Better Auth/adapter exactly 1.6.25; fast-uri is 3.1.7. **WAIT FOR UPSTREAM**, no bypass; release gate remains blocked.

## MEDIUM findings / evidence gaps

- GitHub Documents upload remains unexplained and blocks workflow acceptance.
- Prior current-status reporting omits that failure and needs correction.
- Audit skipped after browser failure is ordinary fail-red sequencing, not an Astra false-green change. It cannot be cited as a pass. No test weakening was found.

## LOW findings

- Stored historical signer title/role are selected but detail renders name/time only (manadsrapporter/[reportId]/page.tsx:69). Valid UI/traceability gap; signed storage integrity is unaffected.
- Client Avbryt calls setEditing(false) without dirty-state protection (client-edit-client.tsx:193). Valid bounded UX issue; the explicit existing warning rule is Journal-specific, so Client behavior needs product confirmation.
- document-malware-scanner.ts:98–115 leaves an ordinary connection timer after success. It can retain the event loop; its late rejection cannot alter the settled scan result or accept malware. Pre-existing and **not proven to cause CI upload failure**.

# LOST-WORK RISK

## MUST PRESERVE

Astra's eight local-only candidate commits, all six worker tips, dirty Product/Documents AGENTS files, owner-attended deployment guide, four Gate C scripts, eight-file Youth experiment, standalone validation clone, unique visual concepts, ignored logs/source exports/generated backups and safety refs.

There are **20 distinct commits reachable from local branches but absent from current remote heads**, verified directly with git rev-list --count --branches --not --remotes: Astra 8; Journal-history 4; UI alternative 1; Astra worker tips 6; Restic alternative 1. More historical objects are retained by application/safety refs; these are not additional active branch commits.

No ordinary stash exists. Three refs/safety/consolidation-20260822/login-audit-compatibility references retain stash-shaped history and untracked authentication prototypes:

- 2f68dbe-first → 05c64855af31fc268c647e7b25a056d5e37631da.
- 2f68dbe-second → b01a764d602b0d2e5cdde1971bec262f555a31a1.
- c9d5ebd → 09d4a54ab518b479038f8184481bb3d585ae22b5.

Thirty application snapshot refs and thirteen turn-diff refs remain. The new capture tree 3aaa0e0a5b2a4b75a362f06e014957a58fa4f3d3 duplicates an existing checkpoint exactly: main plus nested-worktree gitlinks, not a new product commit. Preserve these application-owned refs.

## REVIEW LATER

Patch-equivalent worker/UI/Journal/Restic branches, detached b32f, standalone validation clone and ignored artifacts. Stable patch-ID comparisons independently confirmed all six worker pairs listed above, UI 874be11→ccffd04, Journal fd90d37→9b47cac / 4127b94→ec4cf7a / 09916c4→c866b9c / 0473877→73ab270, and Restic ccd49b4→a8613b0.

Ignored key/password/dump-shaped material was inventoried by name/category without opening contents. Generated AGENTS additions and generated-file backups remain. Equivalence is not permission to discard files.

## LIKELY SAFE TO CLEAN LATER

Regenerable build/dependency output and reviewed duplicates may become candidates after evidence preservation, merged-PR and synchronized-main checks plus explicit authorization. **No branch/worktree receives unconditional safe-delete status today.** No cleanup occurred.


# PROPOSED TICKET BOARD

Created after the evidence investigation. This is a local board, not published GitHub issues. READY means scope is defined; implementation still awaits Phase 1 acceptance. No ticket independently authorizes push, merge, deployment or cleanup.

## Compact board

- **REVIEW:** KAUL-201 reconciliation; 202 reports; 203 document access; 204 test storage.
- **READY:** 205 upload diagnostics; 206 evidence/feedback; 207 Windows tooling; 210 signer display; 211 Client-cancel decision; 212 scanner timer.
- **BLOCKED:** 208 combined candidate gate; 209 upstream audit.
- **BACKLOG:** 213 preservation/cleanup preflight; 214 later operations.
- **IN PROGRESS / RED-TEAM REVIEW / CLOSED:** none. Final Red-Team has not started.

## KAUL-201 — Accept reconciliation

**PROBLEM / REASON:** local-only improvements and remote candidates were conflated.

**SCOPE:** accept/correct this report and board. **OUT OF SCOPE:** implementation/integration.

**RISK:** LOW, preservation-sensitive. **DEPENDENCIES:** none. **OWNER:** Astra.

**BRANCH / WORKTREE:** read-only shared repository and this external report.

**ACCEPTANCE CRITERIA:** exact candidates, preserved work and gates are understood.

**TEST / EVIDENCE REQUIREMENTS:** inventory, ancestry, diffs, GitHub, test deltas and claim classifications.

**STATUS:** REVIEW. **RED-TEAM REQUIRED:** NO.

**RESULT:** this report; no source changes.

## KAUL-202 — Accept report access and replacement fixes

**PROBLEM / REASON:** baseline read races and failed replacement retries.

**SCOPE:** review 7f038fb and its access/concurrency/SQL tests. **OUT OF SCOPE:** lifecycle redesign, schema edits, signed-original mutation.

**RISK:** CRITICAL. **DEPENDENCIES:** 201; final gate 208. **OWNER:** Sol; Terra independent review.

**BRANCH / WORKTREE:** Astra candidate and retained astra-report-integrity.

**ACCEPTANCE CRITERIA:** revoked access denied; archived signed history preserved; exactly one direct unsigned replacement reopened.

**TEST / EVIDENCE REQUIREMENTS:** exact-candidate disposable PostgreSQL revocation, concurrency and direct-SQL tests; affected browser workflow; final security review.

**STATUS:** REVIEW. **RED-TEAM REQUIRED:** YES.

**RESULT:** source review supports keeping the fix; acceptance pending.

## KAUL-203 — Accept Documents payload/download authorization

**PROBLEM / REASON:** access can change after preflight or during integrity I/O.

**SCOPE:** review 90f1eb3, handle closure, locking and audit outcomes. **OUT OF SCOPE:** upload/scanner speculation.

**RISK:** CRITICAL. **DEPENDENCIES:** 201, 204 for browser fixtures, final gate 208. **OWNER:** Sol; Terra independent review.

**BRANCH / WORKTREE:** Astra candidate and astra-document-read-access.

**ACCEPTANCE CRITERIA:** current access at release authorization; truthful success/denial/ambiguous audit behavior; handles closed on failure.

**TEST / EVIDENCE REQUIREMENTS:** deterministic access loss, actual lock waiter, audit failure and archived-admin download tests.

**STATUS:** REVIEW. **RED-TEAM REQUIRED:** YES.

**RESULT:** retain source fix; GitHub upload remains separate.

## KAUL-204 — Accept owned Documents test storage

**PROBLEM / REASON:** baseline recursive cleanup trusts ambient runtime storage.

**SCOPE:** review 8bb1c16, fixture/server agreement and retry lifecycle. **OUT OF SCOPE:** deleting retained directories or changing production storage.

**RISK:** CRITICAL filesystem safety. **DEPENDENCIES:** 201. **OWNER:** Luna; Terra safety review.

**BRANCH / WORKTREE:** Astra and astra-document-test-storage.

**ACCEPTANCE CRITERIA:** pre-existing/ambiguous paths preserved; only fresh owned root removed; security assertions unchanged.

**TEST / EVIDENCE REQUIREMENTS:** 16 ownership regressions plus guarded browser evidence on selected candidate.

**STATUS:** REVIEW. **RED-TEAM REQUIRED:** YES.

**RESULT:** fresh focused tests pass; GitHub environment proof pending.

## KAUL-205 — Diagnose GitHub Documents upload

**PROBLEM / REASON:** exact PR #44 repeatedly fails one upload workflow without failure-stage evidence.

**SCOPE:** diagnostic-only bounded HTTP status/application code and fictional trace/artifact capture; analyze root cause, then define a separately bounded fix if needed.

**OUT OF SCOPE:** scanner bypass, exposing internal paths/content/secrets, infrastructure change.

**RISK:** HIGH. **DEPENDENCIES:** 201; coordinate E2E/config with 204; remote execution needs later publication authorization.

**OWNER:** Sol; Luna may implement agreed artifact plumbing.

**BRANCH / WORKTREE:** future isolated checkout from accepted Astra candidate; none created now.

**ACCEPTANCE CRITERIA:** identify the failure stage and explain/reproduce runner difference; prove the same mode is fixed or keep root cause explicitly open.

**TEST / EVIDENCE REQUIREMENTS:** exact SHA, safe response mapping, retained GitHub artifacts and complete 44-case result; no local-pass substitution.

**STATUS:** READY. **RED-TEAM REQUIRED:** YES for disclosure/runtime boundary and final candidate.

**RESULT:** root cause unproven.

## KAUL-206 — Correct evidence status and retain report feedback

**PROBLEM / REASON:** current reports omit GitHub blocker; aggregate-limit feedback is a valid independent fix.

**SCOPE:** review cbc8664/42f9b50/27df04e; add precise current correction while retaining dated history.

**OUT OF SCOPE:** declaring milestone/release completion or relabeling old tests as fresh.

**RISK:** MEDIUM. **DEPENDENCIES:** 201, later 205 evidence. **OWNER:** Luna; Astra review.

**BRANCH / WORKTREE:** future isolated documentation/UI slice from accepted candidate.

**ACCEPTANCE CRITERIA:** distinct local/GitHub/manual evidence; current identities; Swedish feedback preserves values and clears stale errors.

**TEST / EVIDENCE REQUIREMENTS:** focused action/render checks and link/format/diff review; no database run for docs alone.

**STATUS:** READY. **RED-TEAM REQUIRED:** NO separately; combined gate 208.

**RESULT:** fresh feedback checks pass; status correction pending.

## KAUL-207 — Review Windows tooling and isolate harness failure

**PROBLEM / REASON:** cross-drive/LF fixes exist; full Windows operator success is unproven.

**SCOPE:** accept 22d316c/4695b53; separately reproduce Git-fixture timeout/Bash stall.

**OUT OF SCOPE:** global Git settings, historical checkout conversion, weakened assertions or unexplained timeout increases.

**RISK:** MEDIUM. **DEPENDENCIES:** 201. **OWNER:** Luna.

**BRANCH / WORKTREE:** retained snapshot worker/Astra; later isolated tooling correction if needed.

**ACCEPTANCE CRITERIA:** correct root/child vs external-path behavior, binary preservation and actionable Windows evidence.

**TEST / EVIDENCE REQUIREMENTS:** path matrix, checkout fixture and focused host reproduction; Linux reported separately.

**STATUS:** READY. **RED-TEAM REQUIRED:** NO.

**RESULT:** twelve fresh path cases pass; full harness open.

## KAUL-208 — Combined verification and fresh Astra Red-Team

**PROBLEM / REASON:** local fixes have not passed final combined acceptance.

**SCOPE:** freeze exact candidate, complete guarded DB/browser/CI evidence, dispatch a fresh separate Astra task acting solely as adversarial reviewer.

**OUT OF SCOPE:** merge/deploy/cleanup without later authorization.

**RISK:** CRITICAL. **DEPENDENCIES:** 202–206 and any material 207 change.

**OWNER:** Astra; fresh independent Astra Red-Team.

**BRANCH / WORKTREE:** accepted Astra descendant; PR #44 unchanged until authorized.

**ACCEPTANCE CRITERIA:** scoped defects resolved; security/migration boundaries accepted; GitHub Documents behavior established; audit status stays truthful.

**TEST / EVIDENCE REQUIREMENTS:** exact SHA, PostgreSQL access/immutability/concurrency, migration rehearsals as appropriate, real-scanner E2E, CI, independent Red-Team report.

**STATUS:** BLOCKED by review/CI tickets. **RED-TEAM REQUIRED:** YES.

**RESULT:** not launched; audit remains a separate release blocker even if controlled candidate validation is accepted.

## KAUL-209 — Wait for supported upstream audit remediation

**PROBLEM / REASON:** strict audit fails on Prisma/deepmerge-ts/mysql2.

**SCOPE:** track acceptable stable upstream remediation, then review compatibility/tree/lockfile and unchanged audit.

**OUT OF SCOPE:** suppression, override, downgrade, prerelease, forced install or ORM rewrite.

**RISK:** HIGH. **DEPENDENCIES:** supported upstream fix and approved dependency scope. **OWNER:** Sol; Astra gate owner.

**BRANCH / WORKTREE:** none until remediation exists.

**ACCEPTANCE CRITERIA:** unchanged audit passes on compatible reviewed dependencies.

**TEST / EVIDENCE REQUIREMENTS:** official upstream evidence, installed-source review where subtle, npm ls --all, audit/lockfile and regressions.

**STATUS:** BLOCKED. **RED-TEAM REQUIRED:** YES.

**RESULT:** fresh audit exit 1; WAIT FOR UPSTREAM. Blocks release, not controlled development.

## KAUL-210 — Display historical signer snapshot

**PROBLEM / REASON:** stored professional title/role omitted from signed detail.

**SCOPE:** display existing immutable signing-time data with safe missing-value fallback.

**OUT OF SCOPE:** rewriting signed rows or substituting current profile.

**RISK:** MEDIUM. **DEPENDENCIES:** 201, confirmed fallback copy. **OWNER:** Terra.

**BRANCH / WORKTREE:** future isolated UI slice, none created.

**ACCEPTANCE CRITERIA:** truthful historical identity and calm Swedish presentation.

**TEST / EVIDENCE REQUIREMENTS:** historical-vs-current profile regression; rendering/reflow/keyboard checks.

**STATUS:** READY. **RED-TEAM REQUIRED:** NO for presentation only; YES if signed-data scope changes.

**RESULT:** omission verified.

## KAUL-211 — Decide safe Client-edit cancellation

**PROBLEM / REASON:** Avbryt silently discards entered values.

**SCOPE:** confirm bounded dirty-cancel behavior and reuse established UX where suitable.

**OUT OF SCOPE:** generic form framework or speculative autosave.

**RISK:** LOW. **DEPENDENCIES:** 201 and owner product decision. **OWNER:** Terra.

**BRANCH / WORKTREE:** future isolated Client UI slice, none created.

**ACCEPTANCE CRITERIA:** dirty values protected, clean cancel simple, accessible focus/copy.

**TEST / EVIDENCE REQUIREMENTS:** dirty/clean cancellation and keyboard/dialog checks.

**STATUS:** READY for requirement decision, not assumed implementation authorization.

**RED-TEAM REQUIRED:** NO. **RESULT:** gap verified; no release blocker.

## KAUL-212 — Bound scanner connection-timer cleanup

**PROBLEM / REASON:** successful connect leaves an ordinary timeout pending.

**SCOPE:** reproduce lifetime and make minimal cleanup if warranted.

**OUT OF SCOPE:** claiming CI causality or changing clean/freshness/timeout protections.

**RISK:** HIGH implementation boundary; observed symptom LOW.

**DEPENDENCIES:** 201; coordinate scanner ownership with 205. **OWNER:** Sol.

**BRANCH / WORKTREE:** future isolated scanner slice, none created.

**ACCEPTANCE CRITERIA:** timers close on success/error/timeout; infected/unknown/stale results still fail closed.

**TEST / EVIDENCE REQUIREMENTS:** deterministic timer/socket tests; appropriate real-scanner validation.

**STATUS:** READY, lower priority than 205. **RED-TEAM REQUIRED:** YES.

**RESULT:** pending timer verified; CI causality unproven.

## KAUL-213 — Preserve and later assess cleanup

**PROBLEM / REASON:** unique local/ignored work coexists with duplicate patches.

**SCOPE:** preserve/categorize; later perform explicit per-target cleanup preflight.

**OUT OF SCOPE:** any deletion or stash discard now.

**RISK:** MEDIUM. **DEPENDENCIES:** preservation review, actual merged-PR/synced-main gates, explicit cleanup authorization.

**OWNER:** Luna; Astra disposition.

**BRANCH / WORKTREE:** all inventoried paths, read-only.

**ACCEPTANCE CRITERIA:** no unique work lost; exact PR/path/branch and prerequisites proved for each target.

**TEST / EVIDENCE REQUIREMENTS:** hashes/equivalence, ignored-work disposition and cleanup preflight.

**STATUS:** BACKLOG. **RED-TEAM REQUIRED:** NO; sensitive prototype disposition requires suitable independent review.

**RESULT:** no cleanup performed.

## KAUL-214 — Later attended operational acceptance

**PROBLEM / REASON:** CI cannot prove live storage/key/backup guarantees.

**SCOPE:** later plan Personnummer conversion/key recovery, private mount/scanner, exact PostgreSQL/object Restic restore, accessibility and owner acceptance.

**OUT OF SCOPE:** all Phase 1 live actions.

**RISK:** CRITICAL. **DEPENDENCIES:** 208, release/audit decisions, explicit deployment authorization and attendance.

**OWNER:** Astra; Sol technical preparation, Terra accessibility.

**BRANCH / WORKTREE:** none/live untouched; later exact approved SHA/image only.

**ACCEPTANCE CRITERIA:** proven permissions/UID/GID/mount/network controls, retained-key restore, attended migrations and accepted recovery/user workflows.

**TEST / EVIDENCE REQUIREMENTS:** operational evidence distinct from CI, exact digest and owner sign-off.

**STATUS:** BACKLOG. **RED-TEAM REQUIRED:** YES before activation.

**RESULT:** later gate, not a Phase 1 blocker.

# PROPOSED INTEGRATION STRATEGY

**Strategy B: retain Astra's existing linear branch as the next local candidate, accepting its already-separated slices through tickets.** PR #44 stays the unchanged published baseline until separately authorized.

Astra descends directly from the exact PR #44 head. Both source tracks are contained; changes are bounded and migrations/dependencies untouched. No finding warrants discarding the fixes or rebuilding them from a pre-integration branch.

Keep report feedback, both access fixes, direct replacement retry, test-storage safety and regressions. Keep snapshot/LF tooling in separate commits. Preserve reports but correct the omitted GitHub evidence. No aggregate squash, history rewrite, duplicate worker cherry-pick or automatic push.

If later review rejects a slice, add a focused correction or deliberately reconstruct a candidate from PR #44 while preserving current branches. Strategy A/C is a fallback for an actual defect or owner scope choice, not a response to a nonexistent aggregate implementation commit.

Sequence:

1. Accept reconciliation; complete access/storage reviews while Sol prepares safe CI diagnostics and Luna corrects evidence documentation. Coordinate E2E/config ownership.
2. With separate publication authorization, collect exact-candidate GitHub evidence, identify/fix upload failure and finish guarded combined validation. Keep audit visibly red until supported upstream remediation.
3. Freeze for a fresh separate Astra Red-Team, resolve findings, then seek the integration decision. Deployment/release/cleanup remain separate.

# BLOCKERS

- **Repository:** no ancestry/source-location blocker remains. Work is local-only and must stay preserved; implementation awaits reconciliation acceptance. Protected Git operations require explicit authorization.
- **CI:** repeated Documents upload failure, no proven cause/artifacts, no Astra GitHub run. Phase 1 intentionally prohibits publication; remote proof belongs to the next ticket stage.
- **Security acceptance:** access/storage changes require exact-candidate final validation and fresh Astra Red-Team. Current source review is not that gate.
- **Dependency/audit:** unchanged audit exits 1. WAIT FOR UPSTREAM; M7/release blocked, ordinary controlled development allowed.
- **Windows evidence:** full operator harness unresolved; limits Windows tooling claims, not ancestry reconstruction.
- **Later operations:** mounts/scanner, key custody/recovery, attended conversion/migration, combined Restic restore, human accessibility and owner approval. Not performed and not Phase 1 blockers.

# RECOMMENDATION

Kaul has a stable main baseline, three open Draft candidates, and a local-only Astra descendant with useful fixes in separate commits. Source relationships are established; remaining defects/evidence gaps are bounded tickets.

Use Astra as the next **local** candidate; retain PR #44 as published baseline and preserve Product/Documents sources. Keep fixes pending scoped acceptance; correct evidence docs, keep tooling separate, and defer smaller UX/scanner work behind upload diagnostics. Never treat 27df04e alone as the implementation or as GitHub-tested.

First focus: **202/203/204 reviews**, **205 safe GitHub diagnostics**, **206 evidence correction**. Sol owns runtime/security/CI; Terra independent security/product review; Luna test tooling/documentation; Astra coordinates. Access/storage, scanner changes, diagnostic disclosure and final combined candidate need fresh Astra Red-Team; none was launched now.

Shortest safe path: accept reconciliation, prove Documents on the selected exact GitHub candidate, complete combined validation and independent review. Release, deployment and cleanup remain unapproved.

RECONCILIATION COMPLETE — READY FOR TICKET EXECUTION
