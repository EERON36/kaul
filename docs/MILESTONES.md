# Kaul Development Milestones

## Milestone 1 authentication audit status

- `INITIAL_ADMIN_CREATED` is integrated with durable intent, atomic success,
  failure and ambiguity handling, and reviewed empty-install recovery.
- `PASSWORD_CHANGED` is integrated with the forced password-change transaction
  and post-commit replacement-cookie handling.
- `LOGIN_SUCCEEDED` is integrated with durable trusted-identity intent,
  transactionally coupled Session success, and post-commit cookie release.
- `LOGIN_FAILED` is integrated for pre-trust invalid credentials; `LOGOUT_SUCCEEDED`
  is integrated at the verified explicit Session-deletion boundary.

Version: 0.1

---

## Purpose

This document defines the planned development milestones for Kaul Version 1.

Its purpose is to:

- Keep development focused
- Prevent scope creep
- Make progress measurable
- Give contributors and coding agents clear boundaries
- Ensure security and portability are addressed before pilot use
- Avoid building later-stage features before the foundation is ready

A milestone is complete only when its completion criteria have been satisfied.

Features from later milestones should not be implemented early unless they are strictly required by the current milestone.

---

## Milestone Principles

Development should follow these principles:

- Build the smallest complete solution.
- Complete foundational work before business features.
- Protect security boundaries from the beginning.
- Use fictional data during development and testing.
- Keep every milestone deployable and understandable.
- Do not create unused abstractions for later milestones.
- Do not treat visual polish as a substitute for working domain behaviour.
- Do not move forward when critical tests or migration paths are broken.
- Prefer one finished workflow over several incomplete workflows.

Every milestone must pass:

- The 2 AM Test
- The Security Test
- The Migration Test
- The Six Month Test
- The Current Need Test

---

# Milestone 0 — Project Foundation

## Goal

Create a clean, repeatable, and documented application foundation without implementing Kaul’s business features.

## Scope

This milestone includes:

- Bootstrap the Next.js application
- Configure TypeScript strict mode
- Configure npm
- Configure ESLint
- Configure Prettier
- Configure Tailwind CSS
- Add IBM Plex fonts
- Create the initial project structure
- Add PostgreSQL through Docker Compose
- Configure Prisma
- Add environment-variable validation
- Add `.env.example`
- Add basic health-check functionality
- Add Vitest
- Add Playwright
- Add initial GitHub Actions workflow
- Create a basic application shell
- Confirm the application can connect to PostgreSQL
- Confirm the production build succeeds

## Application Shell

The initial shell may contain:

- Kaul wordmark
- Basic Swedish placeholder text
- Sidebar and page-layout structure
- Pilot-environment notice
- Accessible focus styles

It must not contain:

- Working client management
- Working journal entries
- Fake production dashboards
- Complex navigation
- Authentication behaviour
- Reports
- Documents
- Search

## Completion Criteria

Milestone 0 is complete when:

- The application starts locally.
- PostgreSQL starts through Docker Compose.
- Prisma can connect to PostgreSQL.
- A basic migration can be applied.
- Type checking passes.
- Linting passes.
- Formatting checks pass.
- Automated test tooling runs successfully.
- The production application build succeeds.
- GitHub Actions runs the required checks.
- Environment variables are validated.
- No secrets are committed.
- The project structure follows the approved architecture.
- Setup instructions are documented in the README.
- No business functionality has been added prematurely.

---

# Milestone 1 — Authentication and User Administration

## Goal

Allow individual users to access Kaul securely and allow an administrator to manage the initial staff accounts.

## Scope

This milestone includes:

- Select and document the authentication library
- Create the initial organisation
- Create the initial administrator through a controlled setup command
- Email and password login
- Logout
- Secure password hashing
- Server-managed sessions
- Secure session cookies
- Session expiration
- Login rate limiting
- Active and inactive user status
- Administrator-created staff accounts
- User list for administrators
- User detail view
- User deactivation
- Professional title
- Administrator and Staff Member roles
- Relevant authentication audit events
- Swedish login and user-management interfaces

## Version 1 Account Workflow

The intended workflow is:

1. The initial administrator is created during deployment.
2. The administrator logs in.
3. The administrator creates staff accounts.
4. Staff members receive or are assigned temporary credentials through a controlled process.
5. Staff members set or change their password.
6. Public registration remains unavailable.

