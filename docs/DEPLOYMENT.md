# Kaul Deployment

## Initial Administrator audit recovery

Recover one unresolved bootstrap operation with:

```text
npm run bootstrap:admin:recover -- <operation-uuid>
```

Under the bootstrap advisory lock, recovery requires the exact compatible
audit operation and proves that Organisation, User, and Account counts are all
zero and that the planned Organisation does not exist. Any difference fails
closed. Recovery records only a reviewed failed result; it never creates an
Administrator. Run `npm run bootstrap:admin` separately afterward to create a
new operation UUID.

Version: 0.1

---

## Purpose

This document defines the initial deployment strategy for Kaul.

The deployment approach should remain:

- Simple
- Portable
- Secure
- Low cost
- Easy to understand
- Easy to migrate
- Appropriate for a small Version 1 system

Kaul must not depend on one hosting provider, one home network, or Proxmox-specific functionality.

---

## Deployment Principles

Kaul follows these deployment principles:

- Build one portable application image.
- Use the same application architecture in every environment.
- Keep configuration outside source code.
- Keep secrets outside Git.
- Store persistent data outside disposable containers.
- Use PostgreSQL in every environment.
- Keep uploaded files separate from application code.
- Make backups portable.
- Document every operational step.
- Avoid infrastructure that is unnecessary for a small system.

Version 1 does not require:

- Kubernetes
- Multiple application servers
- Load balancing
- Microservices
- Dedicated database clusters
- Complex deployment platforms
- Cloud-provider-specific application code

---

## Supported Environments

Kaul uses three separate environments:

- Development
- Pilot
- Production

Each environment uses separate:

- Databases
- Credentials
- Secrets
- File storage
- Configuration
- User accounts

Data must not be copied between environments unless there is a documented and safe reason.

Production data must never be copied into development.

---

# Development Environment

## Purpose

The development environment is used for implementation, automated testing, and experimentation.

It runs on the developer's computer.

## Expected Components

The development environment includes:

- Next.js application
- PostgreSQL
- Prisma
- Local persistent file storage
- Docker Compose where appropriate
- Development-only fictional data
- Local test tooling

## Development Rules

- Use fictional Swedish test data.
- The database may be reset freely.
- Development secrets must not be reused elsewhere.
- HTTPS is not required for ordinary localhost development.
- Caddy is not required unless deployment behaviour is being tested.
- Development uploads must remain outside Git.
- Local environment files must remain ignored by Git.
- PostgreSQL should use the same major version intended for pilot deployment.
- The application should be runnable using documented commands.

## Expected Development Command

The final command structure may be refined during bootstrapping, but development should remain straightforward.

A typical workflow may be:

```powershell
docker compose up -d database
npm install
npm run dev
```

The project should not require multiple undocumented manual setup steps.

## Initial Administrator Bootstrap

The repository-owned bootstrap command generates the initial Administrator's
temporary credential; the operator does not choose or supply it. The credential
is shown exactly once after a successful database commit, expires after 24 hours,
and must be changed before normal application access.

The command is only for a completely empty installation. It refuses when either
an Organisation or User already exists and is not a repair or recovery tool.

The credential-delivery channel and sole-Administrator recovery procedure still
require organisational approval. `INITIAL_ADMIN_CREATED` is persistently audited
in the current implementation; terminal output is not treated as an audit event.
The unresolved operational controls still block sensitive production use.

---

# Homelab Pilot Environment

## Purpose

The pilot environment allows the initial users to evaluate Kaul before professional production hosting is selected.

The first pilot will run on the existing Proxmox homelab.

The pilot is temporary and is not automatically approved for sensitive production information.

This is Phase 1: invited stakeholders test real Kaul workflows on the owner's
existing Ubuntu VM through a personal domain or subdomain, using only fictional,
sanitised, or otherwise non-sensitive case data. Phase 2 is the separate
Production / Cloud Launch governed by Milestone 8.

## Pilot Architecture

The expected pilot deployment is:

```text
Internet
   ↓
Home router and firewall
   ↓
Existing Nginx Proxy Manager (public TLS)
   ↓ private LAN, restricted to the NPM peer
Caddy reverse proxy on the Kaul VM
   ↓
Kaul application container
   ↓
PostgreSQL container

Kaul application
   ↓
Persistent uploaded-file storage

Database and file storage
   ↓
Encrypted off-host backups
```

