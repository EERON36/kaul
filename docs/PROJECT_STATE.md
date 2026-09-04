# Kaul Project State

Repository review: 4 September 2026. No live infrastructure was accessed for
this review. Branch and pull-request positions below are a dated snapshot;
recheck them before integration or release decisions.

[MILESTONES.md](MILESTONES.md) remains authoritative for scope and completion.
This page distinguishes implemented candidates from release and activation
approval. The [23 August snapshot](astra/2026-09-04/PROJECT_STATE_2026-08-23.md)
is retained as historical evidence, including its exact CI run and earlier
operational assumptions.

## Repository baseline

- `main` at `a93c863` contains the completed Milestones 0–4 baseline.
- The remote Pilot release candidate at `a631d8e` remains separate in open
  Draft [PR #41](https://github.com/EERON36/kaul/pull/41). The local
  `pilot/release-candidate` worktree is still at `d20e453`, two commits behind.
- `codex/client-journal-monthly-reports` at `406aa75` is the product track in
  open Draft [PR #43](https://github.com/EERON36/kaul/pull/43).
  `codex/client-documents` at `d22fe0b` is the separate Documents implementation.
  Both are integrated into `codex/product-integration` at `82bf298`, open
  Draft [PR #44](https://github.com/EERON36/kaul/pull/44), with combined CI
  configuration corrections. They are not merged into main.

The product integration candidate is the baseline for the September project
health pass. Any local follow-up commits require their own review and
validation; the dates and SHAs above do not claim that a deployment occurred.

## Implemented product and boundaries

Kaul remains a portable Next.js modular monolith. Business rules belong to
server-side domain modules; PostgreSQL and reviewed Prisma migrations own
persistent state; Better Auth supplies credential/session mechanics behind
Kaul's Organisation, role, Client, Assignment, lifecycle, and audit boundaries.

Milestones 0–4 provide individual authentication, Staff management, Clients
and Assignments, immutable audit operations, author-private Journal drafts,
signed records and flat corrections, Goals, Follow-ups, and authorised
**Att göra**. The unmerged product candidate additionally implements:

- Expanded Client information and Stage A Personnummer envelope encryption
  ([ADR 0003](decisions/0003-personnummer-envelope-encryption.md)). Personnummer
  stays separate from Personreferens and outside ordinary lists, search, URLs,
  logs, and audit metadata.
- Six structured Journal sections that retain legacy signed narrative records,
  and Client-scoped, manually authored Monthly Reports with shared drafts and
  immutable signed versions and replacements.
- Client Documents with immutable versions, private storage, fail-closed
  malware scanning, and manifest-bound database/object backup and restore
  verification ([ADR 0004](decisions/0004-client-document-storage-and-malware-boundary.md)).

The bounded Documents track was approved on 3 September; it is not live, as
recorded in MILESTONES.md. These implementations do not mark Milestone 5
complete. Global search, organisation export, notifications, recurrence, and
other unapproved features remain deferred.

## Validation and release gates

Source or CI checks count only for the exact code and environment exercised.
Older M3/M4 and Pilot rehearsal results do not establish acceptance of the
combined product, encryption, and Documents lineage. This repository review
neither establishes current live-host state nor grants activation approval.

1. **Dependency security:** `npm run audit:ci` remains red. The 4 September
   review found the Prisma/config path to `deepmerge-ts@7.1.5`
   (`GHSA-ggr8-5vv4-36mx`) and mysql2 advisories
   `GHSA-3f6p-5ww8-9rcr` and `GHSA-rgwj-5xj2-c3m3`. Use supported dependency
   corrections and the unchanged policy; do not use overrides, downgrades,
   prereleases, or weakened checks to clear the gate.
2. **Combined migration and runtime evidence:** validate the exact integrated
   migrations, authorisation, signed-record integrity, concurrency, browser
   workflows, keyboard use, and accessible reflow with disposable PostgreSQL
   and appropriate browser checks. Local tests must use the explicit
   `KAUL_TEST_ID`/`KAUL_TEST_PORT` guard and new-only `kaul_test_*` databases,
   never the normal `kaul` database or schema-reset workarounds.
3. **Activation and operations:** Personnummer still requires attended Stage B
   conversion, restore proof with retained keys, and separately approved Stage
   C removal of legacy plaintext. Documents require the private scanner,
   least-privilege persistent mount, and successful exact-snapshot combined
   backup/restore rehearsal. Applicable host, network, HTTPS, update/recovery,
   monitoring, credential-support, incident ownership, and stakeholder gates
   remain subject to explicit evidence and owner approval.

Milestone 7 **Homelab Pilot Readiness** remains open; the candidate must not be
presented as Pilot-ready while the dependency policy is red. Any permitted
controlled testing is distinct from that readiness decision. Milestone 8
**Production / Cloud Launch Readiness** remains a separate later gate for
provider, legal/privacy, residency, credentials, account recovery, retention,
operational ownership, migration/restore, and explicit system-owner approval.
Kaul is not approved for real sensitive information.

See [SECURITY.md](SECURITY.md), [DEPLOYMENT.md](DEPLOYMENT.md), and the
[Pilot operator runbook](../deploy/pilot/README.md) for the authoritative
requirements. This status summary does not replace or relax them.

## Development and preservation

The integration owner reviews delegated diffs and proportionate verification
before accepting them. Keep main, Pilot, product, and historical work separate
until their required review, merge, and cleanup gates are satisfied. Preserve
uncommitted work, ignored evidence, mock-only concepts, and the authentication
prototype objects retained under `refs/safety/consolidation-20260822/*`.

A patch already present in the product candidate is not proof that a worktree
is disposable: main remains behind the candidates, and local untracked or
ignored artifacts may contain separate useful work. No branch, worktree,
safety reference, or external resource is deleted by this documentation pass.