Email invitations may be deferred if they add unnecessary dependency or complexity. A controlled temporary-password workflow is acceptable for the pilot.

Slice 3 creates the initial Administrator only for fictional-data development and pilot verification. It persists the required `INITIAL_ADMIN_CREATED` audit intent and outcome; console output is not treated as an audit event. An organisation-approved credential-delivery channel and a sole-Administrator recovery procedure remain required before production operational acceptance.

## Explicitly Excluded

This milestone does not include:

- Public registration
- Microsoft Entra ID
- Multi-factor authentication
- Social login
- Multiple organisations in the administration interface
- Complex custom roles
- Staff access to clients
- Client assignments
- Client records

## Completion Criteria

Milestone 1 is complete when:

- The initial administrator can be created safely.
- Active users can log in and log out.
- Invalid credentials are rejected.
- Inactive users cannot log in.
- Passwords are never stored in plain text.
- Sessions use secure server-managed behaviour.
- Login attempts are rate limited.
- Administrators can create staff accounts.
- Administrators can deactivate staff accounts.
- Staff members cannot access administrative user management.
- Authentication and user-management actions create appropriate audit events.
- Denied-access paths are tested.
- User-facing text is Swedish.
- No authentication secrets appear in logs or source control.
- The authentication decision is recorded in `docs/decisions/`.

---

# Milestone 2 — Clients and Assignments

## Goal

Allow administrators to manage clients and determine which staff members may access them.

## Scope

This milestone includes:

- Create clients
- Edit permitted client information
- View client lists
- Separate Ungdomar and Vuxna in the interface
- Client detail workspace
- Client status
- Client archiving
- Primary staff assignment
- Secondary staff assignments
- Assignment start and end dates
- Administrator assignment management
- Assignment-based client access
- Staff home view showing assigned clients
- Basic client search
- Audit events for client and assignment changes

## Client Workspace

The client workspace should establish the long-term navigation structure.

Initial sections may include:

- Översikt
- Anteckningar
- Dokument
- Mål
- Uppföljningar
- Veckorapporter
- Historik

Sections that do not yet have implemented functionality may be omitted or clearly marked as unavailable. Empty fake functionality should not be added.

## Access Rules

- Administrators can access all clients in their organisation.
- Staff members can access only clients with an active primary or secondary assignment.
- Staff members cannot assign themselves.
- Ending an assignment removes future access.
- Historical authorship does not preserve access after an assignment ends.
- Direct URLs must enforce the same access rules as visible navigation.
- Client names must not leak through search or errors to unauthorised users.

## Explicitly Excluded

This milestone does not include:

- Journal-entry creation
- File uploads
- Weekly reports
- Advanced timeline functionality
- Calendar synchronisation
- Temporary assignment workflows
- Bulk client import
- Custom permissions

## Completion Criteria

Milestone 2 is complete when:

- Administrators can create youth and adult clients.
- Administrators can edit permitted client information.
- Administrators can archive clients.
- Administrators can assign primary and secondary staff members.
- Staff members see only actively assigned clients.
- Unassigned staff members are denied access through direct URLs.
- Archived clients are excluded from ordinary active workflows.
- Assignment changes are auditable.
- Client and assignment permissions are centralised.
- Permission tests include allowed and denied cases.
- Basic Swedish client search respects permissions.
- The client workspace passes the 2 AM Test.
- No client access relies only on hidden navigation.

---

# Milestone 3 — Journal and Signed Records

## Goal

Allow authorised users to create professional client documentation with reliable signing and correction behaviour.

## Scope

This milestone includes:

- Client workspace **Anteckningar** workflow
- Author-private draft journal entries
- At most one open draft per author and Client
- Draft create, reopen, save, and discard actions
- Journal-entry types
- Event date and time for the documented event
- Journal content
- Stable journal reference identifiers
- Explicit authenticated signing distinct from saving
- Historical signer snapshot
- Signed-entry immutability
- Signed-entry visibility through current Client authorisation
- Separate signed correction entries linked to signed originals
- Stale-update and concurrent-signing protection
- Journal history within the Client workspace
- Relevant audit events

## Journal Entry Types

Version 1 has exactly these eight allowed Journal-entry types:

- Daganteckning
- Samtal
- Telefonsamtal
- Möte
- Hembesök
- Skolkontakt
- Observation
- Övrigt

The primary action remains:

- Ny anteckning

Incident classification remains deferred and is not part of the Milestone 3
entry-type vocabulary.

## Draft and Access Rules

- An unfinished draft is visible only to its author, including when another
  user is an Administrator.
- Only the author may read, reopen, edit, save, discard, or sign the draft.
- The author must retain normal current Client authorisation for every draft
  operation. Draft authorship does not preserve access.
- Version 1 permits at most one open draft for each author and Client. The
  author reopens that draft until it is signed or discarded.
- Draft lists, counts, previews, direct URLs, search results, Server Actions,
  and other application surfaces must not reveal another user's draft.
- Once signed, an entry follows normal current Client authorisation rather than
  draft privacy. Administrators may read signed entries for Organisation
  Clients, and Staff Members may read them only while assignment rules grant
  Client access.
- Historical authorship does not preserve signed-entry access, and
  Ungdomar/Vuxna categorisation is not a Journal authorisation boundary.

## Signing Rules

- Saving a draft is not signing it.
- Signing is an explicit authenticated server action that changes the author's
  draft from `DRAFT` to `SIGNED`.
- Signing in Version 1 is not a cryptographic digital signature, BankID,
  external electronic signature, or certificate-based signing.
- In Version 1 the draft author performs the signing action and becomes the
  signer.

Signing must preserve:

- Signer name
- Professional title
- Application role
- Signing timestamp
- Stable journal reference

Signed entries must not change when the user later changes their profile.
No user, including an Administrator, may edit or delete a signed original.

## Correction Rules

- A correction is a separate signed journal entry linked directly to the
  original signed entry rather than through an arbitrary correction tree.
- The original signed text remains unchanged.
- The relationship between the records remains visible.
- A correction may be authored by a currently authorised assigned Staff Member
  or an Administrator with Organisation and Client access.
- The correction has its own author, content, signing action, signing
  information, stable reference, and audit evidence.
- The correction and original must belong to the same Client and Organisation.

## Audit and Integrity Rules

- Draft creation and discard may be auditable. Ordinary draft saves do not
  create immutable audit noise.
- Signing an original or correction requires immutable audit evidence through
  the existing durable-intent and immutable-outcome architecture.
- The Journal lifecycle must prevent stale draft overwrites, simultaneous or
  repeated signing, duplicate open drafts for one author and Client, mutation
  or deletion of signed records, and invalid or cross-Client or
  cross-Organisation correction links.
- These are product and domain invariants. Exact database locking, constraint,
  and transaction mechanics are decided in the Journal foundation slice.

## Explicitly Excluded

This milestone does not include:

- Collaborative editing
- Attachments
- Autosave
- Rich text
- Templates
- Automatic text generation
- AI summaries
- Advanced approval chains
- Hard deletion of signed records
- Email distribution of journal content
- Browser-storage drafts
- PWA and offline drafts
- Search across Journal records
- Exports
- Printable Journal views
- Client Documents and Final Reports, which remain in later milestones
- Retention or deletion policy
- Multi-factor authentication
- Notifications
- Incident classification
- BankID, cryptographic signatures, and external electronic signatures

## Completion Criteria

Milestone 3 is complete when:

- Currently Client-authorised users can create and reopen only their own
  drafts.
- Another Staff Member and an Administrator are denied access to the author's
  unfinished draft across lists, counts, previews, direct URLs, Server Actions,
  and other application surfaces.
- At most one open draft exists for each author and Client.
- Drafts and signed entries preserve the established journal-entry type and
  event date and time. The event date and time is distinct from creation,
  draft-save, and signing timestamps.
- **Spara utkast** preserves a draft without signing it.
- Stale draft updates are rejected without overwriting newer content.
- **Signera** is an explicit authenticated server action, and simultaneous or
  repeated signing cannot create two signed outcomes.
- Signing information is historically preserved.
- Signed originals cannot be edited or deleted by Staff Members or
  Administrators, and denied mutation paths are tested.
- Signed entries are visible according to current Organisation and Client
  authorisation, without access expansion from historical authorship or
  Ungdomar/Vuxna categorisation.