## Pilot Host

Kaul should run inside the existing Ubuntu Linux virtual machine on Proxmox
unless later inspection finds a concrete incompatibility or unsafe shared use.
Do not provision a replacement merely to obtain a fresh host.

The pilot should not run directly on the Proxmox host.

Recommended operating system:

- Supported Ubuntu Server LTS release

The virtual machine should be dedicated to Kaul or clearly isolated from unrelated experimental services.
The supported preparation floor is Ubuntu 22.04, 24.04, or 26.04 LTS on
x86-64/amd64, 2 vCPUs, 4 GiB RAM, and at least 20 GiB free for both Docker data
and the deployment checkout. These are starting floors, not capacity evidence;
disk and memory alerts and observed Pilot load remain required.

A dedicated VLAN is optional. The minimum boundary may instead be supplied by
the private VM address, a Caddy listener bound only to that address, an exact
NPM-source allow rule implemented where Docker-published traffic is filtered,
restricted SSH, and denied access to Proxmox, router, NPM, NAS, and unrelated
homelab management services. Docker-published ports can bypass ordinary UFW
input rules, so UFW configuration alone is not proof of this boundary.
Because Docker access is effectively root-level host authority, the dedicated
operator account must be key-only, source-restricted, and unavailable through
public SSH.

The read-only `scripts/pilot-ops.sh host-preflight` command checks the
automatable host floor without installing, reconfiguring, or deploying
anything. Current package-patch status, firewall effectiveness, NPM behavior,
prohibited management access, and reboot persistence require later runtime
evidence.

## Pilot Services

The pilot Docker Compose deployment is expected to include:

- Application
- PostgreSQL
- Caddy

Additional services should be introduced only when required.

## Homelab ingress and future provider mode

Nginx Proxy Manager owns public ports 80/443 and public certificate renewal for
the Homelab Pilot. The router continues forwarding those ports to NPM, not the
Kaul VM. NPM forwards the exact Pilot hostname by private HTTP to Caddy,
normally on TCP 8080 bound to the VM's private-LAN address. PostgreSQL and SSH
are not part of this ingress path.

The real NPM network peer is a required deployment input established by later
runtime inspection. The NPM-to-Caddy listener accepts only that Caddy-observed
peer's exact `/32`; the same peer controls the firewall or equivalent allow
rule. Forwarded headers never grant access to the listener. Caddy uses strict
right-to-left parsing of NPM's appended `X-Forwarded-For`,
then replaces the Host, `X-Forwarded-Proto`, `X-Forwarded-For`, and
`X-Real-IP` values sent to Kaul. This preserves the public HTTPS origin and a
non-spoofable rate-limit identity. The installed NPM version and generated
header configuration must be inspected and tested before exposure.

The deployment selects this path with `PILOT_INGRESS_MODE=npm`. The separate
`public` mode publishes Caddy 80/443 and lets Caddy own ACME and redirects for a
future provider. The Kaul application, private application port, database,
session configuration, and data model do not fork between these modes. See ADR
0002 and `deploy/pilot/README.md` for the exact boundary.

For the Homelab Pilot, the private HTTP hop is accepted because public TLS
terminates at NPM, the path stays on the trusted private homelab network,
Caddy's listener is not Internet-reachable and accepts only the verified NPM
peer, forwarded metadata is processed through the strict trust model, and both
Kaul and PostgreSQL remain unpublished. Internal PKI or mTLS is not required
without evidence that this hop crosses an untrusted boundary.

Outbound restrictions must follow observed need. Inventory required external
dependencies during preparation and runtime inspection; restrict genuinely
required destinations or classes where practical; and document any broad HTTPS
egress that remains necessary. Do not break legitimate application behavior to
satisfy an unverified theoretical allowlist. Homelab management services remain
outside the permitted dependency set.

## Pilot Warning

The application must display:

> Pilotmiljö – använd inte verkliga personuppgifter eller känslig information.

The warning must remain visible during pilot use.

## Pilot Rules

