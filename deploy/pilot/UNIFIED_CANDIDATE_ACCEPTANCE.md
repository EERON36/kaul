# Owner-attended Unified Kaul acceptance

Preparation only. Do not execute this procedure now.

The current authorization covers the development candidate, not main/PR merges,
release publication, live migrations, keys, storage, networking or deployment.
Repository hardening and independent engineering acceptance are complete at
source 0173710. The strict dependency audit is red. This document cannot
authorize a live operation or waive that mandatory gate.
Resolve the exact candidate and current evidence from
[the execution board](../../docs/integration/2026-09-05/BOARD.md).

## 1. Release and pre-outage gates

Before any outage, the owner must approve the exact release/change window and
all mandatory checks must pass. This includes strict audit without an exception,
final integrated validation and independent acceptance. Merging any PR, creating
a tag and publishing an image each require separate explicit owner authority.
The release workflow requires a trusted complete successful Validate push on
main for the exact release SHA and reruns the current audit before publication.
If integration creates a different release SHA, validate that exact SHA again.

Choose public/private GHCR visibility explicitly. From a clean pull, record the
immutable digest and image revision; prove they match the approved release.
Retain the current running image for recovery. A candidate SHA is not an image
digest and the CI provenance fixture is not a published-image proof.

In a separately authorized read-only host session, refresh the current checkout,
running image/revision, service health, applied migrations, active listeners,
free space and rollback assets. Do not copy the historical guide's PR43 SHA,
Pilot digest, six-migration count or fixed snapshot ID as current state. Confirm
whether Documents have actually been activated and whether plaintext conversion
is required. Do not use first-install `host-preflight` against a running Pilot;
its active Caddy listener rejection is intentional. Use the existing-host checks
and applicable protected `preflight` described in the runbook.

Owner-controlled prerequisites:

- The protected environment, pinned Restic 0.19.1, supported Node runtime for the
  new set-verification tooling, Docker/Compose and operator identity are ready
  before stopping services. No real environment or key contents belong in chat.
- The dedicated Documents filesystem has adequate capacity, owner-only
  directories, the image's numeric UID/GID, and nodev/nosuid/noexec where
  supported. Active storage and the precreated empty restore root are separate;
  neither may contain the other. Quarantine is excluded from backup.
- A separate read-only Personnummer keyring and independently recoverable
  offline copy are under named custody. Retain keys needed by current rows and
  historical backups. Prove the offline copy can be recovered after remount;
  environment-variable presence is not that proof. Never print key material.
- The real NPM peer, Docker-aware firewall, restricted management access, SSH
  recovery and reboot persistence are accepted. Existing installations require
  inspection, not replay of first-install or destructive network commands.
- Append-only off-host backup writer access, a separate retention identity,
  recovery credentials, outage/rollback owners and failure notifications are
  assigned. The host must not receive deletion/prune authority.

Prove accepted Restic authentication in the exact protected operator context
while healthy services remain online. For the freshly verified historical
DB-only snapshot, the existing command is:

```sh
scripts/pilot-ops.sh validate-backup \
  --env-file /etc/kaul/pilot.env \
  --snapshot "$EXACT_VERIFIED_SNAPSHOT_ID"
```

The ID must be one verified full 64-character snapshot ID, never `latest`.
For an already activated Documents system, validate the exact manifest-bound
set instead. Stop on authentication, catalog or archive failure; nonempty
credential variables do not prove backend authentication. Record only safe
identities/counts/results, not data, credentials or key bytes.

After owner authorization for scanner preparation, run the pinned
`prepare-scanner` and `verify-documents` operations. Prove actual signature
refresh/reload, the real adapter's CLEAN result within 24 hours, persistence
across restart and an alert before freshness is lost. Ping/health alone is not
this proof. Confirm sufficient scanner reload memory and disk headroom.

## 2. Attended conversion and recovery proof

Do not use `update` for the initial historical-to-unified transition. Confirm
all pre-outage gates first; pause scheduled or competing operator activity.
Each command must succeed before the next is attempted. Failure leaves the
service unavailable for investigation; it is not permission for a live reset,
in-place rollback or key substitution.

After separate owner authorization and all pre-outage gates, the command order is:

