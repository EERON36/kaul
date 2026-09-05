# KAUL-213 preservation disposition

Date: 5 September 2026. Scope: classify retained work and dependencies for the
active unified candidate. This records preservation decisions only. No branch,
worktree, remote, ignored file, database, service, or homelab cleanup occurred.

## Candidate provenance

The active candidate is `codex/unified-candidate-20260905` in
`C:/Projects/kaul/.codex-worktrees/unified-candidate-20260905`. Its published
Draft PR #46 ancestry contains Astra's eight local commits, in order:

`cbc8664`, `22d316c`, `42f9b50`, `8bb1c16`, `4695b53`, `7f038fb`, `90f1eb3`,
and `27df04e`.

These are retained as the candidate's separated history. The six worker
alternatives below are patch-equivalent copies and must not be replayed.

The new execution work is also represented in the candidate ancestry:

- KAUL-211: `3f8d847` equals `d5d8339`; `2f6be7b` equals `ab933fe`.
- KAUL-210: `a08ff2d` equals `2d3c0a8`.
- KAUL-212: `c8aeb0b` equals `5b05c2d`.
- KAUL-205: `de079f5` is integrated as `a360a7d`; the latter contains the
  accepted integration correction, so it is a derivative rather than an
  identical patch.

The narrow KAUL-207 commit `13fced9` bounds only the real-Git Windows snapshot
fixture and passed all 13 cases. The unfinished broader Windows operator
timeout proposal remains preserved in its isolated worktree and is not
accepted into the candidate. Full Windows shell-harness reliability remains
unproven.

The one-off diagnostic `09b33d0` and correction `0e62b6b` belong only to the original PR #45 diagnostic
baseline branch. Neither is an ancestor of the active candidate; they remain a
separately preserved investigation; it must not be treated as integrated candidate
work.

## Preserved alternatives and local work

The six accepted worker equivalences are:

- `cbc8664` ↔ `c7879a0` (feedback)
- `22d316c` ↔ `e6924fa` (review-snapshot paths)
- `42f9b50` ↔ `5517419` (project status)
- `8bb1c16` ↔ `02b06c0` (owned test storage)
- `7f038fb` ↔ `31b3cec` (report access and replacement retry)
- `90f1eb3` ↔ `7b0e73c` (Document read/download authorization)

The four Journal-history commits remain preserved as patch-equivalent
alternatives: `fd90d37` ↔ `9b47cac`, `4127b94` ↔ `ec4cf7a`, `09916c4` ↔
`c866b9c`, and `0473877` ↔ `73ab270`. The UI alternative
`874be11` ↔ `ccffd04` and Restic alternative `ccd49b4` ↔ `a8613b0` also remain
preserved. Their retention records alternate history and scope; they are not
missed dependencies of the active candidate.

The 20 commits identified as local-only at the accepted reconciliation are classified as eight candidate commits,
four Journal-history alternatives, one UI alternative, six worker alternatives,
and one Restic alternative. No unique work is inferred to be disposable from
patch equivalence alone.

The following material remains preserved for later per-target review: dirty
Product/Documents `AGENTS.md` files, the owner-attended deployment guide, the
four Gate C scripts, the eight-file Youth experiment, the standalone validation
clone, unique visual concepts, ignored logs and source exports, generated-file
backups, and application safety references. Ignored key-, password-, and dump-
shaped payloads were not opened.

## Cleanup status and gates

Classification is complete; physical cleanup is blocked. PRs #41, #43, #44,
and #46 remain unmerged, and `main` remains unchanged. No branch or worktree
may be deleted until the candidate is stable, the relevant pull request is
verified merged, `main` is synchronized, the exact target is proven to have no
unpreserved work, and explicit per-target cleanup authorization exists.

This document does not declare release readiness, deployment readiness, or
approval of any later cleanup. It is the preservation handoff for future
cleanup preflight.

## Final readiness provenance

The minimal CI readiness fix `3ce63cc` is integrated as `dc29c03` in PR #46
and independently applied as `0e41352` to PR #45 for paired before-and-after
proof. Both runs pass all 44 browsers; the unified branch contains neither
large one-off service-probe commit. There is no unresolved diagnostic-branch
dependency. The final source is preserved remotely in PR #46; subsequent
handoff changes only update documentation. Existing worker branches and
historical worktrees remain retained.

## Whole-candidate hardening provenance

Reviewed worker commits are integrated without deleting their branches or
worktrees:

- KAUL-216: d052392 -> 2721891, tests only.
- KAUL-217: e737676 -> 5e6f399, raw authentication mutation policy/tests.
- KAUL-218: 435bc22 -> 54b1696, scanner ceiling/tests.
- KAUL-219: 49537bf -> f880e2c, settled report signing recovery/tests.
- KAUL-220: c542076 -> 5968550, exact release validation/current audit gate.
- KAUL-221: 100a253 -> 9f0d9a8, scanner/readiness/private startup.

The fresh registered-worktree status inventory found the same material
historical owner guide, Gate C scratch scripts, deferred Windows harness and
Youth experiment. They remain preserved; no new missed candidate dependency
was established. The owner guide is useful historical procedure but its PR43,
SHA, migration-count and snapshot values are not current live evidence.
Main/Pilot refs remain as recorded above. KAUL-222's reviewed work is now
preserved in the worker and integration commits recorded below. No worktree,
branch, stash, database, volume or live resource was cleaned up.

KAUL-222 operator worker `4c63452` is retained on
`codex/kaul-222-document-backup-set-20260905`; candidate integration `c778ad1`
preserves the union of KAUL-221/222 operation locks after two reviewed conflicts.
The rehearsal worker `08c165f` is retained on
`codex/kaul-222-backup-rehearsal-20260905`, integrated without conflict as
`91a6352`. Both worker worktrees remain present. No historical work was reset,
removed, unstaged, stashed, or replaced by this integration.
Reviewed KAUL-222 validation corrections are also preserved: operator worker
`a5715e8` integrated as `ddce48d`, rehearsal worker `c200c0e` as `0173710`.
Neither correction changes application modules, dependencies, migrations or the
production network. The failed run 33962083930 remains dated evidence; successful
run 33962467276 supersedes it for final candidate validation.