- Corrections are separate signed records linked to a valid original in the
  same Client and Organisation, and the original remains unchanged.
- Draft creation and discard follow the approved optional audit policy;
  ordinary draft saves avoid immutable audit noise; signing originals and
  corrections creates immutable audit evidence.
- Direct journal URLs and every server-side read and mutation enforce the same
  permissions.
- Journal text is absent from ordinary operational logs.
- The complete **Anteckningar** workflow passes the 2 AM Test and remains
  laptop-first, mobile-functional, keyboard usable, and narrow-screen usable.

---

# Milestone 4 — Goals and Follow-ups

## Goal

Support straightforward planning around client goals and future actions without creating a complex workflow system.

## Scope

This milestone includes:

- Create client goals
- Edit active goals
- Pause goals
- Complete goals
- Archive goals
- Reference goals from journal entries
- Create follow-ups
- Assign responsibility for follow-ups
- Follow-up due date and optional time
- Complete follow-ups
- Cancel follow-ups
- Overdue status
- Upcoming follow-ups on the home view
- Audit events where appropriate

## Goal Rules

- Goals remain optional.
- Goals must not block journal creation.
- Goals should not use artificial percentage progress.
- Historical journal references must remain understandable after goals change.
- Completed goals remain visible in history.

## Follow-up Rules

- Follow-ups are planning items, not journal records.
- Completing a follow-up does not automatically create documentation.
- Users may create a journal entry after a follow-up.
- Users only see follow-ups for accessible clients.

## Explicitly Excluded

This milestone does not include:

- Calendar synchronisation
- Email reminders
- SMS reminders
- Recurring scheduling engines
- Complex task management
- Staff workload analytics
- Kanban boards
- Notifications outside Kaul

## Completion Criteria

Milestone 4 is complete when:

- Authorised users can manage client goals.
- Goal history remains understandable.
- Goals can be referenced from journal entries.
- Authorised users can create and complete follow-ups.
- The responsible user is clear.
- Upcoming and overdue follow-ups appear appropriately.
- Staff members cannot see follow-ups for inaccessible clients.
- Goals and follow-ups remain simple enough for the 2 AM Test.
- No calendar or notification infrastructure has been introduced.

---

# Milestone 5 — Documents and Weekly Reports

## Goal

Allow authorised users to upload client documents and generate reliable weekly summaries from existing documentation.

## Scope

This milestone includes:

- Upload client documents
- Store document metadata in PostgreSQL
- Store file content through the storage abstraction
- Local persistent storage for development and pilot
- Secure document download
- File validation
- File-size restrictions
- Allowed file-type restrictions
- Document replacement or version behaviour
- Document list within the client workspace
- Weekly report generation
- Calendar-week selection
- Included journal entries
- Incident overview
- Goal overview
- Optional manual summary
- Draft and final report status
- Printable report
- Stable report reference
- Relevant audit events

## Weekly Report Rules

- Reports summarize existing journal entries.
- Journal entries remain authoritative.
- Final reports must not silently change.
- Regenerating a final report creates a new version or record.
- Version 1 uses a clear chronological summary.
- Automated interpretation or AI-generated analysis is excluded.

## Document Security Rules

- Uploaded files are not publicly accessible.
- Download permission is checked on the server.
- Storage identifiers are unpredictable.
- Original file names are metadata only.
- Replacing a document does not silently destroy the previous record.
- File contents are not stored in Git or the application image.

## Explicitly Excluded

This milestone does not include:

- Complex document approval
- External electronic signatures
- OCR
- AI document analysis
- Cloud-specific storage dependencies
- Public document links
- Document collaboration
- Direct authority-system integration

## Completion Criteria

Milestone 5 is complete when:

- Authorised users can upload permitted documents.
- Files survive application-container replacement.
- Unauthorised downloads are denied.
- File validation occurs on the server.
- Documents appear in the correct client workspace.
- Weekly reports correctly include authorised source records.
- Final reports remain historically stable.
- Reports display Swedish dates and ISO calendar weeks correctly.
- Reports print cleanly with Swedish characters.
- Document and report actions create appropriate audit events.
- Storage can later be replaced without changing the domain model.

---

# Milestone 6 — Organisation Export and Search

## Goal

Ensure customer data is searchable, understandable, and portable.

## Scope

This milestone includes:

