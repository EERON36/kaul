# Kaul Pilot operator runbook

This repository foundation supports a small production-like Pilot stack. It
does **not** deploy Kaul, approve a homelab, or permit real Client data.

> Pilotmiljö – använd inte verkliga personuppgifter eller känslig information.

Only fictional or sanitized data is allowed. Kaul is not approved for
sensitive production use.

## Combined candidate activation boundary

The historical Pilot-to-unified transition is owner attended. Do not use
`update` for the initial transition: Stage A requires explicit Personnummer
conversion before application readiness can pass, and Documents activation
requires manifest-bound database/object backup and isolated restore evidence.
The execution board records which of those gates is actually complete.

`prepare-scanner` starts only the pinned private scanner and waits for its
container health. Its dedicated `scanner-updates` network permits signature
updates without attaching PostgreSQL or Kaul to an external network. It has no
published port, Documents mount or application credential. The image's normal
FreshClam daemon refreshes the persistent signature volume. Owner acceptance
must prove outbound DNS/update access, reload, restart persistence and alerts
before signatures reach the unchanged maximum age of 24 hours. Container ping
alone does not prove signature freshness.

`verify-documents` runs the exact image's real ClamAV adapter with fictional
bytes and probes a newly owned quarantine file. It rejects absent/linked
storage, unavailable or stale scanning, and any non-clean result. It does not
upload a Client record or modify accepted objects. Both `start-stack` and
`update` keep Caddy stopped until application health and this separate check
pass; readiness failure stops Kaul and leaves ingress stopped. Application
health alone remains a database/key readiness signal, not scanner evidence.

```sh
scripts/pilot-ops.sh prepare-scanner --env-file /etc/kaul/pilot.env
scripts/pilot-ops.sh verify-documents --env-file /etc/kaul/pilot.env
```

These commands are future owner operations, not authorization to run them now.
Finish the exact backup/restore and conversion gates before `start-stack`.

## Topology

```text
Internet
  -> router 80/443
  -> existing Nginx Proxy Manager (public TLS)
  -> Kaul VM private-LAN address:8080
  -> Caddy (trusted NPM peer only)
  -> internal-only Compose network
       -> Kaul :3000
       -> ClamAV :3310
       -> PostgreSQL :5432
```

NPM remains the Homelab public edge. On the Kaul VM, only Caddy publishes one
private-LAN TCP binding. Host and Docker-aware firewall controls must limit that
binding to the later-verified, Caddy-observed NPM source address. Kaul uses a
dedicated non-superuser database role. PostgreSQL, Kaul, Docker, SSH, and
Proxmox must not be exposed publicly.
PostgreSQL data, ClamAV signatures, and Caddy certificate state use named
persistent volumes. Documents use an owner-prepared host directory mounted
read/write only into Kaul and read-only into the profile-gated restore checker.
Caddy and ClamAV receive no Documents mount, and ClamAV publishes no host port.

## Documents host storage gate

Before any owner-attended deployment, create `DOCUMENT_STORAGE_HOST_PATH` as a
dedicated absolute directory on a filesystem mounted `nodev,nosuid,noexec`
where supported. Verify the final image's `node` UID/GID and make that identity
the only container writer. The directory and its `objects/` and `quarantine/`
children must be non-symlink directories with owner-only access. The Pilot
preflight refuses a missing, symlinked, inaccessible, or under-20-GiB path.

Quarantine is excluded from backup. V1 deliberately has no unattended residue
deleter: an operator must alert on capacity and reconcile aged quarantine files
only while Document mutations are quiesced. Never delete a file whose database
commit state is uncertain; preserve it and investigate instead.

The future provider mode removes NPM without changing Kaul application code:

```text
Internet -> Caddy 80/443 and ACME -> Kaul -> PostgreSQL
```

`PILOT_INGRESS_MODE=npm` selects the Homelab binding and trusted-proxy policy.
`PILOT_INGRESS_MODE=public` selects direct Caddy 80/443 publication and automatic
certificate handling. Changing modes is a reviewed deployment change, never an
automatic fallback.

## Files and secrets