1. `quiesce` confirms Caddy and Kaul stopped. Capture and validate the required
   pre-transition backup in the exact context already authenticated above.
2. `migrate` applies only committed Prisma migrations. Run
   `convert-personnummer`, review aggregate counts and repeat it to prove
   idempotence/zero remaining conversion work. Keep ingress closed. Stage C
   removal is a separate decision and is not part of this candidate.
3. `backup-documents-set` captures the post-conversion quiesced set, even when
   there are zero accepted objects. Select the approved new `KAUL_IMAGE` before
   this standalone capture: its revision declares the recovery/verification
   image, while migration names record the actual database state. An old
   stopped container is not the post-conversion identity. Record the exact
   manifest snapshot ID.
   `restore-documents-set` must restore that exact set into a new guarded restore
   database and precreated empty isolated root. Existing databases/roots are
   preserved; quarantine contents must never be restored.

All operations use `scripts/pilot-ops.sh` with the protected `--env-file`.
The exact accepted restore flags are shown below. The earlier DB-only
`backup`/`restore` proof does not substitute for the combined set or live recovery.

Record the exact manifest ID and choose one new `kaul_restore_...` database and
one precreated empty absolute restore root for this attended attempt. The
variables below must contain those approved values; they have no defaults.
After successful capture, the protected restore and private-check commands are:

```sh
scripts/pilot-ops.sh restore-documents-set \
  --env-file /etc/kaul/pilot.env \
  --manifest-snapshot "$EXACT_MANIFEST_SNAPSHOT_ID" \
  --database "$APPROVED_NEW_RESTORE_DATABASE" \
  --storage-root "$APPROVED_EMPTY_RESTORE_ROOT"

scripts/pilot-ops.sh start-restore-check \
  --env-file /etc/kaul/pilot.env \
  --database "$APPROVED_NEW_RESTORE_DATABASE" \
  --storage-root "$APPROVED_EMPTY_RESTORE_ROOT"
```

The second command uses the same root after successful restore. Do not retry a
failed restore into that now nonempty root or existing database. Preserve it
and select a new explicitly approved attempt if recovery work must continue.

Recovery acceptance requires all of the following against the restored set:

- Exact manifest-selected database and object snapshots, application identity
  and migration names; no missing, orphaned, corrupt, linked or nonregular
  objects; exact agreement with restored DocumentVersion metadata.
- Correct retained keys successfully open the required encrypted records;
  missing/wrong keys fail closed. No plaintext/key values appear in ordinary
  logs or evidence. Historical signed Journal content and report lineage remain.
- The private restore-check uses the restored database and mounts the restored
  object root read-only. Download audits still write to the restored database.
  It never mounts active Documents storage or opens a public Caddy
  route. Authorized and denied downloads succeed/fail as expected from that
  restored set. Empty quarantine structure may exist; source quarantine data
  may not. Record actual tested boundaries, not just a health response.

Keep exact restore resources and evidence for the owner. Cleanup is separately
authorized. A partial failed restore must not be overwritten to make a retry
appear successful. Rollback uses a new clean restore and the recorded compatible
image/key set; never undo migrations in place.

## 3. Controlled startup and brother-testing acceptance

Only after migration, conversion and exact recovery proof may the owner invoke
`start-stack` deliberately. It keeps Caddy stopped until application health and
the separate real Documents storage/scanner check pass. If either fails, Kaul
is stopped and ingress stays closed. This operational check is not a substitute
for browser or stakeholder acceptance.

Before admitting testers, record:

- External HTTPS and intended origin, sign-in/forced password change/logout,
  allowed and denied Organisation/Client/assignment access, fictional Documents
  upload/download and protected responses, report/record behavior, historical
  signer snapshots and Personnummer projection protection.
- Scanner update/reload persistence, capacity and quarantine monitoring,
  scheduled quiesced combined backups, failed-backup alerts, exact restore
  ownership, reboot behavior and the rollback decision point. Choose the backup
  window and notification ownership explicitly; a timer alone is not evidence.
- Named incident/support and credential-recovery owners, accessibility and
  brother-testing acceptance, and the fictional/sanitized-data restriction.
  Real sensitive production use, legal approval and Stage C remain separate.

The owner must separately authorize this attended phase. No command in this
preparation was executed against the homelab or live environment.