- Global authorised search
- Search across clients
- Search across journal entries
- Search across documents
- Search across weekly reports
- Administrator organisation export
- Versioned export format
- Export manifest
- JSON export
- CSV export where appropriate
- PDF summaries where appropriate
- Original uploaded files
- ZIP export package
- Stable identifier preservation
- Export audit event
- Export documentation

## Search Rules

- Search respects organisation boundaries.
- Search respects client assignments.
- Search must not reveal inaccessible client names or excerpts.
- PostgreSQL search is sufficient for Version 1.
- No dedicated search infrastructure should be added.

## Export Rules

A complete export should include, where applicable:

- Organisation information
- Users
- Clients
- Assignments
- Journal entries
- Signing information
- Corrections
- Goals
- Follow-ups
- Documents
- Original uploaded files
- Weekly reports
- Audit events
- Manifest and export-version information

## Explicitly Excluded

This milestone does not include:

- Public API
- Direct migration into another vendor
- Elasticsearch
- OpenSearch
- Scheduled automated exports
- Customer-configurable export schemas
- Data-warehouse integration

## Completion Criteria

Milestone 6 is complete when:

- Users can search only information they are authorised to access.
- Administrators can create a complete organisation export.
- The export is understandable without Prisma or PostgreSQL.
- Relationships and stable identifiers are preserved.
- Original uploaded files are included.
- The export format is versioned.
- The package contains a clear manifest.
- Export generation is audited.
- Export contents are tested for completeness.
- The export can be opened and inspected outside Kaul.

---

# Milestone 7 — Pilot Readiness

## Goal

Prepare Kaul for controlled pilot use on the Proxmox homelab using fictional or non-sensitive information.

## Scope

This milestone includes:

- Production-style Docker image
- Pilot Docker Compose configuration
- Caddy reverse proxy
- HTTPS
- Domain configuration
- Pilot environment warning
- Secure environment configuration
- Firewall documentation
- SSH hardening documentation
- Health checks
- Uptime monitoring
- Structured operational logs
- PostgreSQL backups
- Uploaded-file backups
- Encrypted off-host backup destination
- Restore scripts
- Restore testing
- Deployment documentation
- Pilot user instructions
- Pilot limitations
- Incident and support procedure
- Initial accessibility review
- Critical end-to-end tests

## Pilot Warning

The pilot interface must clearly state:

> Pilotmiljö – använd inte verkliga personuppgifter eller känslig information.

The warning should remain visible and should not depend solely on verbal instructions.

## Completion Criteria

Milestone 7 is complete when:

- Kaul can be deployed from documented instructions.
- HTTPS works correctly.
- Only the required public ports are exposed.
- PostgreSQL is not publicly exposed.
- Proxmox is not exposed through the Kaul domain.
- Development and pilot use separate credentials and databases.
- Automatic database backups run successfully.
- Uploaded-file backups run successfully.
- At least one backup is stored away from the application host.
- A clean environment has been restored from backup.
- Restore steps are documented.
- Pilot users can complete the main workflows.
- The persistent pilot warning is visible.
- Critical Playwright tests pass.
- No known critical security defect remains.
- The startup understands that the environment is not yet approved for sensitive production data.

---

# Milestone 8 — Production Readiness

## Goal

Prepare Kaul for migration to professional hosting and use with live organisational information.

This milestone is not automatically entered after the pilot. It requires an explicit business decision and security review.

## Scope

This milestone includes:

- Select professional EU-based hosting
- Review applicable contracts and data-processing terms
- Configure the production environment
- Migrate PostgreSQL
- Migrate uploaded files
- Configure production backups
- Configure monitoring
- Configure recovery procedures
- Review retention requirements
- Review privacy and legal responsibilities
- Review account and password-reset procedures
- Review audit access
- Review operational ownership
- Complete security review
- Complete accessibility review of critical workflows
- Complete data-migration test
- Complete disaster-recovery test
- Remove pilot-only configuration
- Create production launch checklist

## Completion Criteria

Milestone 8 is complete when:

- The hosting environment has been approved.
- Responsibilities for system operation are documented.
- Data-processing responsibilities have been reviewed.
- Production secrets are separate and securely stored.
- Production migration has been rehearsed.
- Database and uploaded-file restore tests succeed.
- Monitoring and incident handling are active.
- Backup retention is documented.
- Critical security tests pass.
- Critical accessibility issues are resolved.
- Production users understand account and support procedures.
- The system owner explicitly approves launch.
- The homelab is no longer the authoritative production host.