- `compose.pilot.yaml` defines the Pilot services separately from development.
- `compose.pilot.npm.yaml` publishes only the NPM-to-Caddy private listener.
- `compose.pilot.public.yaml` publishes Caddy 80/443 for a future provider.
- `Caddyfile.npm` and `Caddyfile.public` define separate fail-closed ingress
  policies behind one selected Caddy entry point.
- `pilot.env.example` is a secret-free contract, not a usable environment.
- `scripts/pilot-ops.sh` provides preflight, backup, restore, migration, and
  update commands.
- `scripts/pilot-ingress-rehearsal.sh` runs a disposable Linux CI check of the
  real Compose/Caddy ingress contract with fictional test-only peers.
- `firewall/` contains the separately installed root operator, Docker systemd
  drop-in, timed rollback units, and manual Gate C runbook.
- `scripts/pilot-firewall-rehearsal.sh` exercises the original-DNAT rule model
  against a digest-pinned Docker Engine 29.7.2 daemon.

The ingress rehearsal starts the pinned Caddy image in NPM mode on an isolated
Docker network. It proves that only a synthetic exact `/32` peer reaches the
private listener, spoofed forwarding metadata is sanitized, Kaul and PostgreSQL
publish no host ports, and the future public Caddy configuration validates
without starting public listeners or requesting certificates. It uses a small
header-echo stub instead of the Kaul application and does not start PostgreSQL.
It always removes its disposable containers, networks, and volumes.

This CI evidence does not identify or approve the real NPM peer, configure a
firewall, inspect the Ubuntu VM/NPM installation, or prove Internet routing,
TLS, secure cookies, rate-limit separation, or application/database runtime
behaviour. Those remain later authorised runtime gates.

Copy `pilot.env.example` to an operator-controlled path outside the repository,
for example `/etc/kaul/pilot.env`. Set ownership to the Kaul operator and mode
`0600`. Use distinct, high-entropy, random URL-safe values for all three
secrets. Both PostgreSQL passwords must contain at least 32 characters. Never
paste the rendered Compose configuration into tickets or logs because it
contains environment values.

Personnummer keys use a separate file boundary. Create the keyring outside the
checkout, set `KAUL_PERSONNUMMER_KEYRING_HOST_FILE` to its absolute path, and do
not put its JSON contents in `pilot.env`. The current image runs as the
non-root `node` identity (numeric UID 1000), so the dedicated Pilot operator and
the keyring owner must use that same numeric UID. Set the keyring to mode `0400`.
Preflight rejects relative paths, symlinks, non-regular files, different owners,
and any group or world access without reading or printing the file contents.
Compose bind-mounts it read-only into only Kaul and the private restore-check at
`/run/secrets/kaul-personnummer-keyring.json`; Caddy and PostgreSQL do not receive
it.

Stage A does not convert existing plaintext automatically. A future authorised
Pilot change window must run `scripts/pilot-ops.sh convert-personnummer
--env-file /etc/kaul/pilot.env` after the Stage A migration and before the
application is made available. The guarded command stops Kaul, creates and
validates a pre-conversion backup, invokes the explicit converter confirmation,
and leaves Kaul stopped. Record only its counts. Do not run Stage C until
conversion, clean restore, and retained-backup key compatibility have been
verified.

The Gate C firewall policy is a separate non-secret host configuration. It may
be installed and verified before this complete deployment environment exists.
When `host-preflight` or `preflight` later runs, it cross-checks the installed
Gate C project, `npm` mode, private bind, and trusted NPM `/32`. Full deployment
`preflight` and every deployment operation still require the complete Pilot
environment, including the image, application, database, and backup values.

`KAUL_IMAGE` must be a GHCR image pinned by `@sha256:<digest>`. Tags help humans
find a release, but the Pilot is promoted by digest. The image label
`org.opencontainers.image.revision` identifies its Git commit:

```sh
docker image inspect --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}' \
  ghcr.io/example/kaul@sha256:REPLACE
```

## GHCR access and post-publication gate

Before registry login or image publication, the release workflow requires:

1. The version tag's exact commit is an ancestor of `main`, preserving the
   approved release lineage.
