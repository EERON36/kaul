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
- Månadsrapporter
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
- Monthly reports
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

Status: Complete.

## Goal

Help an authorised user answer both:

- What is the Client working toward?
- What needs to happen next?

The workflow remains Client-centred. It must not become a generic project- or
task-management system.

The detailed entity rules are defined in `docs/DOMAIN_MODEL.md`, access and
audit rules in `docs/SECURITY.md`, interaction requirements in `docs/UI.md`,
and implementation boundaries in `docs/ARCHITECTURE.md`.

## Scope

This milestone includes:

- Shared Client Goals with create, detail, edit, pause, complete, archive, and
  historical views
- Shared Client Follow-ups with create, detail, edit, assign, reassign,
  complete, cancel, and historical views
- One required responsible user for each Follow-up
- Required Follow-up due date and optional due time
- Derived overdue, due-today, and upcoming presentation
- A restrained **Att göra** Home section for the current user's own responsible
  planned Follow-ups
- Optional Goal references from author-private Journal drafts
- Immutable signing-time Goal-reference context on signed Journal entries
- Narrow immutable Follow-up responsibility-change history
- Immutable audit evidence only for the approved terminal and reassignment
  actions

## Authorisation Rules

- Every Goal and Follow-up read or mutation begins with the existing current
  Client authorisation boundary.
- Administrators may view and manage planning information for non-archived
  Clients in their Organisation and may view archived Client planning
  information read-only.
- Staff Members require a current active Assignment to an active Client. While
  authorised, they may view and manage that Client's shared Goals and
  Follow-ups.
- Goals and Follow-ups are shared Client planning information, not private
  per-user records.
- Follow-up responsibility is not an authorisation boundary.
- Creation, authorship, Goal activity, and Follow-up responsibility never grant
  or preserve Client access.

## Goal Rules

- A Goal is an ordinary editable planning object, not a signed record.
- Goals have no responsible owner in Version 1.
- A Goal requires an explicit start date. The create form initially prefills
  the current `Europe/Stockholm` calendar date, but the user may change it
  before saving. The server validates the submitted value; no database default
  is required by product policy.
- New Goals are `ACTIVE`. `ACTIVE` and `PAUSED` Goals may be edited and may
  transition between those two states.
- An `ACTIVE` or `PAUSED` Goal may become `COMPLETED` when the desired outcome
  was concluded as achieved, or `ARCHIVED` when retired without claiming
  completion.
- Goals cannot be hard-deleted in any lifecycle state in Version 1.
- `COMPLETED` and `ARCHIVED` are terminal in Version 1 and cannot be edited or
  reopened.
- Completed and archived Goals remain visible as Client history. Further work
  after a terminal Goal requires a new Goal.
- Goals remain optional, do not block Journal work, and do not use artificial
  percentage progress.

## Follow-up Rules

- A Follow-up is a concrete future Client action or check, not a Journal
  record.
- Persisted states are exactly `PLANNED`, `COMPLETED`, and `CANCELLED`.
- Only a `PLANNED` Follow-up may be edited or reassigned. It may transition to
  `COMPLETED` or `CANCELLED`; both states are terminal in Version 1.
- Follow-ups cannot be hard-deleted in any lifecycle state in Version 1.
- `COMPLETED` and `CANCELLED` Follow-ups cannot be edited, reassigned, or
  reopened.
- `OVERDUE`, due today, and `UPCOMING` are derived presentation states, not
  persisted lifecycle states.
- A Follow-up may reference zero or one non-terminal Goal from the same Client
  and Organisation. Goal-free Follow-ups remain valid.
- An existing Goal link survives Goal completion or archiving. Goal lifecycle
  actions do not cascade to Follow-ups.
- Completing a Follow-up never automatically creates or signs a Journal entry.

## Responsibility and Access-Loss Rules

- Every Follow-up stores exactly one responsible user.
- When a Follow-up is created or reassigned, the selected responsible user must
  be active, belong to the same Organisation, and currently have normal Client
  access. Eligible selections include currently assigned Staff Members and
  Administrators with normal Organisation Client access.
