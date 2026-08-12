# Kaul Security

## Authentication audit guarantees

Better Auth is the credential, Session, and cookie boundary. Kaul configures
that boundary server-side, uses its Prisma-backed records, and keeps public
signup disabled. Kaul's route and mutation layers add the project-specific
authorisation, credential-state, audit, and response-release rules; they do not
replace Better Auth password handling or Session management.

Sessions have a maximum absolute lifetime of 12 hours from creation. Session
refresh is disabled, and the expiry written for every new Session is limited to
that absolute maximum. This policy applies even if an upstream expiry would be
longer.

Initial Administrator bootstrap persists a `SYSTEM` audit intent before any
Organisation, User, or Account is created. The planned Organisation UUID is
both the audit organisation and target. Creation and the successful outcome
commit in the same locked transaction; definitive rollback is followed by a
durable failed outcome. An unresolved bootstrap operation blocks new bootstrap
attempts until reviewed recovery proves the installation empty.

Forced password change persists a server-owned `PASSWORD_CHANGED` intent before
mutation. Password, forced-change state, sessions, replacement cookies, and the
successful audit outcome share one transaction boundary. Replacement cookies
are released only after commit. Definitive rollback records failure; uncertain
commit state is ambiguous and cannot use a replacement operation identifier.
The current authenticated browser remains signed in through Better Auth's
transactionally committed replacement-session rotation; every pre-change
Session is revoked.

Successful credential verification crosses a trusted Better Auth Session hook
before Session insertion. Kaul then commits a durable `LOGIN_SUCCEEDED` intent,
creates the Session and successful outcome in one Prisma transaction, awaits
captured request-local background work, and releases buffered authentication
cookies only after confirmed commit. This is fail-closed: an audit or
transaction failure returns a generic authentication-unavailable response and
does not release a successful Session cookie. Banned accounts and expired
temporary credentials receive a failed `LOGIN_SUCCEEDED` outcome because
credentials were valid but Session establishment was denied. Pre-trust
invalid-credential failures receive an identity-free `LOGIN_FAILED` outcome:
they have no authenticated actor, organisation, or target identifier. Malformed
input and rate-limit rejections are not individually audited.

Audit target resolution rejects every non-null `resolvedTargetId` when the
action policy forbids a target, including the login and logout vocabulary.

Version: 0.1

---

## Purpose

This document defines the initial security and privacy requirements for Kaul.

Kaul may eventually process sensitive personal information and professional client documentation.

Security must therefore be designed into the application from the beginning rather than added shortly before production deployment.

This document provides engineering requirements. It is not legal advice and does not replace a formal privacy, compliance, or security review before live sensitive data is processed.

---

## Security Principles

Kaul follows these principles:

- Deny access by default.
- Grant only the access required for a user's role and assignments.
- Enforce security rules on the server.
- Treat all browser input as untrusted.
- Minimise the amount of personal information collected and exposed.
- Keep secrets outside source control.
- Preserve historical and audit integrity.
- Prefer maintained security libraries over custom implementations.
- Keep development, pilot, and production data separate.
- Make backup and recovery part of security.
- Never rely on verbal pilot instructions as the only protection.

Security controls must not be postponed as ordinary cleanup work when they protect authentication, authorisation, journal integrity, file access, or customer data.

---

## Data Classification

Kaul may contain several categories of information.

### Public Information

Examples:

- Product name
- Public documentation
- Non-sensitive marketing content

### Internal Information

Examples:

- Application configuration without secrets
- Technical documentation
- Fictional development data
- Operational procedures

### Confidential Information

Examples:

- Staff account information
- Client contact information
- Assignments
- Follow-ups
- Documents
- Reports
- Audit records

### Highly Sensitive Information

Examples:

- Journal-entry content
- Health-related information
- Social-service documentation
- Incident records
- Personal identifiers
- Authentication secrets
- Password-reset tokens
- Session credentials
- Encryption keys

Highly sensitive information requires the strongest access, logging, storage, export, and backup controls.

---

## Authentication

Every user must use an individual account.

Shared accounts are prohibited.

