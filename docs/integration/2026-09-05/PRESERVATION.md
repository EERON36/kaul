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

The next diagnostic `09b33d0` belongs only to the original PR #45 diagnostic
baseline branch. It is not an ancestor of the active candidate and remains a
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