2. The latest matching `Validate` run is a successful same-repository `push`
   on `main` for that exact commit. Its current attempt must include all four
   successful jobs: application validation, firewall, ingress and backup
   rehearsals. A pull-request result alone is insufficient; a partial rerun
   must be followed by a successful full rerun before release.
3. A fresh `npm ci` followed by the unchanged mandatory `npm run audit:ci`
   passes before GHCR login. A previous green run does not waive newly
   reported dependency findings.

Missing, pending, failed, skipped, incomplete or untrusted validation, and any
GitHub API failure, stop publication. Wait for full validation to succeed and
rerun the release workflow; do not bypass or relax either gate. These source
controls do not authorize a tag, publication, deployment or real-data use.

Choose the image-access model explicitly before deployment:

- A public GHCR package may be pulled anonymously only when making the image
  public has been deliberately approved.
- A private GHCR package requires an authenticated operator with read-only
  package access. Use a dedicated token limited to `read:packages` and access
  to this package; repository administration and package-write scopes are not
  required for a Pilot pull.

For a private package, enter the token through Docker's interactive login or
`--password-stdin` from an approved protected secret source. Never put a token
in this repository, the Compose file, the Pilot environment file, a command-
line argument, or shell history. Docker may retain registry credentials in the
operator's Docker configuration. Prefer an approved credential helper; at
minimum restrict that configuration to the operator account. Log out when the
host should no longer retain access, and rotate or revoke the token when the
operator, host, or package access changes.

After the release workflow publishes an image, verify it from a clean Linux VM
before any deployment command:

1. Authenticate to GHCR when the package is private.
2. Pull the approved `ghcr.io/...@sha256:...` reference by digest.
3. Inspect `RepoDigests` and confirm the pulled digest is the approved digest.
4. Inspect `org.opencontainers.image.revision` and confirm it is the approved
   release commit.

Proceed only after both identities match the reviewed release record. This
gate cannot be completed before the image has actually been published.

## NPM, Caddy, and client identity

The Homelab path has two proxies. NPM terminates public TLS and forwards plain
HTTP over the private LAN to Caddy. The real NPM source address is a required
deployment input, not a repository default. During the later authorised
inspection, observe the immediate network peer Caddy actually receives and set
that exact `/32` in `PILOT_NPM_TRUSTED_PROXY_CIDR`. Use the same observed peer
for the firewall or equivalent NPM-only ingress rule. Never derive this access
decision from `X-Forwarded-For`, `X-Real-IP`, or another client-supplied header,
and do not trust `private_ranges` or a whole LAN subnet.

NPM must forward the Pilot request with:

- `Host` set to the exact public Pilot hostname.
- `X-Forwarded-Proto: https` for the public browser connection.
- `X-Forwarded-For` appended with the browser peer address.
- `X-Real-IP` overwritten with NPM's direct browser peer address.

Current NPM defaults provide these headers, but the installed NPM version and
generated proxy-host configuration must be inspected before exposure. Do not
add an NPM advanced/custom location that silently replaces the default proxy
header or access-control includes.

Caddy does not pass these values through blindly. It trusts `X-Forwarded-For`
only from the exact observed NPM network peer, parses the chain right-to-left,
and overwrites the request sent to Kaul with the expected `Host`, HTTPS scheme,
and one derived client address in both `X-Real-IP` and `X-Forwarded-For`. It
removes the generic `Forwarded`, `CF-Connecting-IP`, and `True-Client-IP`
alternatives. Kaul continues trusting only Caddy's `X-Real-IP` for
authentication rate limiting. Its configured HTTPS base URL keeps Better Auth
cookies secure even though the private NPM-to-Caddy hop is HTTP.

Before stakeholder access, prove with request and Caddy-log evidence that:

1. A spoofed left-most `X-Forwarded-For` value does not become Kaul's client IP.
2. Two real external clients produce their own expected rate-limit identities.
3. A non-NPM LAN peer cannot reach the private Caddy listener.
4. The application receives the exact public hostname and HTTPS origin.

Do not add a CDN or another proxy hop without a separate trusted-proxy review.