Version 1 uses application-managed email and password authentication.

### Authentication Requirements

Kaul must provide:

- Secure password hashing using a maintained library
- Server-managed sessions
- Secure, HTTP-only session cookies
- Appropriate SameSite cookie behaviour
- Session expiration
- Login rate limiting
- Account deactivation
- Controlled password reset
- Audit events for relevant authentication actions
- Generic login failure messages

### Authentication Rules

- Passwords must never be stored or logged in plain text.
- Password hashing must not be implemented manually.
- Session identifiers and tokens must not appear in URLs.
- Authentication secrets must come from environment configuration.
- Public registration is disabled.
- The initial administrator is created through a controlled setup process.
- Inactive users cannot authenticate.
- Failed login messages must not reveal whether an email address exists.
- Production authentication requires HTTPS.
- Development credentials must never be reused for pilot or production.

Administrator-assisted password reset is limited to active Staff Members in
the acting Administrator's Organisation. The server generates the temporary
credential, sets a 24-hour forced-change expiry, revokes every target session,
and records `PASSWORD_RESET_BY_ADMIN`. A target-specific transaction lock
prevents simultaneous resets from producing two displayed credentials, and a
valid outstanding temporary credential cannot be replaced. The credential is
returned only after commit, displayed once, and excluded from storage, logs,
URLs, and audit records. The current authenticated Administrator display is a
development and pilot mechanism; an approved production delivery channel and
sole-Administrator recovery procedure remain unresolved.

Multi-factor authentication is not required for the first pilot milestone, but may be required before sensitive production use following a security review.

---

## Authorisation

Authentication establishes who the user is.

Authorisation determines which records and actions the user may access.

Version 1 supports:

- Administrator
- Staff Member

### Administrator Access

Administrators may access all clients and records within their organisation.

Administrative access must still remain auditable.

### Staff Access

Staff members may access only clients connected to them through an active primary or secondary assignment.

### Authorisation Requirements

The server must enforce access for:

- Pages
- Server actions
- Route handlers
- Direct URLs
- Search
- Journal entries
- Goals
- Follow-ups
- Documents
- File downloads
- Weekly reports
- Exports
- Administrative actions

### Authorisation Rules

- Hidden navigation is not access control.
- Client, user, role, assignment, and organisation identifiers supplied by the browser are untrusted.
- Permission checks must occur immediately before protected reads or mutations.
- Ending an assignment removes future staff access.
- Historical authorship does not preserve client access.
- Staff members cannot assign themselves.
- Export access is restricted to administrators in Version 1.
- Reusable central permission functions should be used.
- Permission behaviour must include automated denied-access tests.

---

## Organisation Isolation

Version 1 exposes one active organisation, but core data belongs to an organisation.

Organisation isolation applies before role and assignment checks.

### Organisation Rules

- A user cannot access records belonging to another organisation.
- Queries involving sensitive information must include the appropriate organisation boundary.
- Browser-supplied organisation identifiers must not determine access.
- Search must not reveal names, counts, or excerpts from another organisation.
- Exports must contain information from only the authorised organisation.
- Future multi-organisation support must not weaken these boundaries.

---

## Journal Integrity

Journal entries may become official professional records.

They require stronger protection than ordinary editable content.

### Journal Requirements

- Draft and signed states must be clearly distinguished.
- Only authorised users may create drafts for accessible clients.
- Signing occurs on the server.
- Signed entries are immutable.
- Signing stores a historical snapshot of signer name, title, role, and timestamp.
- Later user-profile changes must not rewrite historical signing information.
- Corrections are separate signed records.
- Corrections reference the original entry.
- Original signed text remains unchanged.
- Stable journal references must be preserved.
- Signed entries are not deleted through normal user functionality.
- Journal content must not appear in ordinary operational logs.
- Journal content must not be placed in audit metadata.

Attempts to modify signed records must be rejected and tested.

---

## Input Validation

All untrusted input must be validated on the server.

This includes:

- Form submissions
- Route parameters
- Search parameters
- Uploaded-file metadata
- Environment variables
- Import data
- Export options
- Identifiers supplied by the browser