- An authorised user may assign or reassign a Follow-up to another eligible
  user. Creator and responsible user are separate concepts.
- A responsibility change preserves the previous user, new user, actor, and
  timestamp in narrow immutable history.
- If the responsible user later loses Client access, the Follow-up, its stored
  responsible user, and its history remain until an authorised user explicitly
  reassigns it. It is removed immediately from that user's Home, is not
  automatically reassigned, and does not block Assignment or account/access
  changes.
- Currently authorised users must be shown that the responsibility needs
  resolution and may reassign it. The former responsible user cannot read or
  mutate it.

## Journal Goal-Reference Rules

- While an author-private Journal entry is a `DRAFT`, its author may select zero
  or more Goals from the same Client.
- Signing freezes each selected Goal identifier and the Goal title displayed at
  signing time as immutable signed-record context.
- After signing, Goal-reference rows cannot be added, removed, or changed.
  Later Goal edits or lifecycle changes do not alter the signed display.
- Signed Journal entries cannot receive retrospective Goal links.
- A Goal reference does not mutate the Goal or grant Journal or Client access.

## Due-Date and Home Rules

- Follow-up dates and times use `Europe/Stockholm` operational semantics.
- A timed Follow-up becomes overdue after its specified Stockholm-local time.
  A date-only Follow-up becomes overdue on the following Stockholm calendar
  day.
- Ambiguous or nonexistent local times are rejected rather than guessed.
- **Att göra** contains only the signed-in user's responsible `PLANNED`
  Follow-ups for Clients they can currently access.
- Its non-overdue window covers today plus the next seven calendar days. It
  orders overdue items first, then items due today, then future upcoming items
  in that window. Within each group, the nearest due date and time appears
  first.
- Administrators who are responsible for Follow-ups use the same own-items
  concept.
- Rows, links, counts, and any future badges must not disclose inaccessible
  Client information. Own unfinished Journal drafts are outside Milestone 4
  Home scope.

## Audit and Integrity Rules

- The approved immutable audit actions are `GOAL_COMPLETED`, `GOAL_ARCHIVED`,
  `FOLLOW_UP_REASSIGNED`, `FOLLOW_UP_COMPLETED`, and `FOLLOW_UP_CANCELLED`.
- Reads, ordinary edits, Goal pause/resume, derived due-state changes, creation,
  and no-op submissions do not require immutable audit events in Version 1.
- Ordinary history is preserved through retained domain records, lifecycle
  actors and timestamps, and responsibility-change history rather than full
  edit revision history.
- Planning mutations use optimistic versions, reject stale writes, revalidate
  current Client access, and serialise with Client or Assignment changes where
  those changes can race.
- Responsible-user eligibility is revalidated during assignment and
  reassignment. Same-Organisation and same-Client relationships are enforced
  structurally, and historical planning records are not cascade-deleted.
- Journal's stronger signing integrity applies to signed Goal-reference context,
  but must not be copied onto every ordinary planning edit.

## Explicitly Excluded

This milestone does not include:

- Client Documents or uploads
- Calendar synchronisation
- Email reminders
- SMS reminders
- Other notifications
- Recurring Follow-ups
- AI summaries or prioritisation
- Automatic Journal entries
- Follow-up-to-Journal links
- Goal owners
- Multiple Follow-up owners
- Subtasks, checklists, or dependencies
- Reopening terminal items
- Full revision history for every edit
- Workflow configuration
- Staff workload or productivity metrics
- Charts
- Kanban boards
- External integrations
- PWA or offline behaviour
- A **Nästa för klienten** overview summary
- A post-completion **Skapa/Skriv anteckning** shortcut

## Completion Criteria

Milestone 4 is complete when:

- Authorised users can manage shared Goals and Follow-ups within the approved
  current Client access boundary.
- Goal and Follow-up fields, lifecycles, terminal-state rules, and history match
  the approved domain model.
- Responsibility is always clear, eligibility is revalidated, responsibility
  changes are preserved, and access loss does not leak or silently reassign
  work.
- Journal drafts can optionally select same-Client Goals, and signing preserves
  immutable Goal identifiers and title snapshots without retrospective changes.