The accepted Pilot threat model assumes public TLS terminates at NPM; the
NPM-to-Caddy HTTP hop remains on the trusted private homelab network; Caddy's
private listener is not Internet-reachable and is restricted to the verified
NPM peer; strict trusted-proxy processing supplies the original HTTPS/client
metadata; and Kaul plus PostgreSQL remain unpublished. Internal PKI or mTLS is
not a baseline Pilot requirement. Reassess transport protection if inspection
shows that this private hop crosses an untrusted or shared network boundary.

## Existing Ubuntu VM inspection and preflight

Do not provision another VM by default. When homelab access is separately
approved, inspect the existing Ubuntu VM first and bring it into the supported
state when practical. The automated floor is:

- Ubuntu 22.04, 24.04, or 26.04 LTS on x86-64/amd64.
- At least 2 vCPUs, 4 GiB RAM, and 20 GiB free on both the Kaul checkout and
  Docker data storage before deployment.
- Docker Engine running and enabled at boot, Compose v2, accurate system time,
  automatic security-update checks, and no pending reboot.
- A dedicated non-root Kaul operator able to use Docker, restricted SSH, and no
  public administrative port.
- `perl` with `Fcntl`, Restic 0.19.1, `awk`, `grep`, `realpath`, `mktemp`,
  `mkfifo`, `sed`, `ip`, and `ss`.

Run the read-only host inspection before the stack preflight:

```sh
scripts/pilot-ops.sh host-preflight --env-file /etc/kaul/pilot.env
scripts/pilot-ops.sh preflight --env-file /etc/kaul/pilot.env
```

The host check does not install packages, change the firewall, access NPM, or
declare the manual network gates complete. It verifies the supported OS and
architecture, resource floor, Docker and update/startup state, Restic version,
the configured VM address, its route to NPM, and that the private Caddy port is
unused before deployment.

Manual inspection must still prove current security patches and restricted SSH;
the Caddy-observed NPM peer and generated headers; a Docker-aware firewall
boundary; no access to Proxmox, router, NPM administration, NAS administration,
or unrelated private services; and reboot persistence. Docker-published ports
can bypass ordinary UFW input handling, so UFW alone is not sufficient evidence.
The reviewed Gate C implementation is in `deploy/pilot/firewall/README.md`. It
uses UFW for host `INPUT`, one narrowly owned `DOCKER-USER` chain/jump for the
Docker-published private Caddy listener, and Caddy's exact-peer check as defense
in depth. It does not require activating the currently unused Proxmox firewall.
Run its installation or mutation commands only after a separate operator gate.

Docker access is effectively root-level host authority. Limit the operator to
the approved administrative source, use key-based SSH, disable public/root SSH,
and do not reuse the account for ordinary interactive work.

Inventory the application's actual outbound dependencies during deployment
preparation and runtime inspection. Minimise egress and restrict it to genuinely
required destinations or service classes where practical. If broad HTTPS
egress remains necessary for legitimate application, update, backup, or
monitoring behavior, document that residual access instead of breaking the
application to satisfy an unverified theoretical allowlist. This does not grant
access to homelab management services. The VM needs inbound TCP only from the
verified NPM peer to the configured private Caddy binding and restricted
administration from the approved admin source. A VLAN is optional, not a Pilot
gate unless these simpler controls cannot produce the required boundary.

Install Restic from its official release artifacts and verify the reviewed
publisher checksum; do not use `self-update` or an unpinned package channel on
the Pilot host. `COMPOSE_PROJECT_NAME` must start with a lowercase letter or
digit, contain only lowercase letters, digits, hyphens, and underscores, and
contain at most 63 characters. Then:

## NPM proxy-host preparation

After a domain and homelab access are separately approved:

1. Observe and record the network peer address Caddy receives from NPM; use its
   exact `/32` for Caddy trust and NPM-only ingress enforcement.
2. Create one NPM Proxy Host for the exact `pilot.<domain>` hostname.
3. Terminate a valid public certificate at NPM and force browser HTTP to HTTPS.
4. Forward with scheme `http` to the Kaul VM's private address and configured
   private port, normally TCP 8080.
5. Do not forward the hostname to Kaul, PostgreSQL, SSH, Docker, or a management
   service directly.