### Validation Rules

- Client-side validation improves usability but is not sufficient.
- Invalid input must not reach business operations unchecked.
- Validation errors visible to users must be written in Swedish.
- Error messages must not expose internal schema or database details.
- Rich-text or HTML input must not be accepted unless there is a demonstrated need and a reviewed sanitisation strategy.
- Journal text should initially be treated as plain text with preserved formatting.
- Server-side domain checks remain necessary after shape validation.

---

## Output and Browser Security

The browser should receive only the information required for the current view.

### Browser Rules

- Do not send hidden sensitive fields to client components.
- Do not expose database records directly when they contain unnecessary information.
- Do not place sensitive data in URLs or query strings.
- Do not place client information in browser analytics.
- Do not store journal content or sensitive records in `localStorage` or `sessionStorage`.
- Do not cache authenticated sensitive pages publicly.
- Render user-entered text safely.
- Do not render untrusted HTML.
- Use appropriate security headers in deployed environments.
- Protect state-changing operations against cross-site request forgery according to the selected framework and authentication model.

---

## File Uploads and Downloads

Uploaded files are confidential client records.

### Upload Requirements

The server must validate:

- File size
- Allowed file type
- Declared content type
- Storage identifier
- Client access
- Organisation ownership

Additional content inspection may be added when justified.

### Storage Rules

- Files must not be stored in Git.
- Files must not be stored inside an ephemeral application container.
- Files must not be exposed through public or predictable URLs.
- Generated storage identifiers must be unpredictable.
- Original file names are stored only as metadata.
- File names must not be trusted as storage paths.
- Path traversal must be prevented.
- Storage credentials must remain server-side.
- Replacement must not silently destroy historical records.

### Download Rules

- Every download must pass through a server-side permission check.
- Access must be verified at the time of download.
- Download links should not provide permanent public access.
- Appropriate content-disposition and content-type headers must be used.
- Unauthorised download attempts should be denied without revealing file details.

Malware-scanning requirements must be reviewed before sensitive production deployment.

---

## Secrets and Configuration

Secrets must never be committed to Git.

Examples include:

- Database passwords
- Session secrets
- Password-reset secrets
- SMTP credentials
- Storage credentials
- Backup credentials
- Encryption keys
- Provider tokens

### Secret Rules

- Use environment variables or an approved secret store.
- Commit `.env.example` without real values.
- Use separate secrets for development, pilot, and production.
- Rotate secrets when exposure is suspected.
- Do not print secrets during startup or debugging.
- Do not expose server-only variables to browser bundles.
- Restrict production secret access to authorised operators.
- Do not copy pilot secrets into production.

---

## Logging

Operational logs are used for troubleshooting and system health.

They are not a copy of Kaul's records.

### Logging Rules

Never log:

- Passwords
- Session tokens
- Reset tokens
- Authentication secrets
- Full personal identifiers
- Full journal content
- Uploaded-file content
- Complete exports
- Sensitive form submissions

Logs may include limited information such as:

- Timestamp
- Safe correlation identifier
- Operation name
- Result
- Non-sensitive technical context
- Internal stable identifier where justified

Production logs must not show stack traces or internal errors to end users.

Logging levels should be configurable.

---

## Audit Logging

Audit logging is separate from operational logging.

Audit events provide traceability for important actions.

Examples include:

- Login success or failure
- User creation or deactivation
- Client creation or archive
- Assignment changes
- Journal signing
- Journal correction
- Document upload or replacement
- Report finalisation
- Organisation export

The accepted Client and Assignment mutation action identifiers are
`CLIENT_CREATED`, `CLIENT_UPDATED`, `CLIENT_ARCHIVED`, `ASSIGNMENT_CREATED`, and
`ASSIGNMENT_ENDED`. They target the server-generated internal Client or
Assignment identifier and contain no Client personal data. A Client edit that
is already identical after normalisation returns a no-change result without
creating a successful update operation. If the same state is reached only
after an update intent was committed, that intent receives a definitive failed
outcome rather than false success evidence.

