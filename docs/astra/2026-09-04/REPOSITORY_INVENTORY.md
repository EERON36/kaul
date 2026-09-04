# Repository preservation inventory

Initial read-only inventory for the 4 September 2026 health pass. All original
worktrees, branches, uncommitted work, ignored files, and safety references were
preserved. None was reset, rebased, deleted, cleaned, or fast-forwarded.

## Baseline and relationships

- Primary checkout: `C:/Projects/kaul`, `main`,
  `a93c863cd906b3e25157c1d04a3529fb2ed7db67`.
- Most integrated candidate: `C:/Projects/kaul-product-integration`,
  `codex/product-integration`, `82bf2987189a029516b7e6221f600af931827522`.
- Initially 18 registered worktrees, 22 local branches, 11 live remote branch
  heads, 154 reachable commits across all references. Main has 44 reachable
  commits; product integration has 124 and contains main plus 80 commits.
- Live remote branch SHAs matched cached refs. No fetch or remote mutation was
  needed. Local Pilot is two commits behind its remote. No ordinary stashes,
  tags, GitHub releases, or issues were found. Safety refs still preserve stash
  objects despite the empty ordinary stash list.
- No post-main feature tip is integrated into main. An ancestor of product
  integration is therefore not automatically a cleanup candidate.

## Registered worktrees

Paths beginning with `.codex-worktrees/` are relative to `C:/Projects/kaul`.
"Ancestor" below means committed work is present in product integration
`82bf298`, not that its release or main merge is approved.

1. **Primary `C:/Projects/kaul`** — `main` at `a93c863`. No tracked edits;
   untracked `.codex-worktrees/` contains the preserved nested checkouts. An
   ignored `.env` exists; its contents were not read.
2. **`.codex-worktrees/client-journal-monthly-product`** —
   `codex/client-journal-monthly-reports`, `406aa75`, ancestor. Preserve unique
   untracked `deploy/pilot/OWNER_ATTENDED_PRODUCT_PERSONNUMMER_DEPLOYMENT.md`.
3. **`.codex-worktrees/client-journal-monthly-ui`** —
   `codex/client-journal-monthly-ui`, `874be11`, clean. Exact tree and patch
   equivalent to integrated `ccffd04` (`git range-diff` reports equality).
   Superseded implementation, retained until cleanup gates are met.
4. **`.codex-worktrees/gate-c-rollback`** — `codex/fix-gate-c-rollback`,
   `4a25c4e`, ancestor. Preserve four untracked scripts:
   `.codex-local-gate-c-rehearsal.sh`, `.codex-local-gate-c-repeat.sh`,
   `.codex-local-gate-c-runtime.sh`, `.codex-local-gate-c-storage.sh`.
5. **`.codex-worktrees/gate-c-sequencing`** —
   `codex/fix-gate-c-sequencing`, `03dee29`, clean ancestor; retained.
6. **`.codex-worktrees/gate-c-transient-probe`** —
   `codex/fix-gate-c-transient-probe`, `764bf9e`, clean ancestor. PR #42 merged
   into Pilot, not main; remote branch absent. Retained.
7. **`.codex-worktrees/homelab-infrastructure-prep`** —
   `codex/homelab-infrastructure-preparation`, `1febb5c`, clean ancestor;
   retained. No infrastructure was accessed.
8. **`.codex-worktrees/journal-history`** —
   `codex/fix-journal-history-race`, `0473877`, clean. Four commits have
   different IDs but equivalent integrated patches: `fd90d37` → `9b47cac`,
   `4127b94` → `ec4cf7a`, `09916c4` → `c866b9c`, `0473877` → `73ab270`.
   Retained with provenance.
9. **`.codex-worktrees/klienter-child-navigation`** —
   `codex/klienter-child-navigation`, `a631d8e`, clean ancestor and current
   remote Pilot tip; retained.