- Use individual user accounts.
- Use HTTPS.
- Do not expose PostgreSQL publicly.
- Do not expose Proxmox through the Kaul domain.
- Do not expose container-management interfaces publicly.
- Use separate pilot credentials and secrets.
- Use automatic backups.
- Keep at least one backup outside the pilot virtual machine.
- Restrict SSH access.
- Use SSH keys rather than password login where practical.
- Install security updates regularly.
- Document outages and incidents.
- Explain pilot limitations clearly to the users.
- Assume users may accidentally enter sensitive information despite the warning.

## Pilot data durability and migration

Pilot infrastructure is disposable. Pilot PostgreSQL application data should
remain migratable where reasonably possible. Preserve stable identifiers and
use committed Prisma migrations, portable PostgreSQL logical backups, and the
same immutable application image during a first restore. Accounts, Clients,
Assignments, Journal history, Goals, Follow-ups, and audit evidence should move
together when compatibility and security checks pass.

Perfect preservation is not guaranteed: a controlled reset may be safer when
integrity, compatibility, or security evidence is insufficient. Do not add
homelab-specific application code or storage coupling that would make the
eventual provider migration unnecessarily difficult. The later Milestone 6
organisation export is not required merely to prove database portability for
the Pilot.

---

# Production / Cloud Environment

## Purpose

The production environment is used for live organisational information after the production-readiness milestone has been approved.

Production should run on a professional external provider located in Sweden or the European Union, subject to business, legal, and security review.

## Initial Production Shape

The first production deployment may remain small:

```text
External Linux host
├── Caddy
├── Kaul application
├── PostgreSQL
└── Persistent file storage
```

A single appropriately secured host may be sufficient for the initial user count.

Managed database or object-storage services may be introduced later when their operational value justifies the additional cost and complexity.

## Production Requirements

Production requires:

- Approved hosting provider
- HTTPS
- Secure secret storage
- Restricted network access
- Automatic database backups
- Automatic uploaded-file backups
- Off-host backup copies
- Restore testing
- Monitoring
- Documented support responsibility
- Documented incident handling
- Documented retention policy
- Security review
- Production launch approval

The homelab must not remain the authoritative production host after professional hosting is approved.

---

## Container Strategy

Kaul uses Docker for repeatable development and deployment.

Docker Compose coordinates the initial services.

## Expected Services

### Application

Runs the Next.js application.

Responsibilities:

- User interface
- Authentication
- Authorisation
- Domain operations
- Document access
- Report generation
- Export generation
- Audit-event creation

### PostgreSQL

Stores structured application information.

Responsibilities:

- Users
- Clients
- Assignments
- Journal entries
- Goals
- Follow-ups
- Document metadata
- Reports
- Audit events

### Caddy

Provides Kaul's application-facing web entry point.

Responsibilities:

- HTTPS certificates and HTTP-to-HTTPS redirection when Caddy is the public edge
- Reverse proxying
- Selected security headers
- A stable boundary in front of the private Kaul application

## Container Rules

- Production secrets must not be built into images.
- Persistent data must use explicit storage.
- Application containers must be replaceable without data loss.
- Uploaded files must not live only inside the application container.
- PostgreSQL data must not live inside the application container.
- Containers should run with minimal privileges.
- Images should use pinned supported versions.
- Health checks should be configured.
- Only required services should be publicly exposed.

---

## Network Exposure

Only the selected public web edge should be reachable from the internet.

In the Homelab Pilot, router ports 80/443 terminate at NPM. The Kaul VM exposes
no public port and publishes only its reviewed private NPM-to-Caddy binding.

When Caddy becomes the public edge in a future provider, its expected public
ports are:

- `80` for HTTP redirection and certificate handling
- `443` for HTTPS

SSH should be restricted as much as practical.

PostgreSQL should be reachable only through the private Docker network or approved administrative access.

The following must not be publicly exposed:

- PostgreSQL
- Prisma Studio
- Proxmox
- Docker daemon
- Portainer
- Backup interfaces
- Internal health endpoints containing sensitive details

Firewall rules should deny unnecessary inbound access.

---

## Domain and HTTPS

Kaul will eventually use a customer-approved domain.

Suggested structure:

```text
app.example.se
```

A pilot may use:

```text
pilot.example.se
```

## Domain Rules