Client archiving uses the same per-Client transaction lock as Client editing and
Assignment changes. Its `CLIENT_ARCHIVED` success outcome commits atomically
with the `ARCHIVED` status and server-owned archive timestamp after the
Administrator, Organisation, lifecycle state, and absence of active Assignments
have been revalidated inside the transaction.

### Audit Rules

- Protected Administrator mutations must first commit an immutable durable audit
  intent. If the intent cannot be persisted, the mutation must not begin.
- Mutation outcomes and reviewed recoveries are separate append-only records. An
  intent is never updated to represent success or failure.
- `FAILED` is used only after a definitive rollback or failed deletion.
  `AMBIGUOUS` is used only when commit acknowledgement is unknown; it requires
  reviewed recovery and must not be reported as success.
- Where possible, a transaction-compatible mutation and its successful outcome
  are committed together after the separate intent transaction.
- Explicit logout is the reviewed availability exception: the exact current
  Session is verified deleted in its own committed transaction before
  `LOGOUT_SUCCEEDED` is appended. Outcome persistence failure must not recreate
  the Session or prevent authentication-cookie clearing. A definitive deletion
  rollback records `FAILED`; unknown commit acknowledgement records
  `AMBIGUOUS`; neither may record success.
- Audit operations are immutable and audit events are append-only through
  ordinary application behaviour.
- PostgreSQL rejects ordinary update, delete, and truncate operations against
  audit records. This protects against accidental application or maintenance
  mutation, not a database owner deliberately removing the protection.
- Audit events must use stable action names.
- Generic audit metadata is not stored. Context must use explicit reviewed
  fields and remain minimal.
- Full journal or document content must not be copied into audit records.
- Passwords, credentials, hashes, session tokens, cookies, secrets, database
  URLs, request bodies, exception text, and stack traces must not be stored in
  audit records.
- Audit access should be restricted.
- Important administrative and security-relevant actions must remain attributable where possible.
- Audit retention will be defined before production use.

The audit log is not a substitute for the journal or operational logs.

---

## Error Handling

User-facing errors must be calm, useful, and written in Swedish.

### Error Rules

- Do not display stack traces in production.
- Do not expose SQL, Prisma, framework, file-system, or storage errors directly.
- Do not reveal whether an inaccessible client or document exists.
- Authentication failures should use generic responses.
- Unexpected errors should use a safe correlation identifier where useful.
- Sensitive input must not be included in error-reporting metadata.
- Errors must not be silently ignored.
- Multi-step operations should use transactions where partial completion would create inconsistent records.

---

## Dependency Security

Dependencies introduce code, maintenance, and security risk.

### Dependency Rules

- Use maintained packages.
- Prefer established libraries for authentication and security-sensitive operations.
- Review a package before adding it.
- Avoid unnecessary dependencies.
- Remove unused dependencies.
- Commit the lock file.
- Run dependency vulnerability checks during development and CI.
- Do not automatically accept security updates without testing.
- Do not ignore critical security advisories.
- Record material security-related technology decisions.

Kaul must not implement custom cryptography.

---

## Database Security

PostgreSQL is the authoritative structured data store.

### Database Rules

- PostgreSQL must not be publicly exposed.
- Use a dedicated application database user.
- Do not use the PostgreSQL superuser for normal application operations.
- Database credentials must be supplied securely.
- Access should be restricted to the application and authorised administrators.
- Schema migrations must be reviewed.
- Destructive migrations require explicit review and backup.
- Queries must enforce organisation and authorisation boundaries.
- Raw SQL must be parameterised.
- Production data must not be copied into development.
- Backups must be encrypted and access-controlled.

---

## Backup and Recovery Security

Backups contain the same sensitive information as the live system.

### Backup Rules

- Backups must be encrypted.
- At least one copy must be stored separately from the application host.
- Backup credentials should be separated from ordinary application credentials.
- Backup access must be restricted.
- Backup retention must be documented.
- Restore procedures must be tested.
- Restore testing must avoid exposing live sensitive data unnecessarily.
- Proxmox snapshots are supplemental and not sufficient as the only backup.
- Deleting the live system must not automatically delete all backups.
- Old backups must eventually be disposed of according to the approved retention policy.