- **Att göra** shows only the current user's authorised responsible planned
  Follow-ups with the approved overdue, due-today, and seven-day ordering.
- The approved audited transitions use Kaul's immutable audit guarantees without
  creating audit noise for ordinary planning edits.
- Stale writes, duplicate terminal actions, cross-Organisation links,
  cross-Client links, and Assignment/access races are denied and tested.
- Archived Client planning information is read-only and visible only through
  existing archived-Client access.
- The Client workspace provides separate **Mål** and **Uppföljningar**
  destinations alongside **Översikt** and **Anteckningar**.
- Goals and follow-ups remain simple enough for the 2 AM Test.
- Laptop, 375×812, 200% zoom/reflow, keyboard, focus, Swedish-copy, and
  text-not-colour status requirements are verified for the implemented flows.
- No deferred workflow, notification, calendar, document, analytics, or
  Journal-automation infrastructure has been introduced.

## Post-Milestone 4 Direction

Milestone 4 does not automatically start another feature milestone. After M4,
the priority is to make Kaul usable and safely deployable for a controlled pilot
before expanding the feature set without validated need. The first pilot uses
fictional or sanitised data until every production and security blocker required
for real sensitive information is resolved. Existing production-readiness,
credential-delivery, account-recovery, legal, operational, backup, and security
gates remain in force.

---

# Milestone 5 — Documents and Monthly Reports

## Goal

Allow authorised users to upload Client documents and create reliable,
manually authored monthly reports.

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
- Monthly Report creation for an explicit calendar year and month
- Six structured report sections shared with structured Journal entries
- One shared optimistic-concurrency draft per Client and month
- Draft and signed report status
- Immutable signer snapshots and directly linked replacements
- Printable report
- Stable report reference
- Relevant audit events

## Monthly Report Rules

- One canonical report lineage exists per Organisation, Client, and calendar
  month.
- Drafts are shared Client deliverables, not author-private records.
- The six sections are manually authored; Journal entries are not copied or
  synthesised automatically.
- Signed reports must not change, including for Administrators.
- A correction is a new, directly linked replacement that preserves every
  earlier signed report.
- Automated interpretation or AI-generated analysis remains excluded.

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
- Monthly Reports remain Client- and Organisation-scoped.
- Signed reports remain historically stable and linked replacements are
  traceable.
- Reports display Swedish calendar month and year correctly.
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
- Search across monthly reports
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
- Monthly reports
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

Status: In progress.

The integrated release candidate contains the repository-approved Pilot
deployment foundation and the approved product-hardening chain: form safety,
the Swedish non-disclosing not-found page, accessibility hardening, and
Administrator and Client orientation.

The dependency audit gate remains open and blocking:
`prisma@7.9.1 -> @prisma/config@7.9.1 -> deepmerge-ts@7.1.5` is affected by
`GHSA-ggr8-5vv4-36mx`. The candidate must not be merged, tagged, published, or
described as release-ready or Pilot-ready while this gate remains red.

The concise repository/operations snapshot and current evidence boundaries are
maintained in `docs/PROJECT_STATE.md`. This milestone remains the authority for
scope and completion.

Live GHCR image verification, inspection and rehearsal on the existing Ubuntu
VM, NPM-backed DNS and HTTPS,
encrypted off-host backup and restore, monitoring, operational ownership, and
critical user-workflow acceptance remain outstanding. Real or sensitive data
is not approved.

The Have I Been Pwned plugin review deferred by ADR 0001 also remains an open
Milestone 7 security decision. Its network, privacy, availability, failure-mode,
and user-message implications must be reviewed; this is not approval to add the
plugin.

## Goal

Prepare Kaul for controlled pilot use on the Proxmox homelab using fictional or non-sensitive information.

## Scope

This milestone includes:

- Production-style Docker image
- Pilot Docker Compose configuration
- Caddy reverse proxy
- Existing Nginx Proxy Manager as the Homelab public TLS edge, without making
  Kaul application behavior depend on NPM
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
- Uploaded-file backups when file uploads are included in the approved pilot
  workflow
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
- The existing Ubuntu VM passes the supported host preflight or a concrete
  incompatibility is reviewed before any replacement VM is considered.
