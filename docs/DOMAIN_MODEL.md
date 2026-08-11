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

The user should not be required to choose between multiple complex workflows before beginning a note. A note type may be selected within the entry where useful.

A journal entry has:

- Client
- Author
- Entry type
- Event date and time
- Written content
- Optional structured sections
- Optional related goals
- Incident indicator
- Status: `UTKAST` or `SIGNERAD`
- Created date
- Updated date while still a draft
- Signed date
- Signer
- Stable reference identifier

Possible entry types include:

- Daily note
- Conversation
- Phone call
- Meeting
- Home visit
- School contact
- Observation
- Incident
- Other

The Swedish interface may display these as:

- Daganteckning
- Samtal
- Telefonsamtal
- Möte
- Hembesök
- Skolkontakt
- Observation
- Incident
- Övrigt

### Journal Entry Rules

- Every journal entry belongs to exactly one client.
- Every journal entry belongs to one organisation.
- A staff member may only create entries for clients they can access.
- `UTKAST` entries are editable by their author, can be saved and reopened,
  and can be continued later.
- `SIGNERAD` is chosen explicitly by the user through "Signera". Once signed,
  the original is immutable and neither a Staff Member nor an Administrator
  may silently modify it.
- A signed entry must visibly record the signer's name, professional title, role, and timestamp.
- The displayed signing information must remain historically accurate even if the user's profile later changes.
- A signed entry cannot be silently overwritten.
- A correction must be represented by a separate attributable linked
  correction/addendum that preserves the signed original.
- Removing a signed entry is not part of normal user functionality.
- Administrative handling of erroneous or unlawful records must follow a defined policy and remain auditable.
- An incident is still a journal entry, but it may trigger additional visibility or workflow.
- A journal entry should remain understandable when exported independently of the Kaul interface.

---

## Goal

A goal represents an agreed area of focus for a client.

Goals may be used to connect daily documentation with longer-term support work.

A goal has:

- Client
- Title
- Description
- Status
- Start date
- Optional target or review date
- Created date
- Updated date
- Archived date where applicable

Possible statuses include:

- Active
- Paused
- Completed
- Archived

A goal may be referenced by many journal entries.

### Goal Rules

- Every goal belongs to exactly one client.
- Goals should not be represented as artificial percentage progress unless the organisation defines a meaningful measurement.
- Changing a goal must not alter the historical meaning of journal entries that previously referenced it.
- Completed and archived goals remain visible in client history.
- A journal entry may relate to zero or more goals.
- Goal management should remain optional in Version 1 and must not block ordinary documentation.

---

## Follow-up

A follow-up represents a planned future action concerning a client.

Examples include:

- Scheduled conversation
- Weekly check-in
- Network meeting
- Document review
- Goal review
- Contact with another party

A follow-up has:

- Client
- Title
- Description
- Due date and optional time
- Responsible user
- Status
- Created date
- Completed date where applicable

Possible statuses include:

- Planned
- Completed
- Cancelled
- Overdue

### Follow-up Rules

- Every follow-up belongs to exactly one client.
- Every follow-up has one responsible user.
- A follow-up is a planning item, not a journal record.
- Completing a follow-up does not automatically create a journal entry.
- The user may choose to create a journal entry after completing a follow-up.
- Follow-ups visible to a staff member must only concern clients they can access.
- Upcoming follow-ups appear on the home view.
- Advanced calendar synchronisation is not part of Version 1.

---

## Document

A document represents either an uploaded file or a generated document associated with a client.

Examples include:

- Uploaded PDF
- Scanned letter
- Completed form
- Incident report
- Status report
- Exported weekly report

A document has:

- Client
- Document type
- Title
- Description where applicable
- Original file name where applicable
- Storage reference
- File format
- File size
- Uploaded or generated by
- Created date
- Optional document date
- Status

Possible document origins are:

- Uploaded
- Generated

### Document Rules

- Every client document belongs to exactly one client.
- Every document belongs to one organisation.
- The database stores document metadata and a storage reference, not the file content as ordinary database text.
- Files must be stored through a replaceable storage abstraction.
- Storage must not depend on a hard-coded local path or a specific hosting provider.
- Moving from local storage to object storage must not require changing the domain model.
- Original uploaded files should be preserved.
- Replacing a document should create a new version or record rather than silently overwriting the original.
- Access to documents follows the same server-side Client authorisation as
  other records. Guessing a URL or identifier must not bypass that check.
- Document access, upload, replacement, and export may be recorded in the audit log.
- Upload/download metadata and audit requirements must be designed before
  document implementation.
- Storage infrastructure is intentionally not selected by this domain model.
- File validation and allowed formats will be defined in security and implementation documentation.

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
- Journal correction
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
- Outcomes and recoveries are added as separate records; an intent is never
  updated into a result.
- Ordinary users cannot edit or delete audit operations or events.
- Audit records must not contain full journal text, passwords, authentication secrets, or unnecessary sensitive personal information.
- Generic audit metadata is not stored. New audit context requires explicit,
  reviewed fields.
- Audit events must remain understandable after users or clients are archived.
- Failed security-relevant actions may be audited even when no authenticated user exists.
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
├── Optional Signer
├── Optional Referenced Goals
└── Optional Corrected Journal Entry

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

An administrator may access all clients and records belonging to their organisation.

### Staff Member

A staff member may access a client only when they have an active primary or secondary assignment to that client.

### Domain Access Rules

- Permission checks must be enforced by the application backend.
- Hiding links or navigation items is not sufficient access control.
- Search, reports, documents, exports, and direct URLs must apply the same access rules.
- Historical authorship does not automatically grant continued access after an assignment ends.
- Organisation boundaries apply before role or assignment checks.
- Export permissions are restricted to administrators in Version 1.

---

## Record Lifecycle

Kaul distinguishes between active, archived, draft, signed, and finalised information.

### Active

The record is available for normal current work.

### Archived

The record is retained for history but excluded from ordinary active workflows.

### Draft

The record is incomplete and may still be edited by an authorised user.

### Signed

The journal entry is complete, attributed, timestamped, and immutable.

### Final

The generated report or document is preserved as an official completed version.

### Lifecycle Rules

- Archiving must not destroy history.
- Signed and final records must not be silently edited.
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