10. **`.codex-worktrees/pristine-first-migration`** —
    `codex/allow-pristine-first-migration`, `45976e4`, clean ancestor; retained.
11. **`.codex-worktrees/restic-parser-correction`** —
    `codex/fix-rest-server-trailing-blank`, `ccd49b4`, clean. Its distinct tip
    patch is equivalent to integrated `a8613b0`; retained.
12. **`.codex-worktrees/visual-concepts-20260901`** —
    `codex/kaul-visual-concepts-20260901`, `d0844e3`, clean and pushed. Unique
    mock-only work: three HTML directions and six screenshots, ten files.
    Intentionally separate; no selected design or production integration.
13. **`.codex-worktrees/vuxna-ungdomar-primary-choices`** —
    `codex/vuxna-ungdomar-primary-choices`, `d20e453`, clean ancestor; retained.
14. **`C:/Projects/kaul-client-documents`** — `codex/client-documents`,
    `d22fe0b`, ancestor. Existing modified `AGENTS.md` contains Next-generated
    guidance; retained exactly.
15. **`C:/Projects/kaul-product-integration`** — `codex/product-integration`,
    `82bf298`, aggregate baseline. Existing modified `AGENTS.md` contains the
    same Next-generated guidance; retained exactly.
16. **`C:/Users/EERON/.codex/worktrees/3a8d/kaul`** —
    `codex/vuxna-ungdomar-ui`, `c42c643`, ancestor with five tracked changes and
    three untracked files. Six source/unit files match integrated `d20e453`
    exactly. Two E2E files are earlier versions without later label, waiting,
    and Youth-navigation refinements. Existing edits are still preserved;
    equivalence is not permission to discard them.
17. **`C:/Users/EERON/.codex/worktrees/b32f/kaul`** — detached `c42c643`, clean
    ancestor; retained pending main/PR cleanup gates.
18. **`C:/Users/EERON/.codex/worktrees/pilot-release-candidate/kaul`** —
    `pilot/release-candidate`, `d20e453`, clean ancestor, two commits behind
    remote `a631d8e`. Intentionally not advanced.

## Branches without registered worktrees

All five are ancestors of `82bf298`, absent from main, and retained:

- `codex/fix-rest-server-version-parser` — `80a8508`.
- `feat/pilot-accessibility` — `e6adc5a`.
- `feat/pilot-deployment-foundation` — `0e45a4b`.
- `feat/pilot-orientation` — `6c28a6a`.
- `feat/pilot-product-hardening` — `f279800`.

## Standalone validation clone and ignored work

`C:/Projects/kaul/.codex-worktrees/client-journal-monthly-validation` is a
standalone local clone with its own `.git`, detached at `eb1b11f`; its origin
is the local Kaul repository. Tracked/untracked state is clean, with no stash.
All its refs/commits are preserved in the parent repository. It has ignored
browser artifacts in addition to build/generated output. Its metadata needed
command-local `safe.directory` because its owner is `CodexSandboxOffline`;
no global Git configuration was changed.

Ignored names across the worktrees include operator test fixtures, logs,
database dumps, backup fixtures, and key/password-shaped filenames. Contents
were not opened merely for cleanup. Generated/dependency output was excluded
from detailed name enumeration. Ambiguous ignored data is retained.

## Safety and application references

Keep all three `refs/safety/consolidation-20260822/login-audit-compatibility/`
references. Each retains an old untracked authentication integration-test
prototype through its third parent:

- `2f68dbe-first` → `05c64855af31fc268c647e7b25a056d5e37631da`.
- `2f68dbe-second` → `b01a764d602b0d2e5cdde1971bec262f555a31a1`.
- `c9d5ebd` → `09d4a54ab518b479038f8184481bb3d585ae22b5`.

Thirty `refs/codex/snapshots` were classified as existing main/product ancestry
or patch-equivalent historical squash inputs. Twelve turn-diff refs resolve to
eight different trees: five main-plus-nested-gitlink trees, one exact Gate C
tree, one Documents-plus-existing-AGENTS tree, and one tree exactly matching
the retained dirty `3a8d` experiment. No additional unpreserved experiment was
found. Application-owned references remain untouched.