- The domain must point only to the intended reverse proxy.
- Proxmox must use a separate management address.
- Internal administration services must not share the public Kaul route.
- DNS changes must be documented during migration.
- Certificate renewal should be automatic.
- HTTP should redirect to HTTPS.
- Production cookies must require secure HTTPS transport.

---

## Environment Configuration

Environment-specific configuration must use environment variables.

Expected variables include:

```text
APP_URL
DATABASE_URL
AUTH_SECRET
STORAGE_PROVIDER
STORAGE_PATH
LOG_LEVEL
SMTP_HOST
SMTP_PORT
SMTP_USER
SMTP_PASSWORD
BACKUP_TARGET
```

The exact names will be defined during implementation.

## Configuration Rules

- Commit `.env.example`.
- Do not commit real `.env` files.
- Validate required variables at startup.
- Use different secrets in every environment.
- Do not hard-code domains, IP addresses, file paths, or credentials.
- Do not require source-code changes when moving between supported environments.
- Back up necessary non-secret configuration documentation.
- Store production secrets in an approved secret-management method.
- Keep the Personnummer keyring outside Git and outside the database backup.
  Supply only its file path to Kaul, mount the file read-only for the non-root
  application identity, and retain every old key required by live rows or
  retained backups. See [ADR 0003](decisions/0003-personnummer-envelope-encryption.md).

---

## Persistent Data

Kaul has two primary persistent data categories:

- PostgreSQL data
- Uploaded and generated files

Both must survive:

- Container restart
- Container replacement
- Application upgrade
- Host reboot

## Database Persistence

PostgreSQL uses an explicit persistent volume or mounted storage location.

The database must not depend on an anonymous disposable volume.

## File Persistence

Uploaded and generated files use persistent storage outside the application image.

Pilot storage may be local to the host through a configured storage path.

Future production storage may use:

- Local persistent disk
- S3-compatible object storage
- Azure Blob Storage
- Another approved provider

Storage changes must not require changing the domain model.

---

## Database Migrations

Prisma migrations are the approved schema-migration mechanism.

## Migration Process

A deployment containing database changes should:

1. Create or verify a current backup.
2. Review the generated migration.
3. Apply the migration using the documented production command.
4. Confirm migration success.
5. Start or update the application.
6. Run health checks.
7. Verify critical workflows.
8. Record deployment results.

## Migration Rules

- Applied shared migrations must not be rewritten.
- Destructive changes require explicit review.
- High-risk migrations require a tested rollback or recovery plan.
- Production schema changes must not be made manually without documentation.
- Migrations should be tested against realistic fictional data before pilot or production deployment.

---

## Application Deployment

The intended deployment process should remain small and understandable.

A typical future deployment may be:

1. Pull the approved Git commit.
2. Build the application image.
3. Apply database migrations.
4. Start updated containers.
5. Run health checks.
6. Verify login.
7. Verify one authorised client workflow.
8. Verify denied access.
9. Review application logs.
10. Record the deployed version.

The exact commands will be documented after the project is bootstrapped.

Deployment should use a tagged Git commit or clearly identified commit hash.

---

## Versioning

Every deployment should be traceable to a specific repository state.

Kaul should expose a safe application version or commit identifier to administrators or operators.

The version display must not expose secrets or sensitive environment details.

Deployment records should include:

- Date
- Environment
- Version or commit
- Operator
- Migration status
- Result
- Known issues

---

## Health Checks

The deployment should provide health checks for:

- Application availability
- Database connectivity
- Required storage availability

Health checks should not expose:

- Credentials
- Stack traces
- Client information
- Internal database details
- Sensitive configuration

Public health checks should return only minimal status information.

Detailed diagnostic checks should require authorised administrative access.

---

## Logging and Monitoring

The deployment should provide enough operational visibility to identify failures without duplicating sensitive records.

## Logging Requirements

- Structured server-side logs
- Configurable log level
- No full journal content
- No passwords or tokens
- No uploaded-file content
- No complete personal identifiers
- Safe correlation identifiers where useful

## Pilot Monitoring

The pilot should include simple uptime monitoring.

Monitoring should confirm:

- The public site responds.
- HTTPS remains valid.
- The application is reachable.
- The VM has adequate disk space.
- Backups complete successfully.

Complex observability platforms are not required for Version 1.

