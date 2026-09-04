# Kaul Domain Model

Version: 0.1

---

## Purpose

This document describes the core business concepts in Kaul and how they relate to each other.

It defines the language and rules of the system independently of database technology, frameworks, user-interface components, or hosting infrastructure.

The domain model should support the first version of Kaul without introducing unnecessary complexity or preventing reasonable future growth.

This document is not a database schema. Implementation-specific field types, indexes, tables, migrations, and constraints will be defined separately.

---

## Domain Principles

The domain model follows these principles:

- The client is the centre of the system.
- Documentation belongs to a specific client.
- Access is determined by roles and active assignments.
- Signed records preserve their historical meaning.
- Corrections are explicit and traceable.
- Archived information is retained unless a defined policy permits removal.
- Reports summarize existing information rather than replacing source records.
- Customer data must remain exportable and portable.
- Version 1 should remain simple enough for a small organisation with few users.

---

## Core Domain Entities

Kaul is built around the following core domain entities:

- Organisation
- User
- Client
- Assignment
- Journal Entry
- Goal
- Follow-up
- Document
- Weekly Report
- Audit Event

Each entity should have one clear responsibility and should not contain unrelated behaviour.

---

## Organisation

An organisation represents the company, service, or operational unit using Kaul.

Version 1 supports one active organisation. Core records should nevertheless belong conceptually to an organisation so that future support for multiple organisations does not require redesigning the domain.

An organisation has:

- Name
- Organisation number
- Contact information
- Status
- Created date
- Updated date

An organisation owns:

- Users
- Clients
- Assignments
- Journal entries
- Goals
- Follow-ups
- Documents
- Weekly reports
- Audit events

### Organisation Rules

- Users may only access information belonging to their organisation.
- Organisation boundaries must never be bypassed.
- Multi-organisation administration is not part of Version 1.
- The existence of the organisation entity must not add unnecessary complexity to the first user experience.

---

## User

A user represents a person who can access Kaul.

A user authenticates using an individual account and is assigned a role that determines the actions they may perform.

Users do not directly own clients. Access to clients is established through assignments or administrative authority.

A user has:

- Name
- Email address
- Secure authentication credentials
- Role
- Professional title
- Status
- Created date
- Updated date
- Last login date

Supported Version 1 roles are:

- Administrator
- Staff Member

The Swedish interface may display role or professional titles such as:

- Administratör
- Pedagog
- Behandlare
- Socialsekreterare
- Stödassistent

A user may have:

- Many client assignments
- Many created journal entries
- Many signed journal entries
- Many created goals
- Many created follow-ups
- Many responsible follow-ups
- Many uploaded documents
- Many created reports
- Many audit events

### User Rules

- `name` is the staff member's complete display and professional name in Version
  1 and is compatible with Better Auth's canonical `name` field.
- Milestone 1 must not introduce redundant first-name and last-name fields.
- A future requirement for structured personal-name components requires a
  separate domain decision and migration.
- Every person must use an individual account.
- Accounts must not be shared.
- Inactive users cannot authenticate.
- Deactivating a user must not remove records they previously created or signed.
- Historical records must continue displaying the responsible user's name, role, and title as they appeared when the record was signed.
- Version 1 does not require public registration.
- Administrators create or invite other users.

---

## Client

A client represents a person receiving support from the organisation.

The client is the central entity in Kaul. Journal entries, assignments, goals, follow-ups, documents, and weekly reports are organised around the client.

A Version 1 client is initially created with exactly:

- First name
- Last name
- Person identifier
- Category

Contact information is deferred to a later reviewed slice.

A client also has server-owned lifecycle information:

- Status
- Created date
- Updated date
- Archived date where applicable

The intended product categories are:

- Youth
- Adult

The Swedish interface displays these approved categories as:

- Ungdomar
- Vuxna

These categories must remain clearly separated in the application for legal and
operational reasons. The current requirement establishes category and UI
separation only; it does not establish independently separated staff access or
visibility.