A backup is not considered reliable until restoration has been tested.

---

## Export Security

Organisation exports may contain all information stored in Kaul.

They are highly sensitive operations.

### Export Rules

- Only authorised administrators may create complete exports.
- Export generation must create an audit event.
- Export files must not be publicly accessible.
- Export downloads must use server-side permission checks.
- Temporary export files must be removed according to a defined process.
- Export packages should be encrypted when stored or transferred outside the controlled system.
- Export links should expire.
- Export contents must be limited to the authorised organisation.
- Export archives and logs must not reveal information from other organisations.

---

## Environment Separation

Kaul uses separate development, pilot, and production environments.

### Development

- Uses fictional data
- May be reset freely
- Uses development-only credentials
- Must not receive production backups

### Pilot

- Runs initially on the Proxmox homelab
- Uses separate credentials and database
- Displays a persistent pilot warning
- Must not intentionally contain sensitive personal information
- Should still use production-style security controls where practical

### Production

- Runs on approved professional hosting
- Uses production-only credentials
- Requires HTTPS, backups, monitoring, recovery procedures, and completed reviews
- Must not share databases or secrets with development or pilot

---

## Pilot Security

The pilot must visibly display:

> Pilotmiljö – använd inte verkliga personuppgifter eller känslig information.

This warning must remain visible in the interface.

The pilot must still provide:

- HTTPS
- Individual accounts
- Strong passwords
- Server-side authorisation
- Secure sessions
- Restricted network exposure
- Automatic backups
- Audit logging
- Secure file access
- Separate pilot secrets
- A documented deletion procedure
- A documented incident-contact procedure

The system should be built under the assumption that a user may accidentally enter sensitive information despite the warning.

---

## Production Readiness Gate

Kaul must not be described as ready for sensitive production use until the production-readiness milestone is explicitly approved.

Before production use, the project requires review of:

- Hosting location and provider
- Data-processing agreements
- Legal roles and responsibilities
- Applicable Swedish regulatory requirements
- Privacy impact and risk
- Retention requirements
- Account recovery
- Multi-factor authentication requirements
- Malware protection for uploads
- Monitoring
- Incident response
- Backup retention
- Disaster recovery
- Security testing
- Accessibility
- Operational ownership

Unresolved high-risk findings block production approval.

---

## Security Testing Priorities

Automated tests should prioritise:

- Invalid login attempts
- Inactive accounts
- Session expiration
- Staff access to assigned clients
- Staff denial for unassigned clients
- Direct URL denial
- Organisation isolation
- Assignment termination
- Signed-entry immutability
- Correction integrity
- Document download permissions
- Search-result permissions
- Export permissions
- File-validation failures
- Audit-event creation
- Rejection of browser-supplied role or organisation values

Critical security behaviour should include both allowed and denied test cases.

---

## Security Incident Principles

A detailed incident-response procedure will be completed before production use.

Initial principles are:

1. Contain the issue.
2. Preserve relevant evidence.
3. Avoid exposing additional information during investigation.
4. Rotate affected credentials.
5. Determine the records and users affected.
6. Restore secure operation.
7. Document the event and response.
8. Notify the responsible organisation and relevant parties according to applicable obligations.

Incidents must not be hidden or silently fixed without documentation.

---

## Security Decision Test

Before implementing a change, ask:

1. What information does this feature access?
2. Who should be allowed to access it?
3. Is access enforced on the server?
4. Could identifiers supplied by the browser bypass permission checks?
5. Could sensitive information appear in logs, URLs, errors, or browser storage?
6. Does the change affect signed records or historical traceability?
7. Does it introduce a new dependency or external processor?
8. Does it affect exports or backups?
9. Have denied-access paths been tested?
10. Would the design remain safe if pilot users entered real information accidentally?

When uncertain, choose the more restrictive behaviour and document the unresolved issue.

---

## Current Status

These requirements are approved for project bootstrapping and pilot development.

This document must be reviewed and expanded before Kaul is approved for sensitive production use.