---

# Post-Version 1 Candidates

The following items may be evaluated after Version 1 based on validated customer needs:

- Microsoft Entra ID
- Multiple organisations
- Temporary assignments
- Manager or read-only roles
- Email reminders
- Calendar synchronisation
- More document templates
- Additional report formats
- S3-compatible production storage
- Improved PostgreSQL full-text search
- Mobile-responsive workflow improvements
- External API
- Additional accessibility improvements
- Advanced retention controls

These are candidates, not commitments.

They must not influence Version 1 implementation beyond maintaining clean, reasonable boundaries.

---

# Current Milestone

# Current Status

## Completed

### Milestone 0 — Project Foundation

Completed on 1 August 2026.

Milestone 0 established:

- Next.js with App Router and strict TypeScript
- PostgreSQL through Docker Compose
- Prisma with an empty initial migration
- Tailwind CSS and IBM Plex fonts
- Zod environment validation
- Vitest and Playwright
- GitHub Actions validation
- Security audit policy
- Minimal accessible Swedish application shell
- Database-aware health endpoint

Completion was verified locally and through GitHub Actions.

Git reference:

`4bfabda Bootstrap Milestone 0 application foundation (#1)`

## Current Phase

### Milestone 1 — Authentication and User Administration: Implementation in Progress

ADR 0001 remains Accepted.

Slice 1 — authentication schema and Better Auth foundation — is implemented and
verified. The authentication migration has been created, reviewed, tested from
clean PostgreSQL, and applied to the fictional local development database. The
required `Organisation` relation and canonical `UserRole` schema are implemented.

Public signup denial, raw Admin HTTP route isolation, database-backed sessions,
database-backed rate limiting, and Better Auth/Prisma compatibility are
implemented and tested.

Slice 2 — central authentication and session guards — is implemented and
verified.

Slice 3 — initial Organisation and Administrator bootstrap — is implemented and
verified for fictional development and pilot verification, including durable
`INITIAL_ADMIN_CREATED` auditing and reviewed empty-install recovery. An
approved credential-delivery channel and sole-Administrator credential-loss
recovery remain outstanding production blockers.

Slice 4 — login, forced first password change, authenticated application shell,
and logout — is implemented and verified. Its authentication audit slices now
cover `PASSWORD_CHANGED`, `LOGIN_SUCCEEDED`, admitted pre-trust `LOGIN_FAILED`,
and verified explicit `LOGOUT_SUCCEEDED`.

The Milestone 1 Audit Foundation is implemented and verified as the prerequisite
for later protected Administrator mutations. It provides immutable durable
operation intents, append-only outcome and recovery events, idempotency keys,
and database-level immutability. No existing authentication workflow has been
weakened to obtain audit coverage.

Slice 5 — Staff Management — is implemented and verified. Administrators can
list, create, deactivate, and reactivate Staff Members within their own
Organisation. Each protected mutation uses a server-generated operation ID, a
durable audit intent, and a transactionally coupled successful outcome. Account
deactivation revokes the target user's sessions as part of the single
`ACCOUNT_DEACTIVATED` operation; `USER_SESSIONS_REVOKED` remains reserved for a
future standalone session-revocation operation.

Administrator-assisted Staff password reset is implemented and verified.
Administrators can reset only active Staff Members in their own Organisation.
The operation generates a 24-hour temporary credential, prevents replacement
while a valid reset is outstanding, revokes every target session, and records
`PASSWORD_RESET_BY_ADMIN` through the Audit Foundation. The credential is shown
once to the authenticated Administrator and is never persisted in plaintext.
This development and pilot display does not resolve the required
organisation-approved production delivery channel.

Later Milestone 1 work remains outstanding, including:

- The organisation-approved production credential-delivery channel
- The sole-Administrator credential-loss recovery procedure

### Milestone 2 — Clients and Assignments: Complete

The Client Foundation slice is implemented and verified. Administrators can
create organisation-owned Clients and manage historical primary and secondary
Staff assignments. Staff access requires both an active Client and an active
assignment, and one central server-side access boundary protects Client lists
and direct Client routes.