Open domain question: Does this requirement mean only clear organisational/UI
separation, or must staff access/visibility also be independently separated
between Vuxna and Ungdomar?

The Client Foundation stores category as a required trimmed string of at most
100 characters rather than a database enum. The normal Client creation
workflow accepts only the internal values `YOUTH` and `ADULT`, displayed as
Ungdomar and Vuxna. Existing other strings are preserved and shown separately
until they can be reviewed; they do not create a new access-control boundary.

A client may have:

- Many assignments
- Many journal entries
- Many goals
- Many follow-ups
- Many documents
- Many weekly reports
- Many related audit events

### Client Rules

- Every client belongs to one organisation.
- The Version 1 person identifier is an opaque organisation-local reference,
  not a Swedish personal identity number. It is trimmed, Unicode NFC
  normalised, uppercased, limited to 64 characters, and unique within the
  organisation.
- Client categories are required strings in the approved `YOUTH`/`ADULT`
  vocabulary for normal creation. The database does not enforce the vocabulary
  so existing out-of-range records can be preserved for review.
- Client status is `INACTIVE`, `ACTIVE`, or `ARCHIVED`.
- New clients are `INACTIVE` with no archive date.
- Creating the first active primary assignment activates an inactive client.
- Ending the active primary assignment makes the client inactive without
  ending its secondary assignments.
- While the client is inactive, retained active secondary assignments do not
  grant access. If a new primary assignment later reactivates the client, those
  still-active secondary assignments grant access again.
- An archived client has an archive date. Active and inactive clients do not.
- A client may be archived only while `INACTIVE`, without an archive date, and
  after every Assignment has been manually ended. Archiving never ends an
  Assignment automatically.
- Archived clients are read-only in Version 1. Administrators retain historical
  access, but ordinary Client editing and Assignment management are unavailable.
  Staff access and ordinary Staff Client discovery remain denied.
- Restoring or unarchiving a Client is not part of Version 1.
- Every active client must have at least one active primary assignment before ordinary staff access is granted.
- Administrators may access all clients in their organisation.
- Staff members may only access clients through an active assignment.
- Youth and adult clients follow the same documentation workflow.
- Archiving a client prevents normal active work while preserving historical documentation.
- Archiving is not the same as deletion.
- A client identifier should remain stable throughout the lifetime of the record.
- Personal data collected for a client should be limited to information required by the organisation.

---

## Assignment

An assignment connects a user to a client.

Assignments determine which staff members may access and work with a client.

An assignment has:

- Client
- Assigned user
- Assignment type
- Active or ended state derived from the end date
- Start date
- End date where applicable
- Created date
- Created by

Supported Version 1 assignment types are:

- Primary
- Secondary

An assignment may later support temporary access, but temporary assignment workflows are not required in Version 1.

### Assignment Rules

- A client may have one active primary assignment.
- A client may have zero or more active secondary assignments.
- An assignment is active exactly while its end date is absent.
- A secondary assignment may be created only for an active client that already
  has an active primary assignment.
- Archived clients cannot receive new assignments.
- A user may have assignments to many clients.
- An assignment belongs to one organisation.
- Only an active Staff Member in the same organisation may receive a new
  assignment. Administrators are not assignment targets.
- Staff access exists only while the assignment is active.
- Staff access also requires the client itself to be active.
- Ending an assignment removes future access but does not alter historical records.
- Assignment responsibility is immutable in Version 1. Changing responsibility
  means ending one assignment and creating another.
- Assignment records are ended by setting their end date and are not deleted
  through ordinary application behaviour.
- Assignment changes must be recorded in the audit log.
- An administrator may create, change, or end assignments.
- A staff member cannot assign themselves to a client.

---

## Journal Entry

A journal entry represents a professional record concerning one client.

The primary user action in the Swedish interface is:

- Ny anteckning

