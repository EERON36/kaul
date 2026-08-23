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

### Homelab proxy and client-identity boundary

The Homelab Pilot uses two reviewed proxy hops: the existing Nginx Proxy
Manager terminates public TLS, then Caddy receives private-LAN HTTP and remains
the only proxy connected to Kaul. The router does not forward public 80/443 to
the Kaul VM.

Caddy must accept the private listener only from the actual NPM network peer
observed during authorised runtime inspection. That address is a required
deployment input and must be used as an exact `/32` for both Caddy trust and
NPM-only ingress enforcement. Access control is based on the direct network
peer, never a forwarded header. Caddy must not trust all private networks. NPM
appends the public peer to `X-Forwarded-For`; Caddy parses that chain strictly
from right to left only for the trusted NPM peer. Caddy then overwrites the
Host, public HTTPS scheme, `X-Forwarded-For`, and `X-Real-IP` sent to Kaul and
strips alternative identity headers. Kaul trusts only the Caddy-provided
`X-Real-IP` for Better Auth login rate limiting.

This boundary requires runtime negative tests. A client-prepended forwarding
value must not become the rate-limit identity, and a non-NPM LAN peer must not
reach the Caddy listener. The installed NPM version and generated configuration
must also prove that Host and forwarding headers were not replaced by an
advanced/custom location. Secure cookies remain derived from Kaul's exact
HTTPS `BETTER_AUTH_URL`; the internal HTTP hop does not permit an HTTP public
origin.

Plain HTTP on the NPM-to-Caddy hop is accepted only under the Homelab Pilot
threat model: public TLS terminates at NPM, the hop stays on the trusted private
homelab network, the Caddy listener is not directly Internet-reachable and is
restricted to the verified NPM peer, strict trusted-proxy processing supplies
the original HTTPS/client metadata, and Kaul plus PostgreSQL remain
unpublished. Internal PKI or mTLS is not a Pilot prerequisite unless inspection
shows a concrete untrusted-network risk.

Future direct-public Caddy mode trusts no forwarding proxy and overwrites the
same identity headers from its direct connection. Adding another proxy, CDN,
or broad trusted CIDR requires a separate security review.

---

## Authorisation

Authentication establishes who the user is.

Authorisation determines which records and actions the user may access.

Version 1 supports:

- Administrator
- Staff Member

### Administrator Access

Administrators may access all Clients and signed records within their
Organisation. An unfinished Anteckning draft is the explicit exception:
Administrators may access only their own draft and only while normal Client
authorisation remains valid.

Administrators may view and manage shared Goals and Follow-ups for
non-archived Clients in their Organisation. They may view archived Client
planning information read-only.

Administrative access must still remain auditable.

### Staff Access

Staff members may access only clients connected to them through an active primary or secondary assignment.

Within an authorised Client, a Staff Member may read signed journal entries but
may access only their own unfinished Anteckning draft.

While the Client remains active and assigned, the Staff Member may view and
manage its shared Goals and Follow-ups.

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
- Client, user, role, assignment, author, signer, responsible-user, Goal,
  Follow-up, and Organisation identifiers supplied by the browser are
  untrusted.
- Permission checks must occur immediately before protected reads or mutations.
- Ending an assignment removes future staff access.
- Historical creation, authorship, Goal activity, or Follow-up responsibility
  does not grant or preserve Client access.
- Draft authorship does not preserve access after the author loses current
  Client authorisation.
- Goals and Follow-ups are shared Client planning information rather than
  private user records. Follow-up responsibility is not an authorisation
  boundary.
- Rows, links, counts, Home items, and future badges must reapply current Client
  access and must not disclose inaccessible Client information.
- Every Follow-up assignment or reassignment must resolve the responsible user
  server-side and revalidate that the user is active, belongs to the same
  Organisation, and currently has normal Client access. Eligible users are
  currently assigned Staff Members and Administrators with Organisation Client
  access.
- Later access loss does not block Assignment removal or automatically reassign
  a Follow-up. The former responsible user loses all read and mutation access,
  and the item must disappear immediately from that user's Home.
- Staff Members cannot create or grant Client Assignments for themselves. This
  does not prevent an already authorised user from selecting themselves as the
  responsible user for a Follow-up.
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
- An unfinished draft is visible only to its author. Administrator status does
  not override this rule.
- Only a currently Client-authorised user may create a draft, and Version 1
  permits at most one open draft for each author and Client.
- Only the draft author may read, reopen, edit, save, discard, or sign it.
- Draft privacy must hold across lists, counts, previews, direct URLs, search
  results, Server Actions, route handlers, and every other application surface.
  Denials must not reveal whether another user's draft exists.
