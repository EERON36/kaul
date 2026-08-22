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

# Pilot Environment

## Purpose

The pilot environment allows the initial users to evaluate Kaul before professional production hosting is selected.

The first pilot will run on the existing Proxmox homelab.

The pilot is temporary and is not automatically approved for sensitive production information.

## Pilot Architecture

The expected pilot deployment is:

```text
Internet
   ↓
Home router and firewall
   ↓
Caddy reverse proxy
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

Kaul should run inside a dedicated Linux virtual machine on Proxmox.

The pilot should not run directly on the Proxmox host.

Recommended operating system:

- Supported Ubuntu Server LTS release

The virtual machine should be dedicated to Kaul or clearly isolated from unrelated experimental services.

## Pilot Services

The pilot Docker Compose deployment is expected to include:

- Application
- PostgreSQL
- Caddy

Additional services should be introduced only when required.

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

---

# Production Environment

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

Provides the public web entry point.

Responsibilities:

- HTTPS certificates
- HTTP-to-HTTPS redirection
- Reverse proxying
- Selected security headers
- Public routing to the Kaul application

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

Only the public web service should be reachable from the internet.

Expected public ports:

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

The current Pilot operator foundation creates a guarded PostgreSQL custom
archive on the application host. That completed archive is plaintext and does
not satisfy the encrypted off-host requirements above. Selecting the durable
backup implementation is a security decision: approve the off-host backend and
data location, retention and append-only controls, whether the live VM may
decrypt, key custody and offline recovery, alert ownership, restore schedule,
and pinned tool supply policy before changing the operator contract. Do not
treat a checksum sidecar as encryption or origin authentication.

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

## Pilot Deployment Gate

The pilot may begin only when:

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
- PostgreSQL is private.
- Uploaded-file access is protected when uploads are in pilot scope.
- Pilot users understand the limitations.
- No known critical security defect remains.

---

## Production Deployment Gate

Production may begin only when:

- Milestone 8 is approved.
- The hosting provider is approved.
- Legal and privacy responsibilities are reviewed.
- Production secrets are configured securely.
- Production backups are working.
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

## Current Status

The deployment strategy is approved for development planning. The repository
now contains the first **Pilot Readiness** deployment foundation: a release
Dockerfile, separate Caddy/Kaul/PostgreSQL Compose topology, secret-free Pilot
environment contract, digest-only manual update flow, one-shot migrations, and
guarded PostgreSQL backup/restore tooling. The exact operator commands and
remaining gates are in `deploy/pilot/README.md`.

Pilot Readiness is not complete and no pilot deployment is approved yet. The
local backup archive remains plaintext and therefore is not an approved Pilot
backup. Live VM, HTTPS, network, encrypted off-host backup, restore, monitoring,
incident ownership, and user-workflow evidence must still be obtained with
fictional or sanitised data before a controlled Pilot begins.

Production hosting has not yet been selected or approved.