In Version 1, a journal entry is either the author's unfinished draft or a
signed record. A correction is a separate signed journal entry linked directly
to the signed original that it corrects.

A journal entry has:

- Client
- Organisation
- Author
- Entry type
- Event date and time
- Written content
- Status: `DRAFT` or `SIGNED`
- Created date
- Updated date while still a draft
- Signed date
- Historical signing information
- Stable reference identifier
- Optional original signed entry, for a correction

Version 1 has exactly these eight allowed journal-entry types, displayed in
Swedish as:

- Daganteckning
- Samtal
- Telefonsamtal
- Möte
- Hembesök
- Skolkontakt
- Observation
- Övrigt

Incident classification remains deferred and is not part of the Milestone 3
entry-type vocabulary.

### Journal Entry Rules

- Every journal entry belongs to exactly one client.
- Every journal entry belongs to one organisation.
- Every journal entry records its established entry type and the date and time
  of the event being documented.
- Event date and time describes the documented event. It remains distinct from
  record creation, draft update, and signing timestamps.
- Creating or continuing an entry always requires current authorisation for its
  Client.
- Version 1 permits at most one open draft for each author and Client.
- A draft is visible only to its author, including when another user is an
  Administrator. Only the author may read, reopen, edit, save, discard, or sign
  it.
- Draft privacy applies to lists, counts, previews, direct URLs, search
  results, Server Actions, and every other application surface.
- Saving preserves a draft and is not signing.
- Signing is a separate authenticated Kaul action that changes `DRAFT` to
  `SIGNED`. In Version 1 the draft author performs the signing action and is
  the signer; browser-supplied author or signer identity is not authoritative.
- Kaul signing is not a cryptographic digital signature, BankID, an external
  electronic signature, or certificate-based signing.
- A signed entry must preserve the signer's name, professional title,
  application role, signing timestamp, and stable journal reference as
  historical information.
- Signed-entry visibility follows current Client authorisation: an
  Administrator may read signed entries for Clients in their Organisation,
  and a Staff Member may read signed entries only while current assignment
  rules grant Client access.
- Historical authorship alone does not preserve draft or signed-entry access
  after the author loses Client authorisation.
- The Ungdomar/Vuxna category is not a Journal authorisation boundary.
- A signed original is immutable and cannot be edited or deleted by a Staff
  Member or Administrator.
- A correction is a separate signed entry linked directly to its original
  signed entry. The original remains unchanged, and Version 1 does not create
  an arbitrary correction tree.
- A correction may be authored and signed by a currently authorised assigned
  Staff Member or an Administrator with Organisation and Client access. It has
  its own author, content, signing action, historical signing information, and
  audit evidence.
- A correction and its original must belong to the same Client and
  Organisation, and the referenced original must already be signed.
- The Journal lifecycle must prevent stale draft overwrites, simultaneous or
  repeated signing, duplicate open drafts for one author and Client, signed
  record mutation or deletion, and invalid or cross-boundary correction links.
- While the author's entry remains a draft, the author may select zero or more
  Goals belonging to that same Client and Organisation. Goal selection remains
  optional.
- Signing freezes each selected Goal identifier and the Goal title displayed at
  signing time as immutable signed-record context. Signed Goal-reference rows
  cannot later be added, removed, or changed, and later Goal edits or lifecycle
  changes do not alter the signed display.
- Signed entries cannot receive retrospective Goal links. A Goal reference does
  not mutate the Goal or grant Journal or Client access.
- A journal entry should remain understandable when exported independently of the Kaul interface.

---

## Goal

A goal represents an agreed area of focus for a Client: what the Client is
working toward.

Goals may be used to connect daily documentation with longer-term support work.
They are ordinary shared planning objects, not signed records, and have no
responsible owner in Version 1.

A goal has:

- Organisation
- Client
- Required concise title
- Optional description
- Status
- Required explicit start date
- Optional target or review date
- Creator
- Created date
- Updated date
- Completion date and actor where applicable
- Archive date and actor where applicable
- Version for optimistic stale-write protection