6. Confirm the generated NPM configuration retains its standard Host and
   forwarding headers, then run the spoofing and denied-peer checks above.

The router's existing public 80/443 forwarding remains directed to NPM. Do not
forward public 80/443 to the Kaul VM during the Homelab Pilot.

The Linux x86-64 CI supply contract pins Restic 0.19.1 archive SHA-256
`f415415624dcc452f2a02b8c33641791a8c6d6d3b65bbb3543fcf9a25151585c`
and rest-server 0.14.0 archive SHA-256
`4c9c95bc079a0334e81fad379b19dc5c3353c71c2c88d652cafce2081c2b1c66`.
They come from the projects' official GitHub release checksum manifests. A
different host architecture or version is a new supply review, not an automatic
substitution.

1. Validate configuration and start only PostgreSQL.

   ```sh
   scripts/pilot-ops.sh start-postgres \
     --env-file /etc/kaul/pilot.env
   ```

2. Apply committed migrations once, while Kaul remains stopped. The normal
   command creates and validates a pre-migration backup even for the empty
   database.

   ```sh
   scripts/pilot-ops.sh migrate \
     --env-file /etc/kaul/pilot.env
   ```

   A controlled real-testing deployment may use the separately authorised
   `migrate-pristine` exception only when an off-host backup path is deliberately
   deferred and the installation contains no important data. It runs the same
   configuration preflight and operation lock, stops Kaul, and asks PostgreSQL
   to prove that there are no non-system schemas or application relations,
   types, routines, large objects, or non-default extensions before it runs
   Prisma. A populated result, a query error, or unexpected output stops before
   migration. The Prisma-created schema then makes the exception reject every
   later attempt.

   ```sh
   scripts/pilot-ops.sh migrate-pristine \
     --env-file /etc/kaul/pilot.env
   ```

   This exception does not make backup readiness pass, does not replace the
   ordinary migration or update path, and is forbidden once any application
   schema or data exists. Configure and verify the approved encrypted off-host
   Restic path before treating testing data as important or production-critical.

3. Create the initial Administrator exactly once with the selected image,
   protect the one-time credential, then start the stack.

   ```sh
   scripts/pilot-ops.sh bootstrap-admin \
     --env-file /etc/kaul/pilot.env
   scripts/pilot-ops.sh start-stack \
     --env-file /etc/kaul/pilot.env
   ```

The credential expires after 24 hours and must be changed at first login. The
Pilot operator must use an agreed private delivery channel. This is not the
sole-Administrator recovery procedure required for sensitive production.

Verify HTTPS, `/api/health` returning only `{"status":"ok"}`, the login and
password-change path, one authorised Client workflow, one denied workflow, the
persistent Pilot warning, and logs containing no Client content or secrets.

## Deliberate update

First review the release workflow result, record its version, commit, and
digest, then replace `KAUL_IMAGE` in the protected environment file. Run:

```sh
scripts/pilot-ops.sh update \
  --env-file /etc/kaul/pilot.env
```

The script reports the current and target images and pulls the digest while the
verified current release is still serving. It then stops Caddy, stops Kaul,
captures and validates the required quiesced backup in the encrypted off-host
Restic repository, records its exact snapshot or manifest ID, and applies
committed Prisma migrations, verifies migration status,
starts the new app privately, and waits for its database-backed health check.
Caddy is started only after Kaul is healthy and the real Documents readiness
check succeeds. Use the [attended Unified Candidate procedure](UNIFIED_CANDIDATE_ACCEPTANCE.md) for the initial historical-to-unified transition.

If Caddy cannot be stopped, the update does not continue. If Kaul cannot be
confirmed stopped, Caddy remains stopped and the update does not continue. If
the quiesced backup fails, both remain stopped and no migration starts.

If migration or Kaul startup fails, Kaul and Caddy remain stopped. If the new
app is unhealthy, it is stopped and Caddy remains stopped. If Caddy itself
cannot be restarted after Kaul is healthy, Kaul remains private and the Pilot
remains unavailable. Preserve the snapshot ID, container logs, target digest, and
migration output. Do not invent down migrations or blindly start the old
application: schema and application rollback are separate decisions.