- Saving a draft is not signing it, and ordinary draft saves must not create
  immutable audit noise.
- Signing is a separate explicit authenticated server action that changes the
  author's draft from `DRAFT` to `SIGNED`. It is not a cryptographic digital
  signature, BankID, external electronic signature, or certificate-based
  signing.
- Author, signer, Organisation, Client, status, and correction-link identity
  must be resolved or validated on the server rather than trusted from the
  browser.
- Signing and draft updates must fail closed against stale draft overwrite,
  simultaneous or repeated signing, and duplicate open drafts for one author
  and Client.
- Signed entries are immutable and cannot be edited or deleted by any user,
  including an Administrator.
- Signing stores a historical snapshot of signer name, title, role, and timestamp.
- Later user-profile changes must not rewrite historical signing information.
- Signed-entry visibility follows current Client authorisation. Administrators
  may read signed entries for Clients in their Organisation; Staff Members may
  read them only while active assignment rules grant Client access.
- Historical authorship does not preserve access to a signed entry.
- Ungdomar/Vuxna categorisation is not a Journal authorisation boundary.
- Corrections are separate signed records with their own author, content,
  signing action, signing information, and audit evidence.
- A correction links directly to the original signed entry; Version 1 does not
  create an arbitrary correction tree.
- Original signed text remains unchanged.
- The server must reject correction links to a draft, a correction as a new
  root, or an entry belonging to another Client or Organisation.
- A correction may be authored only by a currently authorised assigned Staff
  Member or an Administrator with Organisation and Client access. Only that
  correction's author may save, discard, or sign it.
- Stable journal references must be preserved.
- While the author's entry is a draft, the author may select zero or more Goals
  from that same Client and Organisation. Goal selection remains optional and
  must not reveal inaccessible Clients or Goals.
- Signing must atomically freeze every selected Goal identifier and its
  signing-time title as immutable Journal context. Signed Goal-reference rows
  cannot later be added, removed, changed, or retrospectively created.
- Later Goal edits, completion, or archiving must not alter signed Journal
  presentation. A Goal reference does not grant Journal or Client access and
  does not mutate the Goal.
- Journal content must not appear in ordinary operational logs.
- Journal content must not be placed in audit metadata.
- Draft creation and discard may be audited. Signing an original and signing a
  correction require immutable audit evidence through Kaul's existing
  durable-intent and immutable-outcome architecture.

Attempts to modify signed records must be rejected and tested.

---

## Planning Integrity

Goals and Follow-ups are ordinary editable planning records rather than signed
professional records. Their integrity controls must remain proportionate while
preserving access, history, and audited terminal actions.

### Planning Requirements

- Every read and mutation requires current Organisation and Client
  authorisation. Protected mutations must revalidate that access while holding
  the existing Client mutation serialisation when Assignment or Client
  lifecycle changes can race.
- Goal and Follow-up editable states use optimistic versions. A stale edit must
  fail without silently overwriting newer content.
- Goal, Follow-up, optional Goal link, creator, lifecycle actor, responsible
  user, and responsibility-history relationships must structurally preserve
  the same Organisation and Client scope where applicable.
- Responsible-user eligibility must be revalidated during creation and
  reassignment. Responsibility never grants access.
- Duplicate completion, cancellation, archival, and reassignment requests must
  not create two business outcomes or duplicate successful audit evidence.
- Goals and Follow-ups in every lifecycle state remain retained and cannot be
  hard-deleted or cascade-deleted through ordinary application behaviour.
  Terminal records also cannot be edited, reassigned where applicable, or
  reopened.
- Narrow immutable Follow-up responsibility history preserves the previous
  responsible user, new responsible user, actor, and timestamp without copying
  Client names or planning text.
- Goal and Follow-up descriptions, Journal text, Client names, request bodies,
  exception text, and other sensitive free text must not enter audit records or
  ordinary operational logs.
- Journal's stronger signing and recovery machinery applies to immutable signed
  Goal-reference context and the approved audited planning transitions. It must
  not be copied onto ordinary planning edits, reads, or calculated due-state
  changes.

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
- Journal draft creation or discard where required by audit policy
- Journal signing
- Journal correction
- Goal completion or archive
- Follow-up reassignment, completion, or cancellation
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

The accepted Milestone 4 planning action identifiers are
`GOAL_COMPLETED`, `GOAL_ARCHIVED`, `FOLLOW_UP_REASSIGNED`,
`FOLLOW_UP_COMPLETED`, and `FOLLOW_UP_CANCELLED`. They use the existing
immutable audit-operation and outcome guarantees for the specific transition.
Creation is represented sufficiently in Version 1 by each retained record's
creator and creation timestamp.