Version 1 statuses are:

- `ACTIVE`
- `PAUSED`
- `COMPLETED`
- `ARCHIVED`

A goal may be referenced by many journal entries.

### Goal Rules

- Every goal belongs to exactly one organisation.
- Every goal belongs to exactly one client.
- New Goals are `ACTIVE`.
- The create form initially prefills the current `Europe/Stockholm` calendar
  date, and the user may change it before saving. The submitted start date must
  still be explicit and server-validated; product policy does not require a
  database default.
- `ACTIVE` and `PAUSED` Goals may be edited and may transition between those
  two states.
- An `ACTIVE` or `PAUSED` Goal may transition to `COMPLETED` when the desired
  outcome was concluded as achieved, or to `ARCHIVED` when it was retired
  without claiming completion.
- Goals cannot be hard-deleted in any lifecycle state in Version 1.
- `COMPLETED` and `ARCHIVED` are terminal in Version 1. A terminal Goal cannot
  be edited or reopened. Further work requires a new Goal.
- Goals use no artificial percentage progress.
- Changing a Goal must not alter the historical meaning of signed Journal
  entries that previously referenced it. Signing preserves the referenced Goal
  identifier and signing-time title independently of later Goal changes.
- Completed and archived goals remain visible in client history.
- A journal entry may relate to zero or more goals.
- Goal management should remain optional in Version 1 and must not block ordinary documentation.

---

## Follow-up

A follow-up represents a concrete planned future action or check concerning a
Client: what needs to happen next. It is shared Client planning information,
not a private task or Journal record.

Examples include:

- Scheduled conversation
- Weekly check-in
- Network meeting
- Document review
- Goal review
- Contact with another party

A follow-up has:

- Organisation
- Client
- Required concise title
- Optional description
- Required due date
- Optional due time
- Exactly one responsible user
- Optional link to one Goal
- Status
- Creator
- Created date
- Updated date
- Completion date and actor where applicable
- Cancellation date and actor where applicable
- Version for optimistic stale-write protection

Persisted Version 1 statuses are exactly:

- `PLANNED`
- `COMPLETED`
- `CANCELLED`

### Follow-up Rules

- Every follow-up belongs to exactly one organisation.
- Every follow-up belongs to exactly one client.
- Every Follow-up stores exactly one responsible user.
- When a Follow-up is created or reassigned, the selected responsible user must
  be active, belong to the same Organisation, and currently have normal Client
  access. Eligible selections are currently assigned Staff Members and
  Administrators with normal Organisation Client access.
- An authorised user may assign or reassign a Follow-up to another eligible
  user. Creator and responsible user are separate concepts.
- Responsibility is not an authorisation boundary and never grants Client
  access.
- Each reassignment preserves narrow immutable history containing the previous
  responsible user, new responsible user, acting user, and timestamp.
- If a responsible user later loses Client access, the Follow-up, its stored
  responsible user, and historical responsibility remain until an authorised
  user explicitly reassigns it. The item disappears immediately from that
  former user's Home. Assignment or account/access changes are not blocked,
  responsibility is not changed automatically, and currently authorised users
  must be shown that reassignment is needed. The former responsible user can no
  longer read or mutate it.
- A follow-up is a planning item, not a journal record.
- Only `PLANNED` Follow-ups are editable or reassignable. A `PLANNED` item may
  transition to `COMPLETED` or `CANCELLED`; both are terminal in Version 1.
- Follow-ups cannot be hard-deleted in any lifecycle state in Version 1.
- `COMPLETED` and `CANCELLED` Follow-ups cannot be edited, reassigned, or
  reopened.
- A Follow-up may reference zero or one Goal. The Goal must belong to the same
  Client and Organisation and must be non-terminal when a new link is made.
  Goal-free Follow-ups remain valid.
- An existing Goal link survives Goal completion or archiving. Goal lifecycle
  actions never complete, cancel, or otherwise mutate linked Follow-ups.