After success, independently verify public HTTPS, login, an allowed and denied
workflow, safe logs, and disk capacity. Record the operator, time, old and new
digests, exact backup snapshot ID, migration result, health result, and known
issues.

## Backup and restore

The database-only commands below are for historical databases without the
Documents schema or objects. Once the Documents schema exists, `backup` requires
both Kaul and Caddy stopped and selects a manifest-bound combined set, including
when no document has been uploaded yet. Do not schedule online DB-only backups
for an activated Documents system. See the combined procedure below.

Create and validate a historical logical database backup:

```sh
scripts/pilot-ops.sh backup \
  --env-file /etc/kaul/pilot.env

scripts/pilot-ops.sh validate-backup \
  --env-file /etc/kaul/pilot.env \
  --snapshot EXACT_64_CHARACTER_SNAPSHOT_ID
```

Restic executes `pg_dump` through `backup --stdin-from-command`. A nonzero dump
exit cancels the backup and does not create a successful snapshot. The custom
archive excludes ownership/ACL statements and is never completed as a plaintext
file on the Pilot host. The operator accepts only one unambiguous full snapshot
ID, verifies that exact catalog entry and expected file, then streams it through
`pg_restore --list` using a private FIFO. Restic encryption is the only backup
encryption layer. Proxmox snapshots remain supplemental only.

`RESTIC_REPOSITORY`, `RESTIC_EXPECTED_VERSION=0.19.1`, and the absolute
`RESTIC_PASSWORD_FILE` reference belong in `/etc/kaul/pilot.env`. The password
file must be a non-symlink regular file owned by the operator with no group or
other permissions. Backend credentials must be supplied separately by the host
service manager; for the REST backend the script preserves only
`RESTIC_REST_USERNAME` and `RESTIC_REST_PASSWORD` after sanitizing other
ambient `RESTIC_*` configuration. Do not embed REST credentials in the
repository URL. The repository must be off-host. The script rejects local
repositories and does not print repository or credential values.

The Pilot VM uses a backup-writer identity that may create and read snapshots
but cannot delete, overwrite, forget, or prune repository history. For a REST
backend, use rest-server append-only mode or an equivalently reviewed backend
control. Application and database credentials are separate from backup access.
Keep the Restic password and provider recovery material offline, away from the
VM and ordinary writer identity.

Every state-changing operator command (`backup`, `restore`, `migrate`, `update`,
`start-postgres`, `bootstrap-admin`, and `start-stack`) takes one exclusive
operation lock for the validated Compose project. The deterministic zero-byte
lock target is `/tmp/kaul-pilot-COMPOSE_PROJECT_NAME.pilot-ops.lock`, so
different environment files for the same Compose project contend on the same
lock while different projects remain independent.

The script removes the complete Pilot Compose interpolation contract from the
caller's process environment before every Compose invocation. Compose must
therefore obtain those values from the selected environment file. The script
also passes the validated project name explicitly with `--project-name`, so the
lock identity and Compose stack identity remain aligned. Do not replace the
protected operator commands with raw `docker compose` commands: shell variables
take precedence over `--env-file` and could otherwise bypass validated values.

The operating system owns the active non-blocking lock and releases it
automatically on normal exit, error, or process death; the zero-byte file is
not a stale-lock indicator. A second workflow for the same project fails
before Docker or PostgreSQL mutation. Do not delete or replace the lock file
while an operator workflow is running. The implementation atomically opens a
non-symlink lock target and uses Perl's OS-backed `Fcntl` locking, which is
verified by the Git Bash test path and must be present on the Linux Pilot host.

There is no retention or repository-maintenance command in `pilot-ops.sh`.
Run maintenance only from a separately secured off-VM identity with delete
rights. The following example applies only to a historical DB-only repository.
Do not apply independent tag-based retention to Documents sets: retain each
manifest together with both exact snapshots it references. A separate reviewed
set-aware retention procedure is required before deleting any component.
Review a dry run before applying the approved historical objective:

