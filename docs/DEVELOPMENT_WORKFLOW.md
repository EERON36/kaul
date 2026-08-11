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
→ post-merge preflight
→ archive task thread manually
→ Codex retires physical worktree
→ helper reports global Git prune impact
→ operator runs repository-wide Git prune explicitly
→ helper verifies absence and cleans the proven local branch
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
be deliberate. Use the repository-local `cleanup-merged-slice` Skill with an
explicit PR number, worktree path, and expected feature branch.

First run its `preflight` command while the finished worktree still exists. It
checks the worktree is clean, including ignored content that might be valuable.
If it reports a blocker, stop. Do not bypass it with reset, clean,
force-removal, or stash deletion.

After preflight, archive the finished Codex task manually. Codex may then
retire its physical worktree. The helper never deletes that directory. Once
Git shows the exact worktree registration as `prunable`, run the `prune`
command. It reports the current repository-wide prune impact and refuses when
another prunable registration makes that impact ambiguous. It never runs
`git worktree prune` automatically.

If only the intended registration is prunable, the operator explicitly runs
`git worktree prune -v`, understanding that Git prune is repository-wide, then
reruns the helper. The helper must prove the intended registration is absent
and immediately revalidate repository, PR, branch SHA, and worktree ownership
before deleting the unchanged proven local branch.

## Review policy

Normal changes receive one meaningful review. Security-sensitive changes also
receive a dedicated security review. Review the working-tree diff before
staging; do not reread an identical staged diff after that complete review.
The reviewed identity includes the contents of every untracked non-ignored
file, not only its path. Use `npm run review:snapshot` through the
`reviewed-slice-handoff` Skill to capture and verify deterministic hashes
without logging file contents.

Staging is a mechanical validation step:

```powershell
git diff --cached --check
git diff --stat
git diff --cached --stat
```

If `git diff --stat` is empty after staging and the pre-staging review snapshot
matched, the staged content matches the reviewed working tree. Review again
only when a correction materially changes the reviewed security or architecture
boundary.

Use the repository-local `reviewed-slice-handoff` Skill after the human final
review. It handles detached Codex worktrees, requires explicit branch, commit,
push, and PR inputs, and stops when the reviewed diff changes. It never merges.

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

The repository-local `verify-slice` Skill applies the risk classes above. It
reuses the existing database lifecycle commands and never chooses test IDs,
ports, or abandoned-database cleanup on the operator's behalf.

## Parallel database work

Only one task may own a Prisma migration at a time unless owners explicitly
coordinate. PostgreSQL remains one shared service, but database-writing and
browser verification may run concurrently when every task first validates its
explicit `KAUL_TEST_ID` and `KAUL_TEST_PORT` with `npm run test:db:check`.

Each task database is `kaul_test_<validated-id>`, never `kaul`. Use
`test:db:create`, `test:db:migrate`, and explicit `test:db:drop` for that
task only. Do not stop the shared Compose service, select another port, kill a
process, or clean up unknown task databases. `test:db:list` is diagnostic and
read-only.

For a task named `logout` on port `3111`, set both database URL variables to
the same fictional local URL ending in `kaul_test_logout`, set
`BETTER_AUTH_URL` to `http://127.0.0.1:3111`, then run `test:db:check` before
creating or using the database. The validator rejects partial or mismatched
configuration.

## Automation boundary

Repository-local Skills now cover risk-aware verification, reviewed-slice
handoff, and fail-closed post-merge cleanup. The helpers are available as:

```text
npm run cleanup:merged-slice -- preflight --pr <number> --worktree <path> --branch <name>
npm run cleanup:merged-slice -- prune --pr <number> --worktree <path> --branch <name>
npm run review:snapshot -- <capture --output|verify --snapshot> <external-snapshot-file>
```

The cleanup preflight can safely fast-forward clean local `main`, but does not
remove a worktree or branch. The first post-retirement `prune` run reports the
global Git prune impact. After the operator explicitly runs `git worktree
prune -v`, a second run proves the intended registration is absent before
local branch cleanup. Neither helper removes filesystem paths or includes
ignored files in reviewed staging.

`start-slice` remains Codex-native. A separate wrapper would only duplicate
worktree creation; start by reading the project rules, classifying risk,
checking dependency and Git state, and obtaining explicit test IDs and ports
when database or browser evidence will be required.

Human approval remains required for meaningful final review,
security-sensitive merge decisions, product and domain decisions, and schema or
legal semantics.