- Completing a follow-up does not automatically create a journal entry.
- Goal or Follow-up actions never automatically create or sign Journal entries.
- `OVERDUE`, due today, and `UPCOMING` are derived presentation states rather
  than stored lifecycle statuses.
- Due dates and optional times use `Europe/Stockholm`. A timed Follow-up becomes
  overdue when its specified Stockholm-local time has passed. A date-only
  Follow-up becomes overdue on the following Stockholm calendar day. Ambiguous
  or nonexistent local times are rejected rather than guessed.
- Follow-ups visible to any user must concern Clients they can currently
  access. Historical creation or responsibility does not preserve access.
- Home shows only the current user's responsible `PLANNED` Follow-ups for
  currently accessible Clients. Its non-overdue window covers today plus the
  next seven calendar days, grouped as overdue, due today, then future upcoming,
  with nearest due date and time first within each group.
- Advanced calendar synchronisation is not part of Version 1.

---

## Document

A Document is a stable logical record for one Organisation and one Client. In
Version 1 it represents an uploaded file; generated documents and a social-care
type taxonomy are not part of this slice.

A Document has a title, optional description, active or archived status,
creator, creation time, and zero or more immutable DocumentVersions. Each
accepted DocumentVersion records its monotonically increasing version number,
original and safe display filename, canonical approved media type and
extension, byte size, opaque storage key, SHA-256 digest, uploader, upload time,
and clean malware-scan evidence.

### Document Rules

- Every client document belongs to exactly one client.
- Every document belongs to one organisation.
- The database stores document metadata and a storage reference, not the file content as ordinary database text.
- Files must be stored through a replaceable storage abstraction.
- Storage must not depend on a hard-coded local path or a specific hosting provider.
- Moving from local storage to object storage must not require changing the domain model.
- Original uploaded files should be preserved.
- Replacing a file always creates a new immutable DocumentVersion and never
  overwrites or deletes an accepted version.
- Version 1 accepts only PDF, JPEG, PNG, and valid UTF-8 plain text, one file per
  request, with an actual streamed maximum of 25 MiB.
- Only Administrators may logically archive an active Document. There is no
  hard delete, purge, unarchive, or metadata-edit workflow in Version 1.
- An archived Client is historical read/download only. Staff access still
  requires an active primary or secondary assignment to an active Client.
- Access to documents follows the same server-side Client authorisation as
  other records. Guessing a URL or identifier must not bypass that check.
- Upload, new version, archive, scan rejection, and each successful download
  authorisation use the durable audit architecture with minimal identifiers.
- Storage is private filesystem-backed for Pilot behind `DocumentStorage`;
  provider details remain outside this domain model.

---

## Weekly Report

A weekly report represents a printable summary of a client's documented activity during a selected calendar week.

A weekly report is generated from existing journal entries and related information. It must not replace or modify the original journal records.

A weekly report has:

- Client
- Calendar week
- Date range
- Included journal entries
- Generated summary
- Optional manually written summary
- Incident overview
- Goal overview
- Generated by
- Generated date
- Status
- Optional signed date
- Optional signer
- Stable reference identifier

Possible statuses include:

- Draft
- Final

### Weekly Report Rules

- Every weekly report belongs to exactly one client.
- The report only includes information the generating user is authorised to access.
- Source journal entries remain the authoritative records.
- Finalising a report preserves the report as it appeared at that time.
- Later changes or corrections to source records must not silently rewrite an already finalised report.
- Regenerating a final report creates a new version or new report.
- Reports must be printable and exportable.
- Version 1 may use a straightforward chronological summary rather than automated interpretation.

---

## Audit Operation and Event

An audit operation is the immutable durable intent and context for an important
action performed in Kaul. An audit event records the append-only outcome of that
operation or a later reviewed recovery.

It exists for traceability, security, and accountability.

Examples include:

