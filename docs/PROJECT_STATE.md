# Kaul Project State

Last reviewed: 23 August 2026.

`docs/MILESTONES.md` remains authoritative for milestone scope and completion.
This file is the short operational snapshot: what is integrated, what evidence
exists, and what still blocks the separate Homelab Pilot and Production / Cloud
Launch decisions.

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
  not-found, accessibility, and first-session orientation slices, plus the
  reviewed dependency, private restore-check, encrypted off-host Restic, strict
  rest-server parsing, deterministic Journal navigation remediations, and the
  Gate C Docker-aware host-firewall candidate reviewed through
  `423de40a1b16fe3704f6dc9a691307624ef3f558`.
- The release candidate is not approved for merge, tag, publication,
  deployment, or real or sensitive data.

Repository and CI evidence proves source, policy, unit, integration, build, and
browser behaviour only where the individual check actually ran. It does not
substitute for a clean Linux host, published-image, network, backup, restore,
monitoring, stakeholder, or sensitive-data approval.

## Homelab Pilot readiness

Milestone 7 is the Homelab Pilot gate. It permits only invited stakeholder
testing with fictional, sanitised, or otherwise non-sensitive case data. Under
the current governance, the Prisma advisory is a Homelab Pilot blocker because
`docs/MILESTONES.md` explicitly forbids describing or publishing the candidate
as Pilot-ready while the dependency audit is red. Production-only provider,
contract, data-residency, and formal ownership approvals do not independently
block Milestone 7 unless another authoritative requirement assigns them there.

Current status against the Homelab minimum:

1. **Dependency audit:** stable `prisma@7.9.1` still pins vulnerable
   `deepmerge-ts@7.1.5` through `@prisma/config@7.9.1`. No supported stable
   upgrade currently removes it. Do not add an override, downgrade Prisma,
   adopt a prerelease, or weaken the audit policy. Wait for a supported upstream
   correction and review it normally.
   The integrated dependency remediation updates Next/PostCSS/Sharp to supported
   patched versions and removes their obsolete exceptions, but it cannot clear
   this Prisma gate.
2. **Ubuntu host and network isolation:** an existing Ubuntu VM in Proxmox is
   the intended host. The repository now prepares a read-only host preflight
   for supported LTS/amd64, resources, Docker, updates, time, private binding,
   and the NPM route. Codex has not accessed the VM. Operator-supplied passive
   inventory reports restricted SSH and the target firewall backend; a
   repository-owned Gate C candidate now prepares strict `DOCKER-USER`
   enforcement and rollback. Installation, denied management-service access,
   and reboot behavior have no real-host runtime evidence. A VLAN is optional
   unless
   these simpler controls cannot establish the required boundary.
3. **Domain, DNS, and HTTPS:** the Homelab design retains the existing Nginx
   Proxy Manager as the public TLS edge and Caddy as Kaul's native proxy. NPM
   mode publishes only a private Caddy listener and requires the later
   Caddy-observed NPM peer as one exact trusted `/32`; future public mode returns
   ports 80/443 and ACME to Caddy without an application fork. No domain, NPM
   Proxy Host, DNS record, certificate,
   trusted-peer observation, spoofing test, firewall rule, or external HTTPS
   check has been configured or verified.
4. **Secrets and authentication:** separate Pilot configuration, secure-session
   controls, no public signup, server-side authorisation, rate limiting, audit,
   and individual-account workflows are implemented. Real Pilot secrets,
   invited fictional test accounts, a safe Pilot credential handoff, incident
   contact, and the deferred Have I Been Pwned Milestone 7 decision remain open.
5. **PostgreSQL persistence and migrations:** a named persistent volume,
   health checks, app/admin credential separation, committed Prisma migrations,
   and guarded migration commands exist. No VM persistence, reboot, disk, or
   real migration rehearsal has run.
6. **Deployment, update, and rollback:** digest-only images, project-scoped
   locking, quiesced backup-before-migration, private health before Caddy, and
   fail-closed update behavior are implemented. No image has been published or
   pulled on a clean VM, and upgrade/recovery behavior has not run there.
7. **Encrypted off-host backup:** the integrated remediation implements the approved
   backend-neutral Restic contract: direct `pg_dump` streaming, exact snapshot
   IDs, no completed plaintext dump, append-only writer separation, off-VM
   maintenance, offline recovery material, and pinned tool supply. No real
   repository, writer identity, maintenance identity, schedule, or alert owner
   is configured. Formal provider and data-residency approval remains a
   Production / Cloud gate. CI evidence cannot clear this real off-host gate.
8. **Restore rehearsal:** the integrated remediation provides a private,
   profile-gated application health check against a `kaul_restore_*` database
   without replacing live Kaul or Caddy. It has source/stub-test evidence only.
   A clean disposable Linux host rehearsal and real
   off-host encrypted-backup evidence are still required. The CI rehearsal is
   fictional and disposable, not Pilot runtime evidence.