---

## Backup Strategy

Backups must cover:

- PostgreSQL
- Uploaded files
- Generated final documents
- Required deployment configuration
- Documentation necessary for recovery

## Pilot Backup Plan

The pilot should use:

- Automatic daily PostgreSQL backups
- Automatic daily file backups when uploaded or generated file storage is in
  pilot scope
- Encrypted backup archives
- At least one copy outside the Kaul VM
- At least one copy separated from the live application credentials
- Documented retention
- Periodic restore testing

Proxmox snapshots may be used as an additional recovery layer.

They are not a replacement for portable database and file backups.

The Pilot operator foundation uses pinned Restic 0.19.1 with an explicit remote
repository and separate encryption-password file. It streams PostgreSQL custom
format directly through `restic backup --stdin-from-command`; no completed
plaintext dump is written on the application host. Restic cancels publication
when `pg_dump` fails. Validation and restore require one exact full snapshot ID
and stream through a private FIFO; `latest` is forbidden.

The VM holds only a backup-writer identity with create/read access. It must not
be able to delete, overwrite, forget, or prune history. Repository retention and
maintenance run from a separate secured off-VM identity. Offline recovery
material is also kept away from the VM. The approved retention objective is 14
daily, 8 weekly, and 6 monthly snapshots, with `--keep-within 14d` added to
protect all recent snapshots from append-only timestamp manipulation.

For the Homelab Pilot, a real encrypted repository outside the Pilot VM, an
append-only writer identity, scheduled backups, failure notification, and an
exact-snapshot restore rehearsal are launch gates. The repository contract and
CI rehearsal do not satisfy that runtime evidence.

Production / Cloud Launch additionally requires an approved provider and data
region, production-separated writer and maintenance credentials, assigned
retention and alert ownership, offline recovery custody, and a production
restore rehearsal. Those production approvals are not silently substituted for
the Homelab evidence above.

## Production Backup Plan

The production plan must define:

- Backup frequency
- Retention period
- Encryption
- Storage location
- Access responsibility
- Failure alerts
- Restore procedure
- Restore-test frequency
- Secure disposal

---

## Restore Process

A backup is not considered valid until it has been restored successfully.

The restore process should support rebuilding Kaul on a clean Linux host.

A complete restore requires:

1. Application version
2. Deployment configuration
3. PostgreSQL backup
4. Uploaded-file backup
5. Required secrets
6. Domain or temporary test route
7. Migration compatibility
8. Verification checklist

## Restore Verification

After restoration, verify:

- Application starts
- Database migrations are consistent
- Users can authenticate
- Client relationships are intact
- Journal records are intact
- Signing information is intact
- Documents can be downloaded
- Reports are available
- Permissions still work
- Audit history is present
- Export generation works

Restore testing must use a controlled environment.

---

## Migration from Homelab to External Hosting

Kaul must be movable without application rewrites.

The intended migration is:

1. Provision the external Linux environment.
2. Install Docker and required host dependencies.
3. Configure production secrets.
4. Deploy the same application version.
5. Create a final homelab database backup.
6. Create a final uploaded-file backup.
7. Transfer backups securely.
8. Restore PostgreSQL.
9. Restore uploaded files.
10. Apply required migrations.
11. Verify application behaviour.
12. Change DNS.
13. Monitor the new environment.
14. Retain the old environment offline for a defined rollback period.
15. Securely remove obsolete data after approval.

## Migration Rules

- Stable identifiers must be preserved.
- User passwords should remain valid unless a security concern requires reset.
- Uploaded-file storage references must remain resolvable.
- DNS cutover should occur only after verification.
- The old host must not remain an undocumented second production environment.
- The migration procedure should be rehearsed before final cutover.

---

## Pilot Deletion Procedure

Because the pilot should not contain real sensitive information, it must be possible to delete the pilot dataset before production.

Deletion may include:

- Pilot PostgreSQL database
- Pilot uploaded files
- Pilot generated reports
- Pilot backups
- Pilot user credentials
- Temporary exports

Deletion must be deliberate and documented.

Backups should not be forgotten when removing pilot data.

---

## Operational Ownership

Before pilot use, identify who is responsible for:

- Linux updates
- Docker updates
- Application deployment
- Database migrations
- Backups
- Restore testing
- Domain and DNS
- HTTPS
- Monitoring
- User account support
- Incident response

During the homelab pilot, Aaron may manage these responsibilities.

Before production, the company must formally decide who owns ongoing operation and support.

Operational responsibility must not remain implicit.

---

## Incident Handling

Deployment incidents may include:

- Application outage
- Database outage
- Disk exhaustion
- Failed migration
- Failed backup
- Lost file storage
- Expired certificate
- Credential exposure
- Unauthorised access
- Home internet or power outage during the pilot

Initial response should:

1. Protect data.
2. Stop further damage.
3. Record the incident.
4. Determine impact.
5. Restore safe service.
6. Verify data integrity.
7. Communicate clearly with affected users.
8. Document follow-up actions.

During pilot use, users must understand that home power and internet outages may temporarily make Kaul unavailable.

---

## Rollback

Deployments should have a documented rollback or recovery path.

Rollback may involve:

- Returning to the previous application image
- Restoring a database backup
- Reverting configuration
- Restoring previous uploaded-file state
- Temporarily taking the application offline

Application rollback and database rollback are not always the same.

A schema migration may make an older application version incompatible.

High-risk deployments therefore require explicit recovery planning.

---

## Deployment Security Checklist

Before exposing an environment:

- HTTPS is active.
- Required secrets are present.
- Default passwords have been removed.
- Public registration is disabled.
- PostgreSQL is not public.
- Proxmox is not public through Kaul.
- SSH access is restricted.
- Firewall rules are active.
- Secure cookies are enabled.
- Environment variables are validated.
- Uploaded files are not public.
- Backups are active.
- Restore documentation exists.
- Pilot or production warning state is correct.
- Monitoring is active.
- No development tooling is publicly exposed.
- No fictional default credentials remain unless intentionally required for development only.

---

## Homelab Pilot Deployment Gate

The pilot may begin only when:

- The unchanged dependency-audit policy passes and every other Milestone 7
  security decision is resolved.
- A supported Ubuntu VM is dedicated to or clearly isolated for Kaul, with
  restricted SSH, host/router firewall rules, and no route exposing Proxmox or
  unrelated homelab services.
- The existing VM passed the automated host preflight, and its Docker-aware
  firewall permits the private Caddy listener only from the exact NPM peer.
- The installed NPM version and generated Proxy Host configuration preserve the
  exact Pilot Host, public HTTPS scheme, and appended client address; spoofed
  forwarding headers and direct non-NPM LAN access are denied in runtime tests.
- The workflows selected for the controlled pilot are complete and verified.
- Deferred Documents, reports, global search, exports, and uploaded-file
  operations are required only if the approved pilot workflow genuinely needs
  them; pilot users may instead help determine whether they are blocking needs.
- Critical authentication and permission tests pass.
- HTTPS works.
- The pilot warning is visible.
- Separate pilot credentials are configured.
- Backups run successfully.
- A restore test has succeeded.
- Deployment, redeployment, Prisma migration, failure recovery, application
  upgrade, and host reboot/startup behaviour have been rehearsed on a clean VM
  or equivalent Linux/Docker environment.
- The deployed image is identified immutably and a safe update records the old
  and new image identities plus its exact pre-update backup snapshot.
- Portable PostgreSQL restore evidence preserves stable identifiers and useful
  application relationships for a future provider migration.
- PostgreSQL is private.
- Uploaded-file access is protected when uploads are in pilot scope.
- Pilot users understand the limitations.
- Basic health checks, bounded logs, uptime monitoring, backup-failure alerts,
  disk-capacity checks, incident contact, and Pilot operational ownership are
  active.
- No known critical security defect remains.

---

## Production / Cloud Deployment Gate

Production may begin only when:

- Milestone 8 is approved.
- Every applicable Milestone 7 and release dependency/provenance gate remains
  satisfied.
- The hosting provider is approved.
- The managed or self-managed production database design is approved.
- Legal and privacy responsibilities are reviewed.
- Data residency is approved.
- Production secrets are configured securely.
- Backup writer, maintenance, application, and database credentials are
  separated.
- Production backups are working.
- The real off-host backup backend enforces the approved immutable or
  append-only model, with assigned retention and alert ownership and offline
  recovery material.