- Successful login
- Failed login
- User creation
- User deactivation
- Client creation
- Client update
- Client archive
- Assignment creation
- Assignment change
- Journal signing
- Journal draft creation or discard where required by audit policy
- Journal correction
- Goal completion or archive
- Follow-up reassignment, completion, or cancellation
- Document upload
- Report finalisation
- Data export
- Administrative access to sensitive operations

An audit operation has:

- A unique operation identifier
- Organisation where it can be established safely
- Actor kind and acting User identifier where known
- Action type
- Target entity type
- Optional target entity identifier
- Creation timestamp

An audit event has:

- The related audit operation
- Outcome or recovery type
- Successful, failed, or, for an initial outcome only, ambiguous result
- Optional resolved target identifier
- Event timestamp

### Audit Event Rules

- Audit operations are immutable and audit events are append-only.
- An operation intent is committed before a protected Administrator mutation
  starts.
- Approved Goal and Follow-up audited transitions performed by an authorised
  Administrator or Staff Member also require the existing durable intent and
  immutable outcome guarantees.
- Outcomes and recoveries are added as separate records; an intent is never
  updated into a result.
- Ordinary users cannot edit or delete audit operations or events.
- Audit records must not contain full journal text, passwords, authentication secrets, or unnecessary sensitive personal information.
- Generic audit metadata is not stored. New audit context requires explicit,
  reviewed fields.
- Audit events must remain understandable after users or clients are archived.
- Failed security-relevant actions may be audited even when no authenticated user exists.
- Journal draft creation and discard may be audited. Ordinary draft saves do
  not create immutable audit noise.
- Signing an original or a correction requires immutable audit evidence and
  follows the existing durable-intent and immutable-outcome principles.
- Version 1 planning audit actions are exactly `GOAL_COMPLETED`,
  `GOAL_ARCHIVED`, `FOLLOW_UP_REASSIGNED`, `FOLLOW_UP_COMPLETED`, and
  `FOLLOW_UP_CANCELLED`. Creation, reads, ordinary edits, Goal pause/resume,
  derived due-state changes, and no-op submissions do not create immutable
  audit events.
- Planning audit records do not contain Goal or Follow-up descriptions, Journal
  text, Client names, other sensitive free text, request bodies, or exception
  text.
- Actor, Organisation, and target identifiers are immutable historical scalar
  references rather than lifecycle foreign keys. This permits a bootstrap intent
  before Organisation creation and prevents lifecycle cascades from removing
  audit history.
- Audit retention and access policies will be defined separately.
- The audit log is not a substitute for the journal.

---

## Entity Relationships

The main relationships in Kaul are:

```text
Organisation
├── Users
├── Clients
├── Assignments
├── Journal Entries
├── Goals
├── Follow-ups
├── Documents
├── Weekly Reports
└── Audit Events

User
├── Assignments
├── Authored Journal Entries
├── Signed Journal Entries
├── Created Goals
├── Created Follow-ups
├── Responsible Follow-ups
├── Uploaded Documents
├── Generated Reports
└── Audit Events

Client
├── Assignments
├── Journal Entries
├── Goals
├── Follow-ups
├── Documents
└── Weekly Reports

Assignment
├── One User
└── One Client

Journal Entry
├── One Client
├── One Author
├── Historical Signing Information when Signed
├── Zero or More Immutable Signed Goal References
└── Optional Original Signed Journal Entry for a Correction

Goal
├── One Client
├── One Creator
├── Optional Completion or Archive Actor
├── Many Referencing Follow-ups
└── Many Journal Entries through Goal References

Follow-up
├── One Client
├── One Creator
├── One Responsible User
├── Optional Goal
└── Immutable Responsibility-change History

Weekly Report
├── One Client
├── One Generating User
├── Optional Signer
└── Many Included Journal Entries
```

---

## Access Model

Access is determined using both role and assignment.

### Administrator

