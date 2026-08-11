# Kaul Development Milestones

## Milestone 1 authentication audit status

- `INITIAL_ADMIN_CREATED` is integrated with durable intent, atomic success,
  failure and ambiguity handling, and reviewed empty-install recovery.
- `PASSWORD_CHANGED` is integrated with the forced password-change transaction
  and post-commit replacement-cookie handling.
- `LOGIN_SUCCEEDED` is integrated with durable trusted-identity intent,
  transactionally coupled Session success, and post-commit cookie release.
- `LOGIN_FAILED` is integrated for pre-trust invalid credentials; `LOGOUT_SUCCEEDED`
  integration remains outstanding.

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

Slice 3 creates the initial Administrator only for fictional-data development and pilot verification. The persistent audit foundation now exists, but the bootstrap workflow does not yet store its required `INITIAL_ADMIN_CREATED` event. Console output is not an audit event, and the workflow is not production-security complete until that event is stored. An organisation-approved credential-delivery channel and a sole-Administrator recovery procedure also remain required before production operational acceptance.

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

Allow authorised staff members to create professional client documentation with reliable signing and correction behaviour.

## Scope

This milestone includes:

- Ny anteckning workflow
- Draft journal entries
- Journal-entry types
- Event date and time
- Journal content
- Optional structured sections
- Incident indicator
- Stable journal reference identifiers
- Signing
- Historical signer snapshot
- Signed-entry immutability
- Correction entries
- Journal list within the client workspace
- Journal search for authorised records
- Printable journal-entry view
- Relevant audit events

## Journal Entry Types

Initial types may include:

- Daganteckning
- Samtal
- Telefonsamtal
- Möte
- Hembesök
- Skolkontakt
- Observation
- Incident
- Övrigt

The primary action remains:

- Ny anteckning

Users should not need to choose a complex workflow before beginning documentation.

## Signing Rules

Signing must preserve:

- Signer name
- Professional title
- Application role
- Signing timestamp
- Stable journal reference

Signed entries must not change when the user later changes their profile.

## Correction Rules

- A correction is a separate journal entry.
- The correction references the original entry.
- The original signed text remains unchanged.
- The relationship between the records remains visible.
- Corrections are themselves signed.

## Explicitly Excluded

This milestone does not include:

- Collaborative editing
- Automatic text generation
- AI summaries
- Advanced approval chains
- Hard deletion of signed records
- Email distribution of journal content
- Offline drafts
- Browser-storage drafts

## Completion Criteria

Milestone 3 is complete when:

- Authorised staff members can create drafts.
- Drafts can be edited by their authorised author.
- Drafts can be signed.
- Signing occurs on the server.
- Signing information is historically preserved.
- Signed entries cannot be edited through ordinary application behaviour.
- Attempts to modify signed entries are denied and tested.
- Corrections preserve the original record.
- Journal entries are visible only to authorised users.
- Direct journal URLs enforce permissions.
- Journal text is absent from ordinary operational logs.
- Journal actions create suitable audit events.
- Journal records can be printed clearly.
- The complete note workflow passes the 2 AM Test.

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
verified for fictional development and pilot verification. Persistent
`INITIAL_ADMIN_CREATED` audit storage, an approved credential-delivery channel,
and sole-Administrator recovery remain outstanding production blockers.

Slice 4 — login, forced first password change, authenticated application shell,
and logout — is implemented and verified.

The Milestone 1 Audit Foundation is implemented and verified as the prerequisite
for later protected Administrator mutations. It provides immutable durable
operation intents, append-only outcome and recovery events, idempotency keys,
and database-level immutability. No existing authentication workflow has been
retrofitted in this foundation slice.

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

- Authentication audit persistence for `LOGOUT_SUCCEEDED`
- The organisation-approved production credential-delivery channel
- The sole-Administrator credential-loss recovery procedure

### Milestone 2 — Clients and Assignments: Implementation in Progress

The Client Foundation slice is implemented and verified. Administrators can
create organisation-owned Clients and manage historical primary and secondary
Staff assignments. Staff access requires both an active Client and an active
assignment, and one central server-side access boundary protects Client lists
and direct Client routes.

Client creation and Assignment creation/end operations use durable audit
intents and transactionally coupled successful outcomes. PostgreSQL enforces
organisation-safe assignment relationships, one active primary assignment, and
one active assignment per Client and Staff Member.

Later Milestone 2 work remains outstanding, including Client editing,
archiving, controlled category selection, basic search, and any broader home
view. Journal, document, goal, follow-up, and report functionality remain in
their later milestones. Further Client-domain expansion remains paused until
the remaining Milestone 1 authentication audit integrations are complete.

---

# Scope Decision Rule

When a requested feature does not clearly belong to the current milestone:

1. Do not implement it immediately.
2. Identify the milestone where it belongs.
3. Explain why implementing it now would increase scope or risk.
4. Record it as a future candidate only if it reflects a real customer need.
5. Continue with the smallest in-scope solution.

The purpose of this file is to keep Kaul moving forward without allowing enthusiasm, coding assistants, or imagined future requirements to make Version 1 unnecessarily large.
