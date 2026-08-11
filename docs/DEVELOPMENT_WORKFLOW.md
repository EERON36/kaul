# Kaul Development Workflow

## Purpose

This document is the authoritative process for delivering a coherent Kaul
slice. It complements `AGENTS.md`: that file contains repository rules and
safety constraints; this file describes the normal delivery lifecycle.

Use the smallest secure workflow that fits the risk. The operator selects an
appropriate current model and reasoning strength; this workflow does not depend
on particular model names.

## Risk classification

Classify work before editing. Raise the level when the change crosses a more
sensitive boundary.

### LOW

Examples: mechanical edits, documentation, and formatting.

Use the smallest relevant verification, such as formatting and `git diff
--check`.

### MEDIUM

Examples: normal product and user-interface behaviour.

Write a concise plan, implement one coherent change, and complete a focused
review and relevant tests.

### HIGH

Examples: domain rules, database behaviour, access-sensitive client workflows,
or transactions.

Write an explicit plan covering rules, data, tests, documentation, risks, and
open issues. Obtain PostgreSQL integration evidence where appropriate.

### CRITICAL / SECURITY-SENSITIVE

Examples: authentication, authorisation, audit, signing, immutable records,
credentials, sessions, exports, and compatibility-sensitive changes.

Use the HIGH workflow plus a focused security review. Prove third-party
compatibility or pass a design gate when the change depends on it. Do not merge
on the basis of compilation or generated types alone.

## Threads and ownership

Kaul uses one Codex project. Create one task thread for each coherent slice or
epic; start a new thread after that slice has merged rather than extending one
conversation indefinitely.

Read-only planners may work from `main`. Agents that edit files use isolated
worktrees. For parallel work, keep lanes to roughly three or four active tasks,
with distinct domain and file ownership. Coordinate before work overlaps.

## Worktree lifecycle

```text
task thread
→ isolated worktree
→ implementation
→ verification
→ review
→ named feature branch (when the Codex worktree began detached)
→ mechanical staging validation
→ commit and push
→ pull request and CI
→ squash merge
→ separate post-merge cleanup
→ archive task thread
```

A feature agent does **not** delete its worktree before the pull request has
merged. If the worktree began on detached `HEAD`, create a real feature branch
after review and before committing. A branch name must describe the coherent
slice, not the temporary task identifier.

Post-merge cleanup is separate from delivery. Before removing the worktree or
local branch, verify all of the following:

1. The pull request is `MERGED`.
2. Local `main` is synced with the merged result.
3. The worktree has no unpreserved changes.
4. A retained safety stash is no longer needed.

GitHub automatically deletes merged remote branches. Local cleanup must still
be deliberate. A dedicated maintenance task or reusable workflow may perform
this cleanup in the future.

## Review policy

Normal changes receive one meaningful review. Security-sensitive changes also
receive a dedicated security review. Review the working-tree diff before
staging; do not reread an identical staged diff after that complete review.

Staging is a mechanical validation step:

```powershell
git diff --cached --check
git diff --stat
git diff --cached --stat
```

If `git diff --stat` is empty after staging, the staged content matches the
reviewed working tree. Review again only when a correction materially changes
the reviewed security or architecture boundary.

## Verification policy

During development, run the smallest meaningful focused test. Before a pull
request, run broader verification appropriate to the risk. GitHub Actions is
the independent final gate; it does not replace local reasoning or review.

Use the repository commands documented in `package.json` and follow the
database-safety rules in `AGENTS.md`. Do not point local database-writing tests
or Playwright setup at the normal `kaul` database.

When parallel branches overlap:

1. Update or merge the second branch onto current `main`.
2. Resolve only genuine conflicts.
3. Rerun verification appropriate to the overlapping surface.

Do not blindly rerun every suite when a focused set proves the shared boundary;
do not under-test a shared security, database, or route change.

## Parallel database work

Only one task may own a Prisma migration at a time unless owners explicitly
coordinate. Until isolated parallel-test infrastructure exists, PostgreSQL and
Playwright resources are shared and must be serialised.

After that infrastructure lands, each task may use its own validated test
database identifier and Playwright port. Validation must prove that each task
uses its assigned disposable resources before database-writing or browser tests
begin.

## Future automation boundary

The following are candidates for later automation, not current capabilities:

- Codex-native worktree creation.
- Per-task test environments.
- Verification scripts.
- Post-merge Git and worktree cleanup.

Potential reusable workflows are `start-slice`, `verify-slice`, and
`cleanup-merged-slice`.

Human approval remains required for meaningful final review,
security-sensitive merge decisions, product and domain decisions, and schema or
legal semantics.
