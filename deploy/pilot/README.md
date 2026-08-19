# Kaul Pilot operator runbook

This repository foundation supports a small production-like Pilot stack. It
does **not** deploy Kaul, approve a homelab, or permit real Client data.

> Pilotmiljö – använd inte verkliga personuppgifter eller känslig information.

Only fictional or sanitized data is allowed. Kaul is not approved for
sensitive production use.

## Topology

```text
Internet
  -> host ports 80/443
  -> Caddy
  -> internal-only Compose network
       -> Kaul :3000
       -> PostgreSQL :5432
```

Only Caddy publishes host ports. Kaul uses a dedicated non-superuser database
role. PostgreSQL, Kaul, Docker, and Proxmox must not be exposed publicly.
PostgreSQL data and Caddy certificate state use named persistent volumes. There
is no file/upload volume because Client Documents are not implemented.

## Files and secrets

- `compose.pilot.yaml` defines the Pilot services separately from development.
- `Caddyfile` defines HTTPS and the conservative reverse proxy.
- `pilot.env.example` is a secret-free contract, not a usable environment.
- `scripts/pilot-ops.sh` provides preflight, backup, restore, migration, and
  update commands.

Copy `pilot.env.example` to an operator-controlled path outside the repository,
for example `/etc/kaul/pilot.env`. Set ownership to the Kaul operator and mode
`0600`. Use distinct, high-entropy, random URL-safe values for all three
secrets. Both PostgreSQL passwords must contain at least 32 characters. Never
paste the rendered Compose configuration into tickets or logs because it
contains environment values.

`KAUL_IMAGE` must be a GHCR image pinned by `@sha256:<digest>`. Tags help humans
find a release, but the Pilot is promoted by digest. The image label
`org.opencontainers.image.revision` identifies its Git commit:

```sh
docker image inspect --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}' \
  ghcr.io/example/kaul@sha256:REPLACE
```

## GHCR access and post-publication gate

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

## Proxy and client IP boundary

The initial approved shape is direct Caddy with DNS-only records. Caddy
overwrites `X-Real-IP` with its direct peer address. Kaul trusts only that
header for authentication rate limiting, and its application port is private.
A browser therefore cannot supply a trusted identity header itself.

Do not enable Cloudflare proxying without a separate trusted-proxy review. In
the current conservative configuration, Cloudflare would become the direct
peer: spoofing remains blocked, but many users could share one rate-limit IP.
Any future change must pin reviewed Cloudflare CIDRs, ignore forwarded headers
from every other peer, and regression-test the Kaul rate-limit identity.

## Initial bootstrap

The future VM needs a supported Linux release, Docker Engine with Compose v2,
restricted SSH, host firewall rules, working DNS, inbound 80/443, `perl` with
its core `Fcntl` module, and the ordinary `realpath`, `mktemp`, and checksum
utilities. The operator must be able to create the lock file beside the
protected Pilot environment file. Then:

1. Validate configuration and start only PostgreSQL.

   ```sh
   scripts/pilot-ops.sh preflight --env-file /etc/kaul/pilot.env
   docker compose --env-file /etc/kaul/pilot.env -f compose.pilot.yaml up -d postgres
   ```

2. Apply committed migrations once, while Kaul remains stopped. The command
   creates and validates a pre-migration backup even for the empty database.

   ```sh
   scripts/pilot-ops.sh migrate \
     --env-file /etc/kaul/pilot.env \
     --backup-dir /var/backups/kaul
   ```

3. Create the initial Administrator exactly once with the selected image,
   protect the one-time credential, then start the stack.

   ```sh
   docker compose --env-file /etc/kaul/pilot.env -f compose.pilot.yaml \
     run --rm --no-deps kaul npm run bootstrap:admin
   docker compose --env-file /etc/kaul/pilot.env -f compose.pilot.yaml up -d
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
  --env-file /etc/kaul/pilot.env \
  --backup-dir /var/backups/kaul
```

The script reports the current and target images and pulls the digest while the
verified current release is still serving. It then stops Caddy, stops Kaul,
creates and validates a quiesced custom-format PostgreSQL backup and SHA-256
checksum, applies committed Prisma migrations, verifies migration status,
starts the new app privately, and waits for its database-backed health check.
Caddy is started only after Kaul is healthy.

If Caddy cannot be stopped, the update does not continue. If Kaul cannot be
confirmed stopped, Caddy remains stopped and the update does not continue. If
the quiesced backup fails, both remain stopped and no migration starts.

