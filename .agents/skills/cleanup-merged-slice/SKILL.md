---
name: cleanup-merged-slice
description: Safely verify a retired Kaul worktree, report manual Git prune impact, and clean its proven local feature branch after a pull request is merged. Use only with an explicit PR number, retired worktree path, and expected feature branch; never use for filesystem, orphan, database, remote-branch, or conversation deletion.
---

# Cleanup merged slice

Treat this as separate post-merge maintenance. Require explicit operator
authorization, a PR number, exact worktree path, and exact expected branch.
Run both commands from the clean Kaul worktree on `main`.

1. Before the worktree is retired, run:

   ```text
   npm run cleanup:merged-slice -- preflight --pr <number> --worktree <path> --branch <name>
   ```

   The command can safely fast-forward clean local `main`, but it does not
   remove a worktree or branch. It verifies the GitHub repository and merged
   PR, exact worktree and branch identity, conflicts, tracked and untracked
   changes, ignored content, and relevant stashes. If it reports a blocker,
   stop and seek human review.

2. Archive the finished Codex task manually. Let Codex retire the physical
   worktree only after the operator has reviewed anything the preflight found.
   Never use `git clean`, `git reset --hard`, or manual broad deletion to make
   a worktree appear safe.

3. When `git worktree list --porcelain` shows that exact path as `prunable`,
   run:

   ```text
   npm run cleanup:merged-slice -- prune --pr <number> --worktree <path> --branch <name>
   ```

   This run reports every registration that the repository-wide Git prune
   would affect. If more than the intended registration is prunable, stop and
   review every reported path. The helper never runs `git worktree prune` and
   never deletes a filesystem path.

4. When the helper reports only the intended registration, the operator may
   explicitly run `git worktree prune -v`. This is a human-controlled,
   repository-wide Git operation; it is not an exact-target prune.

5. Rerun the command from step 3. Only after it proves the intended
   registration is absent does it revalidate repository identity, the merged
   PR, `main`, exact branch SHA, and current worktree ownership immediately
   before compare-and-delete of the local branch. It then fetches remote-pruning
   information and reports final state.

Ignored files—including `node_modules`, `.next`, test output, `.env`, and
notes—block preflight because an ignore rule does not prove data is disposable.
The operator must review and preserve valuable ignored content before asking
Codex to retire the worktree. The helper does not implement an allowlist.

Never drop stashes, delete remote branches or test databases, remove Docker
resources, or automatically archive or merge a Codex task or PR.