- Disaster recovery has been tested.
- Monitoring and incident response are active.
- Critical security tests pass.
- The application has been migrated successfully in a rehearsal.
- The responsible system owner approves launch.

---

## Deployment Decision Test

Before adding infrastructure or changing deployment architecture, ask:

1. What demonstrated operational problem does it solve?
2. Can the current Docker-based deployment solve the need?
3. Does it add another service to secure and monitor?
4. Does it increase monthly cost?
5. Does it reduce portability?
6. Does it create provider lock-in?
7. Can Aaron operate it safely?
8. Is it necessary for the current milestone?
9. Does it improve backup or recovery?
10. Is the simpler option sufficient?

The default should be the smallest secure deployment that satisfies current needs.

---

## Current Homelab Pilot status

The deployment strategy is approved for development planning. The repository
now contains the first **Homelab Pilot Readiness** deployment foundation: a release
Dockerfile, separate Caddy/Kaul/PostgreSQL Compose topology, secret-free Pilot
environment contract, digest-only manual update flow, one-shot migrations, and
guarded encrypted off-host Restic backup/restore tooling. The exact operator commands and
remaining gates are in `deploy/pilot/README.md`.

The prepared Homelab topology now reflects the actual environment: the existing
NPM installation remains the public TLS edge, while mode-selected Caddy
configuration preserves Kaul's native proxy and future direct-public provider
path. Repository validation is not evidence that the existing VM, NPM headers,
firewall, DNS, certificate, or private peer identity are configured correctly.

Homelab Pilot Readiness is not complete and no pilot deployment is approved yet. The
repository contract and CI rehearsal do not configure or prove a real off-host
provider. Existing-VM inspection, NPM/HTTPS and trusted-proxy verification,
network enforcement, scheduled append-only backup, alerting,
off-VM retention, exact-snapshot restore, monitoring, incident ownership, and
user-workflow evidence must still be obtained with fictional or sanitised data
before a controlled Pilot begins.

The repository-owned Gate C firewall operator, Docker start hooks, fixed timed
rollback units, exact commands, and three-perspective verification procedure
are documented in `deploy/pilot/firewall/README.md`. Its digest-pinned nested
Docker rehearsal can prove Docker 29.7.2 DNAT/`DOCKER-USER` behavior and daemon
restart behavior, including the pre-start canonical `FORWARD -> DOCKER-USER`
transfer that prevents restart-policy publication before filtering and is
removed with Gate C while foreign rule order is preserved. A separate
disposable systemd rehearsal proves bounded post-start failure plus explicit,
idempotent, and independently timed rollback ordering: the outer operation
requests socket shutdown first, systemd performs inverse dependency stop
ordering for the service and socket, and the returned transaction is followed
by final inactivity proof for both units. Stop-post only submits a nonblocking
socket-stop job and retains the exact guard. A repository-owned, digest-pinned,
eight-minute Gate C-only workload can
temporarily create the reviewed private `:8080` bridge publication before any
Pilot deployment. Rule inspection, live rejection from an unauthorised LAN
host, and a successful request originating from NPM remain three distinct
proofs. Neither rehearsal nor that workload can prove the real VM's installed
units, Docker boot/reboot
timing, UFW state, NPM-observed peer, or physical network path; those remain
manual Homelab gates.
The Gate C policy itself is non-secret and independent of the complete
`pilot.env`, so it may be prepared and verified first. The later deployment
preflight remains strict and cross-checks the installed policy against the
complete Pilot environment's project, `npm` ingress mode, private bind, and
trusted NPM `/32`.
The installation gate therefore stops Docker before activating its drop-in,
requires enabled/live UFW with the exact reviewed user rule for every subsequent
Docker start, and requires manual
before/after attribution of UFW plus the full native nftables ruleset. Any
broader SSH allow or unattributed native hook, NAT, forwarding, or relevant-port
rule blocks installation, timer cancellation, restart acceptance, and reboot
acceptance.

## Current Production / Cloud status

Production hosting, database operations, data residency, credential separation,
retention and alert ownership, offline recovery custody, production restore,
release provenance approval, and sensitive-data launch approval have not yet
been selected or completed. Milestone 8 has not begun.