Client creation and Assignment creation/end operations use durable audit
intents and transactionally coupled successful outcomes. PostgreSQL enforces
organisation-safe assignment relationships, one active primary assignment, and
one active assignment per Client and Staff Member.

The Client Editing slice is implemented and verified. Active Administrators can
edit only Client first name, last name, organisation-local person reference,
and the controlled `ADULT`/`YOUTH` category. The operation is organisation
scoped, uses PostgreSQL uniqueness, serialises each target Client, and commits
`CLIENT_UPDATED` success evidence atomically with a real change. Unchanged
normalised submissions do not create false successful update evidence.

The Client Archiving slice is implemented and verified. Administrators can
archive only inactive Clients after every active Assignment has been manually
ended. The operation shares the per-Client transaction lock with Client editing
and Assignment changes, records `CLIENT_ARCHIVED` success atomically with the
server-owned archive timestamp, and preserves all Client and Assignment
history. Archived Clients are read-only, excluded from ordinary Administrator
and Staff lists, and available to Administrators through the separate
**Arkiverade klienter** workflow.

Basic permission-aware Client Search is implemented and verified in the
ordinary **Klienter** workflow. Name tokens and exact canonical Personreferens
matching execute inside the same organisation-, lifecycle-, and
Assignment-scoped PostgreSQL query. Submitted search terms stay out of URLs,
results use role-appropriate narrow Client-list shapes, and archived Clients
remain in the separate Administrator workflow.

The final Staff Home and responsibility-orientation slice is implemented and
verified. Staff Home shows only active Clients reached through the current
user's active primary or secondary Assignment. Administrator Client discovery
shows the active primary responsible Staff Member, and the Client workspace
shows compact current primary/secondary responsibility before Assignment
management. These flows reuse the central organisation-, lifecycle-, and
Assignment-scoped Client access boundary.

Focused PostgreSQL lifecycle and non-disclosure tests, desktop Playwright, and a
375×812 Staff Home/workspace workflow verify the remaining 2 AM Test and
mobile-functional completion criteria. Milestone 2 is complete.

Administrator filtering by responsible Staff, Assignment dates in every active
Client view, secondary Staff names in every Client-list row, and unimplemented
future workspace sections remain deferred non-blocking work. Document, goal,
follow-up, and report functionality remain in their later milestones.

### Milestone 3 — Journal and Signed Records: Complete

The Milestone 3 Journal domain/database foundation is implemented. It provides
the exact entry-type vocabulary, event time, author-private drafts, one open
draft per author and Client, optimistic versions, current Client access,
atomic audited signing, immutable signed rows, signed history queries, and
flat same-scope corrections. PostgreSQL integration tests cover the access,
concurrency, audit, correction, and lower-level integrity boundaries.

The interactive **Anteckningar** Client-workspace workflow is implemented. It
provides own-draft create/reopen/save/discard, the exact eight approved types,
Swedish-local event date/time input, a dedicated signing review, explicit
signing, stacked signed history without body previews, immutable signed detail,
and separate flat corrections. Server Actions use only the Journal module's
authenticated public operations, and focused browser evidence covers draft
non-disclosure for Administrators and other Staff Members, access loss,
archived read-only presentation, stale saves, repeated signing, 375×812 use,
and high-text reflow.

Printable Journal views are deferred work and are not a Milestone 3 completion
criterion. Milestone 3 is complete: security and domain reviews, final focused
race and UI reviews, and pull-request CI passed; the final UI was squash-merged
to main in #34. Kaul is not production-ready, and the production
credential-delivery, sole-Administrator recovery, pilot, and
production-readiness gates remain open.

### Next product milestone — Milestone 4: Goals and Follow-ups

Milestone 4 is the current implementation focus; its approved scope and
completion criteria are defined above.

---

# Scope Decision Rule

When a requested feature does not clearly belong to the current milestone:

1. Do not implement it immediately.
2. Identify the milestone where it belongs.
3. Explain why implementing it now would increase scope or risk.
4. Record it as a future candidate only if it reflects a real customer need.
5. Continue with the smallest in-scope solution.

The purpose of this file is to keep Kaul moving forward without allowing enthusiasm, coding assistants, or imagined future requirements to make Version 1 unnecessarily large.