- HTTPS works correctly.
- The router's public 80/443 path remains on NPM; the Kaul VM's private Caddy
  listener is bound to its LAN address and accepts only the exact NPM peer
  observed during authorised runtime inspection.
- NPM-to-Caddy Host, scheme, and client-IP handling passes spoofed-header and
  non-NPM negative tests; future direct-public Caddy remains configuration-driven.
- PostgreSQL is not publicly exposed.
- Proxmox is not exposed through the Kaul domain.
- Development and pilot use separate credentials and databases.
- Automatic database backups run successfully.
- Uploaded-file backups run successfully when file uploads are in pilot scope.
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

### Milestone 1 — Authentication and User Administration: Complete

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

Milestone 1's implemented product scope and completion criteria are complete.
The following operational controls remain outstanding production blockers and
are not weakened by that milestone status:

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

### Milestone 4 — Goals and Follow-ups: Complete

The Milestone 4 domain/database foundation and visible Client-planning
workflows are implemented. Authorised users can manage retained shared Goals
and Follow-ups through their approved lifecycles; responsibility eligibility,
access-loss behaviour, immutable reassignment history, optimistic concurrency,
Stockholm due semantics, and the five approved audit actions are enforced on
the server and in PostgreSQL. **Att göra** shows only the current user's own
authorised planned Follow-ups in the approved order.

Journal drafts support optional same-Client Goal selection. Signing freezes
Goal identifiers and title snapshots as immutable signed-record context while
preserving the correction workflow and truthful partial-save recovery. The
Client workspace provides separate **Mål** and **Uppföljningar** destinations,
including archived read-only history and visible terminal dates.

Merged permanent evidence includes the foundation's focused M4 PostgreSQL
17/17, Journal/Client/Assignment 40/40, integration 173/173, and unit 337/337
results, plus the UI slice's M4 Playwright 6/6, Client/Journal Playwright
12/12, planning integration 17/17, Journal integration 15/15, focused action
and form tests, audit policy, lint, typecheck, build, and successful pull-request
CI. The foundation was squash-merged in #38 and the visible workflows in #39.
Milestone 4 is complete.

### Current focus — Pilot Readiness and approved product track

Pilot Readiness remains an open release track. In parallel, the approved
product track expands Client information, converts new Journal drafts to six
structured sections without rewriting legacy records, and implements the
Client-scoped Monthly Report lifecycle. This product work does not authorise a
deployment or the use of real sensitive information.

Personnummer in this product track uses the separately approved Stage A
envelope-encryption design in ADR 0003. The schema migration preserves old
plaintext only as an explicit conversion source; attended Stage B conversion,
restore proof with retained keys, and separately approved Stage C removal are
required before that transition is complete. Client Documents remain deferred
and must later stay Client-scoped.

Pilot Readiness should establish:

- Repeatable deployment to the pilot server through an HTTPS subdomain
- A separate pilot environment, database, configuration, and secrets
- Verified backup and restore procedures
- A safe Administrator bootstrap and account-support workflow
- Basic operational logging, monitoring, and repeatable updates
- Fictional or sanitised pilot data and a 1–2 week user-feedback loop
- A later deliberate migration path to organisation-approved infrastructure

Pilot Readiness is not complete and does not make Kaul ready for real sensitive
information. Documents, uploads, notifications, global search, exports, and
other deferred features do not become pilot requirements without a validated
blocking need. The approved Monthly Report product track does not remove any
credential-delivery, account-recovery, legal, operational, backup, security,
or production-readiness gate.

---

# Scope Decision Rule

When a requested feature does not clearly belong to the current milestone:

1. Do not implement it immediately.
2. Identify the milestone where it belongs.
3. Explain why implementing it now would increase scope or risk.
4. Record it as a future candidate only if it reflects a real customer need.
5. Continue with the smallest in-scope solution.

The purpose of this file is to keep Kaul moving forward without allowing enthusiasm, coding assistants, or imagined future requirements to make Version 1 unnecessarily large.