```sh
restic forget \
  --host kaul-pilot \
  --tag kaul-pilot-database \
  --keep-within 14d \
  --keep-daily 14 \
  --keep-weekly 8 \
  --keep-monthly 6 \
  --prune \
  --dry-run
```

Use the actual Compose project as `--host`. `--keep-within 14d` is deliberate:
it preserves every recent snapshot even if a compromised writer adds deceptive
timestamps. The off-VM maintainer must inspect the proposed removals, unexpected
snapshot volume, timestamps, hosts, and tags before rerunning without
`--dry-run`. Do not give these credentials to the Pilot VM.

Restore never overwrites or cleans a database. It accepts only a nonexistent
name beginning with `kaul_restore_`:

```sh
scripts/pilot-ops.sh restore \
  --env-file /etc/kaul/pilot.env \
  --snapshot EXACT_64_CHARACTER_SNAPSHOT_ID \
  --database kaul_restore_20260819
```

The script never accepts `latest`. It verifies the exact snapshot and archive,
proves the destination is absent, creates it empty, streams that same snapshot
through a private FIFO into one transaction, reads the migration table, and runs
Prisma migration status against the restored database. It does not change the
active `DATABASE_URL`, leave a completed plaintext dump, or delete a failed
destination.

Start the approved image privately against that restored database with:

```sh
scripts/pilot-ops.sh start-restore-check \
  --env-file /etc/kaul/pilot.env \
  --database kaul_restore_20260819 \
  --storage-root /srv/kaul-restores/EXACT_RESTORE_NAME
```

The root must be separately prepared, outside active Documents storage, with
verified `objects` and empty `quarantine` directories. It is mounted read-only.
The protected command validates the unchanged active Pilot environment, derives
the restored database URL internally, rechecks migration status, and starts a
profile-gated `kaul-restore-check` service only on the internal Compose network.
It does not replace the active Kaul container, change Caddy, publish a port, or
route public traffic to the restore. Do not copy or modify the Pilot environment
file and do not use raw Docker Compose for this check.

The command waits for the restored application's database-backed health check.
That check rejects pending legacy Personnummer plaintext and authenticates one
representative envelope for every stored version/key-ID pair. A missing key or
a correctly sized but incorrect key under the same ID therefore keeps the
restore check unhealthy; it does not decrypt every Personnummer on each probe.
This proves image, database, and configured-key startup compatibility only. It
does not prove login, authorisation, history, audit, or stakeholder acceptance
without a separately reviewed private interactive-access method.

Stop and remove only the private application container after inspection:

```sh
scripts/pilot-ops.sh stop-restore-check \
  --env-file /etc/kaul/pilot.env
```

The restored database is preserved. Promotion remains a separate recorded
recovery decision. Never restore over the active database.

## Combined Documents backup and isolated restore

KAUL-222 completed repository and disposable CI verification. These are future
owner operations: all release and owner gates in the execution board and
attended procedure must pass before any live transition.

Before an outage, install the repository-pinned Node 24 runtime and prove actual
Restic authentication in the protected operator context. Prepare separate empty
restore storage with the approved numeric ownership and permissions. Never use
active storage or a parent/child of it as the restore root.

```sh
scripts/pilot-ops.sh quiesce --env-file /etc/kaul/pilot.env
scripts/pilot-ops.sh backup-documents-set --env-file /etc/kaul/pilot.env
```

The capture requires confirmed stopped Kaul and Caddy. It compares immutable
objects with PostgreSQL metadata, streams the database archive, captures only
`objects`, and stores an encrypted manifest binding their exact snapshot IDs,
source revision, applied migrations, object sizes and hashes. It verifies the
Restic catalogs and restored object bytes before reporting success. Quarantine
contents are excluded. Services remain stopped; failure is not permission to
restart or delete partial evidence.

`applicationGitSha` declares the recovery/verification image; it does not prove
which image last wrote every row. Standalone `backup` and `backup-documents-set`
use the approved `KAUL_IMAGE` selected in the protected environment. In the
post-migration/pre-start sequence, that is the new image which ran the migration
and conversion, even if an old stopped application container remains. Internal
pre-update/pre-migration/pre-conversion captures use the current container image
when available, retaining its recovery identity. The manifest also records the
actual applied migration names. The owner must select and prove a compatible
recovery image; a revision label by itself is not compatibility evidence.