9. **Logging, monitoring, health, and reboot:** bounded container logs and
   database/application health contracts exist. Uptime monitoring, backup and
   disk alerts, incident ownership, and startup/reboot evidence are absent.
10. **Clean Linux/Docker rehearsal:** GitHub Actions run `32657159555` tested
    the PR merge of `423de40a1b16fe3704f6dc9a691307624ef3f558` into
    `a93c863cd906b3e25157c1d04a3529fb2ed7db67`. Its independent firewall,
    ingress, and append-only backup/restore rehearsals passed. The validation
    job also passed install, generation, migrations, formatting, lint (with
    three existing warnings), typecheck, 465 unit tests, 173 integration tests,
    build, and 41 browser tests after one flaky first attempt passed on retry.
    CI remains red only at the unchanged Prisma/deepmerge audit gate. This
    evidence predates the local post-review Gate C correction and is not proof
    of the actual VM, NPM, network, UFW/native nftables inventory, off-host
    backend, or operator schedule.
11. **Data migration:** PostgreSQL logical backup/restore and host-independent
    application configuration provide the intended migration path. No
    cross-host rehearsal has yet proved that accounts, Clients, Assignments,
    records, stable identifiers, and audit history survive together. The later
    Milestone 6 organisation export is not a Homelab prerequisite without a
    validated Pilot need.
12. **Stakeholder acceptance:** critical fictional-data workflows, Pilot
    warning visibility, support expectations, and the feedback loop have not
    been accepted by invited users.

## Production / Cloud Launch readiness

Milestone 8 has not begun. It retains every applicable Milestone 7 and release
policy requirement and additionally requires an approved provider and database
operating model, data residency and legal/privacy review, production-separated
application/database/backup credentials, a real immutable or append-only
off-host backend, assigned retention/monitoring/alert ownership, offline
recovery material, a production restore and migration rehearsal, release
provenance, production hardening, stakeholder acceptance, and explicit system
owner approval. Production credential delivery and sole-Administrator recovery
also remain open. None of these approvals exists yet.

Pilot infrastructure is disposable. Pilot PostgreSQL application data should
nevertheless remain migratable where reasonably possible through portable
logical backups, stable identifiers, committed migrations, and host-independent
configuration. Perfect preservation is not promised when compatibility,
integrity, or security evidence requires a controlled reset.

## GitHub Actions behavior for the release-candidate branch

The repository has two workflows. With open Draft PR #41 from
`pilot/release-candidate` to `main`, an explicitly approved push of new RC
commits would produce a branch `push` event and a `pull_request` `synchronize`
event:

- The `push` event does not match `Validate`, which accepts branch pushes only
  to `main`.
- The PR `synchronize` event does match `Validate`, because its
  `pull_request.branches: [main]` filter selects the PR base branch. It starts
  one workflow run containing the Ubuntu validation job and the separate
  Linux/Docker/PostgreSQL/Restic rehearsal job. Adding an RC push trigger while
  this PR remains open would duplicate that validation for the same update.
- `Publish release image` runs only for a pushed `v*` tag and requires the
  tagged commit to be an ancestor of `origin/main`. A branch push publishes no
  image. The workflow records an image digest but contains no deployment step.

The `Validate` workflow uses fictional inline CI credentials, read-only
repository permission, and no GitHub Environment. It requires no repository
secret or environment approval. The tag-only image workflow uses the automatic
`GITHUB_TOKEN` with package-write permission and also declares no deployment
environment or environment approval.

## Development and preservation

The active lead owns architecture, orchestration, integration, and final
review. Editing agents use bounded isolated worktrees and distinct file
ownership; their reports are not acceptance evidence until the lead reviews the
diff and relevant checks. Risk-class verification follows
`docs/DEVELOPMENT_WORKFLOW.md`. Branch creation, staging, commit, push, pull
request, merge, and cleanup remain explicit decisions.

- Keep `main` and `pilot/release-candidate` separate until every Milestone 7
  gate passes and a human explicitly approves the merge.
- The reviewed remediations `da550c4`, `49bea8f`, and `3ea91b5` are integrated
  linearly into the local release candidate. Their temporary worktree and local
  branch were removed only after identical-tip and zero-unique-commit proof.
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

The next human review should assess the existing-VM/NPM/Caddy preparation diff
and its remaining runtime decisions. Under the unchanged current governance,
the supported upstream Prisma correction is required before Homelab Pilot
approval; changing that classification would require an explicit Milestone
7/security-policy decision, not an operational workaround.

Draft PR #41 already provides the required `pull_request` `synchronize` path
for Linux evidence, so no RC-specific push trigger is required while that PR
remains open, targets `main`, and is mergeable. A future RC push remains a
separate explicit approval. Reverify the PR state immediately before that push.
The Have I Been Pwned Milestone 7 decision also remains open.

Documents, uploads, notifications, reports, global search, exports, recurrence,
and external integrations remain deferred unless real Pilot feedback proves a
blocking need. Production credential delivery, sole-Administrator recovery,
legal/operational ownership, hosting, and sensitive-data approval also remain
open.