### Audit Rules

- Protected Administrator mutations must first commit an immutable durable audit
  intent. If the intent cannot be persisted, the mutation must not begin.
- The approved Goal and Follow-up audited transitions use the same durable
  intent and immutable outcome guarantees whether the authorised actor is an
  Administrator or Staff Member. If the intent cannot be persisted, the
  transition must not begin.
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
- Draft creation and discard may be audited, but ordinary draft saves do not
  create immutable audit events.
- Signing an original or correction must commit immutable audit evidence using
  the existing durable-intent and immutable-outcome principles. A successful
  signing outcome must not exist without the signed record, and a signed record
  must not exist without its successful audit evidence.
- Read or view events are not introduced for Journal records unless a separate
  authoritative policy later requires them.
- Goal and Follow-up reads, creation, ordinary title, description, due-date or
  target-date edits, Goal pause or resume, calculated overdue or upcoming
  changes, and no-op submissions do not create immutable audit events in
  Version 1.
- Planning audit records contain only the approved stable action and historical
  identifiers needed for attribution. They must not contain Goal or Follow-up
  descriptions, Journal text, Client names, other sensitive free text, request
  bodies, or exception text.
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
- The live Pilot backup writer may create and read backups but must not delete,
  overwrite, forget, or prune repository history.
- Retention and destructive repository maintenance require a separate secured
  off-host identity; those credentials must not be present on the Pilot VM.
- Backup encryption passwords, provider recovery material, and recovery
  instructions must have an offline copy outside the Pilot VM.
- Database dumps must stream directly into the encrypted repository; do not
  complete a plaintext dump file on the application host.
- Automated restore and validation must select an exact immutable backup ID,
  never an ambiguous newest/latest selector.
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
- The normal `kaul` database is protected from destructive and test setup
- Explicit disposable `kaul_test_*` databases may be reset or dropped only
  through the guarded test lifecycle
- Uses development-only credentials
- Must not receive production backups

### Homelab Pilot

- Runs initially on the Proxmox homelab
- Uses separate credentials and database
- Displays a persistent pilot warning
- Must not intentionally contain sensitive personal information
- Should still use production-style security controls where practical

### Production / Cloud

- Runs on approved professional hosting
- Uses production-only credentials
- Requires HTTPS, backups, monitoring, recovery procedures, and completed reviews
- Must not share databases or secrets with development or pilot

---

## Homelab Pilot Security Gate

The pilot must visibly display:

> Pilotmiljö – använd inte verkliga personuppgifter eller känslig information.

This warning must remain visible in the interface.

The pilot must still provide:

- A dedicated or clearly isolated Ubuntu VM separated from unrelated homelab
  services
- Existing-VM inspection against the supported OS, resource, patch, startup,
  and Docker preflight contract
- A Docker-aware firewall or upstream equivalent that permits the private
  Caddy listener only from the exact Caddy-observed NPM source and denies
  unrelated homelab management access
- Verified NPM Host, HTTPS-scheme, and strict client-IP forwarding behavior,
  including spoofed-header and non-NPM negative tests
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

Invited stakeholders may test real workflows, but Client and case content must
remain fictional, sanitised, or otherwise non-sensitive under the current
Milestone 7 governance. The unchanged dependency-audit policy and every open
Milestone 7 security decision remain Homelab Pilot gates. Production-only
provider, contract, data-residency, and formal operational-ownership approvals
do not become Pilot gates unless another authoritative requirement assigns them
there.

---

## Production / Cloud Security Gate

Kaul must not be described as ready for sensitive production use until the production-readiness milestone is explicitly approved.

Before production use, the project requires review of:

- Hosting location and provider
- Production database hosting and administration model
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
- Off-host immutable or append-only backup enforcement with separate writer
  and maintenance credentials
- Offline recovery material and a completed production restore rehearsal
- Release provenance and production hardening
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
- Author-only draft access, including Administrator denial
- One open draft per author and Client
- Stale draft-update rejection
- Simultaneous and repeated signing rejection
- Current Client authorisation for signed-entry reads
- Signed-entry immutability
- Same-Client and same-Organisation Journal Goal-reference integrity
- Signed Goal-reference immutability and signing-time title preservation
- Same-Client and same-Organisation correction integrity
- Current Client access for Goal and Follow-up reads and mutations
- Goal and Follow-up stale-write and terminal-state rejection
- Responsible-user eligibility and access-loss Home removal
- Same-Client and same-Organisation Follow-up Goal-link integrity
- Duplicate planning transition and audit-evidence rejection
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
