# Kaul Project State

Last reviewed: 22 August 2026.

`docs/MILESTONES.md` remains authoritative for milestone scope and completion.
This file is the short operational snapshot: what is integrated, what evidence
exists, and what still blocks a Pilot release decision.

## Product and architecture

Kaul is a Swedish case-management and professional documentation system for
pedagogues and social-service organisations. The current product supports
individual users, organisation-scoped Clients and Assignments, immutable audit
operations, author-private Journal drafts and signed records, Goals, and
Follow-ups.

The application is a portable Next.js App Router modular monolith. React and
Server Actions provide the web application; business rules live in owning
modules; PostgreSQL is authoritative; Prisma owns the reviewed schema and
migrations; Better Auth provides credential and session mechanics behind
Kaul's server-side organisation, role, lifecycle, and audit boundaries. The
Pilot topology is Caddy, Kaul, and PostgreSQL on a private Compose network.

Important intentional decisions include no public signup, database-backed
sessions and rate limits, a maximum 12-hour session, central assignment-based
Client access, append-only audit evidence, immutable signed Journal records,
flat corrections, and no database or authorisation logic in the browser.

## Data and verification

Only Prisma migrations change shared database structure; do not use schema
push/reset workarounds. Local integration and browser tests use guarded,
new-only `kaul_test_*` databases with explicit task IDs and ports and never the
normal `kaul` database. Verification is risk-based: focused tests during work,
PostgreSQL evidence for database/security behaviour, Playwright for visible
workflows, and formatting, lint, typecheck, unit tests, build, policy, and CI as
the release surface requires.

## Integrated repository state

- `main` contains the completed Milestones 0–4 product baseline.
- `pilot/release-candidate` is a separate, unmerged integration candidate. It
  combines the Pilot deployment foundation with the approved form-safety,
  not-found, accessibility, and first-session orientation slices.
- The release candidate is not approved for merge, tag, publication,
  deployment, or real or sensitive data.

Repository and CI evidence proves source, policy, unit, integration, build, and
browser behaviour only where the individual check actually ran. It does not
substitute for a clean Linux host, published-image, network, backup, restore,
monitoring, stakeholder, or sensitive-data approval.

## Blocking release gates

1. **Dependency audit:** stable `prisma@7.9.1` still pins vulnerable
   `deepmerge-ts@7.1.5` through `@prisma/config@7.9.1`. No supported stable
   upgrade currently removes it. Do not add an override, downgrade Prisma,
   adopt a prerelease, or weaken the audit policy. Wait for a supported upstream
   correction and review it normally.
   A local remediation updates Next/PostCSS/Sharp to supported patched versions
   and removes their obsolete exceptions, but it cannot clear this Prisma gate.
2. **Encrypted off-host backup:** the local remediation implements the approved
   backend-neutral Restic contract: direct `pg_dump` streaming, exact snapshot
   IDs, no completed plaintext dump, append-only writer separation, off-VM
   maintenance, offline recovery material, and pinned tool supply. No real
   provider, repository, data region, writer identity, maintenance identity,
   schedule, or alert owner is configured or approved. CI evidence cannot clear
   this real off-host gate.
3. **Restore rehearsal:** the local remediation provides a private,
   profile-gated application health check against a `kaul_restore_*` database
   without replacing live Kaul or Caddy. It has source/stub-test evidence only.
   Human review, integration, a clean disposable Linux host rehearsal, and real
   off-host encrypted-backup evidence are still required. The CI rehearsal is
   fictional and disposable, not Pilot runtime evidence.
4. **Remaining operations:** published image identity, VM prerequisites,
   DNS/HTTPS, monitoring and incident ownership, and critical fictional-data
   stakeholder workflows still need runtime evidence.
5. **Authentication review:** the deferred Have I Been Pwned plugin decision in
   ADR 0001 still requires its Milestone 7 privacy, availability, failure-mode,
   network, and user-message review.

## Development and preservation

The active lead owns architecture, orchestration, integration, and final
review. Editing agents use bounded isolated worktrees and distinct file
ownership; their reports are not acceptance evidence until the lead reviews the
diff and relevant checks. Risk-class verification follows
`docs/DEVELOPMENT_WORKFLOW.md`. Branch creation, staging, commit, push, pull
request, merge, and cleanup remain explicit decisions.

- Keep `main` and `pilot/release-candidate` separate until every Milestone 7
  gate passes and a human explicitly approves the merge.
- `codex/pilot-p0-remediation` contains local reviewed commits `da550c4` for
  supported dependency remediation and `49bea8f` for private restore
  verification. The Restic slice is a separate local review change. None is
  integrated into release-candidate history.
- Retain the current Pilot feature branches and active worktrees until the
  release-candidate pull request is merged and the normal cleanup preflight
  proves their contents are preserved.
- Retain the local `refs/safety/consolidation-20260822/*` references. They
  preserve old authentication-test stash objects discovered during the
  repository audit; deleting them is a later explicit cleanup decision.
- Historical task discussions are not authoritative. Capture durable decisions
  here, in milestone/security/deployment documents, or in an ADR before
  archiving the task.

## Next decision point

The next human review should inspect the local Restic/CI slice and its evidence,
then decide whether to integrate any remediation into the release candidate.
Release eligibility can be reassessed only after accepted integration, real
off-host and clean-host evidence, and a supported upstream Prisma correction.

Documents, uploads, notifications, reports, global search, exports, recurrence,
and external integrations remain deferred unless real Pilot feedback proves a
blocking need. Production credential delivery, sole-Administrator recovery,
legal/operational ownership, hosting, and sensitive-data approval also remain
open.