If migration or Kaul startup fails, Kaul and Caddy remain stopped. If the new
app is unhealthy, it is stopped and Caddy remains stopped. If Caddy itself
cannot be restarted after Kaul is healthy, Kaul remains private and the Pilot
remains unavailable. Preserve the backup, container logs, target digest, and
migration output. Do not invent down migrations or blindly start the old
application: schema and application rollback are separate decisions.

After success, independently verify public HTTPS, login, an allowed and denied
workflow, safe logs, and disk capacity. Record the operator, time, old and new
digests, backup path/checksum, migration result, health result, and known
issues.

## Backup and restore

Create and validate a logical backup:

```sh
scripts/pilot-ops.sh backup \
  --env-file /etc/kaul/pilot.env \
  --backup-dir /var/backups/kaul

scripts/pilot-ops.sh validate-backup \
  --env-file /etc/kaul/pilot.env \
  --archive /var/backups/kaul/kaul_pilot_TIMESTAMP.dump
```

The archive is PostgreSQL custom format, excludes ownership/ACL statements,
has a companion SHA-256 file, and is tested with `pg_restore --list`. Local
archives are not encrypted by this script. Before Pilot launch, schedule the
backup daily and transfer it through a separately approved encrypted mechanism
to storage outside the VM with independent credentials, retention, and failure
alerting. Proxmox snapshots remain supplemental only.

`backup`, `restore`, `migrate`, and `update` take one exclusive operation lock
for the canonical Pilot environment-file path. The persistent zero-byte
`.pilot-ops.lock` file beside that environment file is only the lock target;
the operating system owns the active lock and releases it automatically on
normal exit, error, or process death. A second workflow fails before Docker or
PostgreSQL mutation. Do not delete or replace the lock file while an operator
workflow is running. The implementation uses Perl's OS-backed `Fcntl` locking,
which is verified by the Git Bash test path and must be present on the Linux
Pilot host.

Backup creation uses an atomic reservation and a unique temporary file. An
existing archive, checksum, or same-name reservation causes an explicit
failure; completed backup evidence is never silently replaced.

Restore never overwrites or cleans a database. It accepts only a nonexistent
name beginning with `kaul_restore_`:

```sh
scripts/pilot-ops.sh restore \
  --env-file /etc/kaul/pilot.env \
  --archive /var/backups/kaul/kaul_pilot_TIMESTAMP.dump \
  --database kaul_restore_20260819
```

The script verifies the checksum/archive, proves the destination is absent,
creates it empty, restores in one transaction, reads the migration table, and
runs Prisma migration status against the restored database. It does not change
the active `DATABASE_URL` or delete a failed destination.

For a controlled recovery or restore rehearsal, keep Kaul stopped, copy the
protected environment file, change only `DATABASE_URL` to the restored name,
start Kaul with that controlled file, and repeat health, login, authorised,
denied, history, and audit checks. Promote a restored database only through a
recorded recovery decision. Never restore over the active database.

## Small operational loop

- Use an external HTTPS uptime check against `/api/health`; it intentionally
  discloses only `ok` or `unavailable`.
- Alert on container health, failed scheduled backups, certificate renewal,
  and host disk space. Review `docker system df` and filesystem capacity.
- Compose limits each service to five 10 MB JSON log files. Logs are operational
  evidence, not records: never log Client names, Journal content, credentials,
  cookies, request bodies, or database URLs.
- Schedule `pilot-ops.sh backup` with the host's service manager only after the
  paths, encrypted off-host destination, retention, ownership, and alert target
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
- Disk capacity thresholds, encrypted off-host backup destination, independent
  credentials, retention, restore-test schedule, and failure contacts.
- Pilot operator, support contact, incident owner, user list, credential
  delivery, outage communication, and the date Pilot data/backups are removed.

## Deliberate deferrals and gates

This repository slice does not configure a VM, DNS, Cloudflare, firewall,
router, SSH, monitoring provider, encrypted backup destination, or automatic
deployment. It does not add uploads/file backups, structured application-log
refactoring, zero-downtime migration, or multiple replicas.

Pilot launch still requires live HTTPS/network proof, scheduled encrypted
off-host backups with alerts, a successful clean restore rehearsal, critical
browser checks, named operational/incident ownership, and independent security
review. Sensitive production additionally remains blocked by Milestone 8,
hosting/legal/privacy review, credential delivery, sole-Administrator recovery,
retention, disaster recovery, monitoring, and explicit system-owner approval.
