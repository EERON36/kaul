---
name: reviewed-slice-handoff
description: Preserve final-review coverage while moving a reviewed Kaul editing worktree from “Ready to stage” through an approved branch, staging, commit, push, pull request, and optional CI watch. Use only when a human has completed meaningful final review; keep every branch, commit, push, PR, and merge decision explicit.
---

# Reviewed slice handoff

Start only after a human says the complete current working-tree diff is ready
to stage. Record and show the reviewed `HEAD`, `git status --short`, complete
diff, and diff stat. Capture a review snapshot at an operator-chosen path
outside the repository; the file must not already exist:

```text
npm run review:snapshot -- capture --output <external-snapshot-file>
```

The snapshot binds the reviewed `HEAD`, complete tracked diff hash, sorted
untracked non-ignored path set, and content hash for every untracked regular
file or symbolic link. It enumerates nested paths with Git's NUL-delimited
output and never logs file contents. Ignored paths are not included or staged.

Proceed through these gates in order:

1. Obtain an explicit feature branch name. Check `git branch --show-current`.
   If the worktree is detached, create exactly the approved branch with
   `git switch -c <branch>`. If it is already on a different branch, stop.
2. Immediately before staging, rerun the displayed status and diff checks, then
   verify the exact snapshot:

   ```text
   npm run review:snapshot -- verify --snapshot <external-snapshot-file>
   ```

   If either check differs, stop: the previous review no longer covers the
   complete current diff. Stage only the reviewed paths after explicit “Ready
   to stage” approval.

3. Run `git diff --cached --check`, prove `git diff --stat` is empty, then show
   `git diff --cached --stat` and `git status --short --branch`. Any remaining
   unstaged change invalidates the handoff and requires review.
4. Obtain an explicit commit message, show the staged state, and commit exactly
   that content. Never invent or amend a message silently.
5. Push only after explicit approval. Create a PR only from an
   operator-supplied title and body. Optionally watch CI when requested.

Never merge automatically. Keep product, domain, schema, legal, security, and
meaningful review decisions with the human operator.