Use the exact full manifest snapshot ID reported by successful capture:

```sh
scripts/pilot-ops.sh validate-documents-set \
  --env-file /etc/kaul/pilot.env \
  --manifest-snapshot EXACT_64_CHARACTER_MANIFEST_SNAPSHOT_ID

scripts/pilot-ops.sh restore-documents-set \
  --env-file /etc/kaul/pilot.env \
  --manifest-snapshot EXACT_64_CHARACTER_MANIFEST_SNAPSHOT_ID \
  --database kaul_restore_EXACT_NAME \
  --storage-root /srv/kaul-restores/EXACT_RESTORE_NAME
```

Validation reads only the manifest-selected snapshots. Restore refuses an
existing database or nonempty root and preserves a failed destination. It
compares restored metadata, migrations and object bytes. `validate-documents-set`
alone checks the archive and objects; it does not execute the restored database
or prove application behavior. Use the isolated restored database and root for
`start-restore-check`, retained-key and actual allowed/denied download proof.
An empty quarantine directory supports read-only application initialization;
source quarantine is never restored. Keep the active environment unchanged.

The [owner-attended acceptance procedure](UNIFIED_CANDIDATE_ACCEPTANCE.md)
records conversion ordering, private checks, recovery and deliberate startup.
Neither a valid manifest nor a healthy container waives those gates.

## Small operational loop

- Use an external HTTPS uptime check against `/api/health`; it intentionally
  discloses only `ok` or `unavailable`.
- Alert on container health, failed scheduled backups, certificate renewal,
  Documents storage capacity, and host disk space. Review quarantine growth,
  `docker system df`, and filesystem capacity.
- Compose limits each service to five 10 MB JSON log files. Logs are operational
  evidence, not records: never log Client names, Journal content, credentials,
  cookies, request bodies, or database URLs.
- Schedule an explicitly quiesced combined backup window for Documents; the
  operator does not reopen ingress after capture. Approve the deliberate
  restart and failure handling as part of that window. Schedule backup work only after the
  encrypted off-host destination, writer role, offline recovery material,
  retention-maintainer role, schedule, and alert target
  are approved. A timer without failure notification is not an accepted backup.

No Prometheus, Grafana, Elasticsearch, Loki, or other observability platform is
required for this Pilot.

## Incident and data rule

If anyone enters real or sensitive information, stop using the environment.
Do not improvise deletion, copying, or disclosure. Preserve necessary evidence
without spreading the data, restrict access, notify the named Pilot incident
owner, assess scope, rotate exposed credentials where applicable, and follow
the organisation's approved incident procedure. That owner and procedure must
be named before users receive access.

## Server facts still required

Before any real Pilot deployment, record and review:

- VM operating system, CPU/RAM/disk, Docker/Compose versions, patch ownership,
  time synchronization, and restart behavior.
- Pilot hostname, public IP/CGNAT status, DNS control, direct-Caddy decision,
  router/firewall rules, SSH source restrictions, and ports already in use.
- Disk capacity thresholds, encrypted off-host Restic backend, append-only
  enforcement, independent writer and maintenance identities, offline recovery
  material, retention, restore-test schedule, and failure contacts.
- Pilot operator, support contact, incident owner, user list, credential
  delivery, outage communication, and the date Pilot data/backups are removed.

## Deliberate deferrals and gates

This repository slice does not configure a VM, DNS, Cloudflare, firewall,
router, SSH, monitoring provider, real off-host backup provider, or automatic
deployment. It does not add a quarantine scheduler, structured application-log
refactoring, zero-downtime migration, or multiple replicas.

Pilot launch still requires live HTTPS/network proof, scheduled encrypted
off-host backups with alerts, a successful clean restore rehearsal, critical
browser checks, named operational/incident ownership, and independent security
review. Sensitive production additionally remains blocked by Milestone 8,
hosting/legal/privacy review, credential delivery, sole-Administrator recovery,
retention, disaster recovery, monitoring, and explicit system-owner approval.