An administrator may access all clients and signed records belonging to their
organisation. An unfinished Anteckning draft is the explicit exception: an
Administrator may access only their own draft and only while they retain
normal Client authorisation. Administrators may view and manage shared Goals
and Follow-ups for non-archived Organisation Clients and may view archived
Client planning information read-only.

### Staff Member

A staff member may access a Client only when they have an active primary or
secondary assignment to that Client. Within an accessible Client, they may see
signed journal entries but only their own unfinished draft. While the Client
remains active and assigned, they may view and manage its shared Goals and
Follow-ups.

### Domain Access Rules

- Permission checks must be enforced by the application backend.
- Hiding links or navigation items is not sufficient access control.
- Search, Goals, Follow-ups, reports, documents, exports, and direct URLs must
  apply the same access rules.
- Draft lists, counts, previews, direct URLs, search results, and mutations must
  not disclose another user's unfinished Anteckning draft.
- Historical creation, authorship, Goal activity, or Follow-up responsibility
  does not grant or preserve access after an Assignment ends.
- Goals and Follow-ups are shared Client planning information. Responsibility
  routes attention and accountability but is not an access boundary.
- Archived Client planning information is read-only and follows the existing
  Administrator-only archived Client access.
- Organisation boundaries apply before role or assignment checks.
- Ungdomar/Vuxna categorisation does not create a Journal access boundary.
- Export permissions are restricted to administrators in Version 1.

---

## Record Lifecycle

Kaul distinguishes between active, archived, draft, signed, and finalised information.

### Active

The record is available for normal current work.

### Archived

The record is retained for history but excluded from ordinary active workflows.

### Draft

The Anteckning is incomplete and may be read, reopened, edited, saved,
discarded, or signed only by its author while that author retains current
Client authorisation.

### Signed

The journal entry is complete, attributed, timestamped, immutable, and visible
according to current Client authorisation.

### Final

The generated report or document is preserved as an official completed version.

### Lifecycle Rules

- Archiving must not destroy history.
- Signed and final records must not be silently edited.
- Saving a draft does not change its lifecycle state; signing is the explicit
  authenticated `DRAFT` to `SIGNED` transition.
- Corrections and replacements must remain traceable.
- Hard deletion should be exceptional and policy-driven.
- Domain records should include sufficient timestamps to explain their lifecycle.
- Retention periods are organisational and legal policy decisions, not assumptions made by the domain model.

---

## Export Requirements

The customer owns the information stored in Kaul.

A complete organisation export should be capable of including:

- Organisation information
- Users
- Clients
- Assignments
- Journal entries
- Signing information
- Goals
- Follow-ups
- Documents and original uploaded files
- Weekly reports
- Audit events where appropriate
- A manifest describing the export structure and version

Exports should support:

- Human-readable formats
- Machine-readable formats
- Stable identifiers
- Documented relationships
- Original uploaded files

The export model must remain independent of the current hosting provider.

---

## Version 1 Boundaries

The following concepts are intentionally kept outside the Version 1 domain model:

- Billing
- Subscriptions
- Customer self-registration
- Multiple active organisations in one administration interface
- Microsoft Entra ID
- External authority portals
- Public APIs
- Calendar synchronisation
- SMS
- Email reminders
- AI-generated documentation
- Advanced workflow engines
- Fine-grained custom permission builders
- Real-time collaboration on the same journal entry
- Complex document approval chains

These features may be considered later if justified by real customer needs.

---

## Domain Decision Test

Before adding a new entity, relationship, or rule, ask:

1. Does it represent a real business concept?
2. Is it required for Version 1 or clearly necessary for safe future growth?
3. Could an existing entity represent it without becoming confusing?
4. Does it pass the 2 AM Test?
5. Does it make access, export, or historical traceability harder?
6. Are we solving a demonstrated customer need or imagining a possible future problem?

A new concept should not be added merely because it might be useful someday.

---

## Current Status

The initial domain model is approved for project bootstrapping.

It may be revised when implementation reveals a genuine conflict or when validated customer requirements change.