## Remote reconciliation

- [PR #41](https://github.com/EERON36/kaul/pull/41): OPEN, Draft, Pilot `a631d8e`
  to main. Preserved without merge or update.
- [PR #43](https://github.com/EERON36/kaul/pull/43): OPEN, Draft, product
  `406aa75` to main. Its work is contained in product integration; PR retained.
- [PR #44](https://github.com/EERON36/kaul/pull/44): OPEN, Draft, integration
  `82bf298` to main. Baseline for this local pass; remote untouched.
- [PR #42](https://github.com/EERON36/kaul/pull/42): MERGED into Pilot on
  30 August. This does not satisfy main synchronization/cleanup gates.
- [PR #15](https://github.com/EERON36/kaul/pull/15): OPEN, remote-only
  `dependabot/npm_and_yarn/npm_and_yarn-6b7f7a8c69`, `ec6fe42`. Its direct
  PostCSS bump to 8.5.23 is semantically superseded by product's direct
  8.5.26; nested Next PostCSS is already 8.5.23. No remote closure or deletion.

The other live remote refs match corresponding local tips, apart from the
documented local Pilot lag. No safe historical branch/worktree deletion was
established under the project's merged-PR, synced-main, and preserved-content
requirements. New worktrees and commits from this pass are recorded separately
in the final report.

## Final preservation verification and Astra worktrees

Rechecked on 5 September at source checkpoint `90f1eb3`: **25 registered
worktrees, 29 local branches, 167 reachable commits** before final report
commits. The seven added worktrees account for the increase from the original
18 worktrees and 22 branches. Documentation commits can advance these counts.

Every original worktree HEAD and tracked/untracked status still matches the
initial inventory. The eight dirty `3a8d` file contents still match their
retained historical snapshot, and both pre-existing Next-generated AGENTS
changes remain identical to their snapshot. Original untracked operator
scripts and the owner-attended deployment document remain present. The
standalone validation clone remains clean and detached at `eb1b11f`.

A final read-only remote refresh confirmed all 11 remote branch heads and the
listed PR states unchanged. Main remains `a93c863`; local Pilot remains
`d20e453`, remote Pilot `a631d8e`. All 30 application snapshots, 12 turn-diff
references and three safety references remain. No preservation loss was found.

New paths below are relative to `C:/Projects/kaul/.codex-worktrees/`:

- **`astra-project-health-20260904`** —
  `codex/astra-project-health-20260904`; integrated source checkpoint `90f1eb3`.
  Final audit documentation is committed afterward on this same branch.
- **`astra-project-status`** — `codex/docs-project-status-20260904`, `5517419`;
  clean; integrated as `42f9b50`.
- **`astra-report-feedback`** — `codex/fix-monthly-report-feedback-20260904`,
  `c7879a0`; clean; integrated as `cbc8664`.
- **`astra-review-snapshot`** — `codex/fix-review-snapshot-paths-20260904`,
  `e6924fa`; clean; integrated as `22d316c`.
- **`astra-document-test-storage`** —
  `codex/fix-document-test-storage-20260904`, `02b06c0`; clean; integrated as
  `8bb1c16`.
- **`astra-report-integrity`** — `codex/fix-monthly-report-integrity-20260904`,
  `31b3cec`; clean; integrated as `7f038fb`.
- **`astra-document-read-access`** —
  `codex/fix-document-read-access-20260904`, `7b0e73c`; clean; integrated as
  `90f1eb3`.

The line-ending policy change `4695b53` was implemented directly on the
integration branch. All six worker branches are preserved with clean commits
and reviewed integrated equivalents. Their PR/main cleanup conditions have
not been met, so none is removed. Task-owned ignored dependencies, logs and
validation artifacts are retained; they are not additional product changes.
