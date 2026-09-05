# KAUL-220 — Release validation implementation evidence

Status: Implemented and self-checked; independent security review pending.
Risk: CRITICAL / SECURITY-SENSITIVE. Priority: P1 release false-green.
Base: `63ba72a1d5eacc24c3cb619cc570f1d8b72c6f05`.

## Correction

The release workflow previously required only a version-shaped tag whose
commit was an ancestor of `main`. It could proceed to GHCR login/publication
without a successful exact-source Validate run or a fresh mandatory audit.

The existing ancestry rule remains. Before registry use, the workflow now
requires the trusted exact-source full Validate attempt, installs the locked
dependencies, and runs the unchanged `npm run audit:ci`. It adds only read
permission for Actions metadata; no new publication trigger or credential is
introduced.

`scripts/require-release-validation.mjs` uses GitHub's fixed API origin and
workflow identity, checks exact SHA and same-repository IDs, permits only a
`push` on `main`, chooses the newest matching run without falling back to older
green evidence, and requires completed-success for all four expected jobs in
that run attempt. It rechecks the run after job inspection to reject a newly
started attempt. Missing, incomplete, malformed, red, skipped, wrong-source or
untrusted evidence fails closed, as do transport and API failures. Requests
reject redirects, use bounded timeouts, and never emit token or API bodies.
More than 100 matching runs is treated as incomplete evidence and rejected.

A successful PR result alone is insufficient. A partial job rerun cannot
supply a full attempt; rerun all jobs. The trusted release commit remains an
ancestor of main and need not be the latest main commit. These checks apply to
the updated release workflow; they do not retroactively change workflows stored
in historical Git commits or replace owner-controlled release authorization.

## Evidence

- New deterministic gate and workflow-order tests: 42 passed.
- Gate, release image contracts and unchanged audit-policy tests: 53 passed
  across three files.
- Full typecheck, focused ESLint and Prettier, and `git diff --check`: passed.
- Verified no diff in Validate, package.json, package-lock.json, audit executor
  or audit policy. The new test is included by the existing Vitest script glob.
- Read-only GitHub API checks confirmed the registered workflow ID/path and
  actual job-attempt response fields, including all four integrated-candidate
  job names and the existing failed validation job. No workflow was started.

Tests cover absent/pending/failed/cancelled/skipped runs, wrong SHA, PR/fork or
wrong-repository evidence, wrong workflow identity, newer red results, missing
or duplicate jobs, partial attempts, a changed attempt during inspection,
failures at every API call, malformed responses and invalid release context.
Workflow contracts require both gates and locked installation before registry
login/publication, with no conditional or continue-on-error bypass on those
steps. Existing image operator dependency and strict audit regressions pass.

GitHub API contracts were checked against the official documentation:

- [Workflow runs](https://docs.github.com/en/rest/actions/workflow-runs)
- [Workflow job attempts](https://docs.github.com/en/rest/actions/workflow-jobs)

## Limits and remaining gates

The deterministic API tests use fictional responses and make no network
requests. Read-only API shape verification is separate from executing the
release workflow with its GitHub token. GitHub validation of the final candidate
and independent security review remain required. No tag, registry login,
publication, deployment, database, service, secret operation or dependency
change occurred. The unchanged mandatory audit remains an independent blocker;
a release may proceed only after it actually passes without a bypass.