# Kaul

Version: 1.0 (Architecture)

---

# Overview

Kaul is organised into a number of independent systems.

Each system has a single responsibility.

The goal is to keep the application modular, maintainable and easy to extend.

The systems communicate with each other but should remain as independent as possible.

---

# High-Level Architecture

Kaul consists of the following systems:

- Authentication
- User Management
- Client Management
- Journal System
- Goal System
- Follow-up System
- Document System
- Search
- Reporting
- Export
- Backup
- Audit Log

Each system is described below.

---

# Authentication

Responsible for:

- Login
- Logout
- Password management
- Session management
- User authentication

Authentication should never contain business logic.

Its only responsibility is determining who the user is.

---

# User Management

Responsible for:

- Users
- Roles
- Permissions

Version 1 supports two roles:

- Administrator
- Staff Member

Future versions may introduce additional roles without requiring major architectural changes.

---

# Client Management

Responsible for:

- Creating clients
- Editing client information
- Archiving clients
- Assigning staff members

Every client has one bounded category string. The approved product categories
are represented in application code as:

- `YOUTH`, displayed as Ungdomar
- `ADULT`, displayed as Vuxna

The database does not enforce a category enum. Server-side Client input
validation controls normal creation, while unknown existing strings remain
readable in a separate UI group for review.

Every client may have one active primary staff assignment and zero or more
active secondary staff assignments. Ended assignments are preserved as
historical responsibility records.

Client archiving is an explicit lifecycle operation. It requires an inactive
Client with no active Assignments, preserves all history, and moves the Client
from ordinary lists into a separate Administrator-only archive. Archived
Clients are read-only in Version 1.

Client access is enforced through one central server-side boundary. An
Administrator may access Clients in their Organisation. A Staff Member may
access a Client only while the Client is active and the Staff Member has an
active assignment to it.

---

# Journal System

Responsible for:

- Author-private draft entries
- Signed journal entries
- Corrections linked to signed originals
- Journal authorisation and lifecycle invariants

The Journal System remains a module within Kaul's modular monolith. It uses the
central authentication, Organisation, and Client-access boundaries and the
existing Audit Log; it does not introduce a separate service or signing
provider.

Every journal entry belongs to exactly one Client and Organisation. Version 1
permits at most one open draft for each author and Client.

Draft and signed access are deliberately different. An unfinished draft is
private to its author, including from Administrators, and every draft operation
also requires current Client authorisation. A signed entry follows the central
current Client-access boundary: Administrators may read signed entries for
Clients in their Organisation, while Staff Members require current assignment-
based Client access. Historical authorship does not grant access.

Signing is an explicit authenticated application transition from `DRAFT` to
`SIGNED`, not a cryptographic or external electronic signature. Signed-record
immutability is a domain and database invariant: a signed original cannot be
updated or deleted through ordinary application or Administrator behaviour.

Corrections are separate signed entries linked directly to a valid signed
original in the same Client and Organisation. The original remains unchanged.
The implemented Journal foundation uses an integer draft version for
compare-and-update stale-write protection and a PostgreSQL partial unique index
for the one-open-draft-per-author-and-Client rule. Journal mutations share the
existing per-Client transaction lock with Client lifecycle and Assignment
changes, then revalidate the current actor and Client access while holding that
lock. PostgreSQL correction validation permits only a fixed direct link to a
signed, non-correction original in the same Client and Organisation.

PostgreSQL triggers reject update, delete, and truncate paths that could alter
or remove a signed Journal row while still permitting the legitimate
`DRAFT`-to-`SIGNED` transition. A deferred database constraint also requires
that transition to commit with the matching successful immutable audit outcome
for the same entry, author, Organisation, and original/correction action.

Signing an original or correction uses the existing immutable audit
architecture and its durable-intent and immutable-outcome principles. Ordinary
draft saves do not create immutable audit noise. The foundation does not audit
draft creation or discard, and it does not introduce read/view audit events.

While a Journal entry remains the author's draft, the Journal System accepts
zero or more Goal selections validated against the same Client and
Organisation. Signing freezes immutable reference rows containing each Goal
identifier and signing-time title. The signed record, not the current Goal,
owns that historical display context. Later Goal edits or lifecycle changes
cannot rewrite it, and retrospective Goal linking to signed entries is not
permitted.

---

# Goal System

Responsible for:

- Shared Client Goals
- `ACTIVE` and `PAUSED` editing
- Terminal completion and archival
- Retained Goal history
- Goal eligibility for Follow-up and Journal references

Goals have no responsible owner in Version 1. They remain ordinary editable
planning records rather than signed records. The Goal System remains a module
inside Kaul's modular monolith and uses the central Client-access boundary and
existing Audit Log without introducing a service or workflow engine.

Every mutation revalidates current Client access. Access-sensitive mutations
share the existing per-Client transaction lock with Client lifecycle,
Assignment, Journal, and Follow-up changes where those operations can race.
Editable states use an integer optimistic version so stale submissions cannot
overwrite newer content. Goal records in every lifecycle state are retained and
cannot be hard-deleted or cascade-deleted through ordinary application
behaviour. Terminal Goal records also cannot be edited or reopened.

---

# Follow-up System

Responsible for:

- Shared concrete future Client actions and checks
- One stored responsible user, with eligibility checked when selected
- Optional same-Client Goal context
- Due-date and optional due-time semantics
- Completion and cancellation
- Derived overdue, due-today, and upcoming queries
- Narrow immutable responsibility-change history
- The current user's authorised **Att göra** Home projection

The Follow-up System persists only `PLANNED`, `COMPLETED`, and `CANCELLED`.
Overdue, due-today, and upcoming are calculated using `Europe/Stockholm`; they
are not stored lifecycle states. Ambiguous or nonexistent local clock times are
rejected rather than guessed.

The Follow-up System remains a module inside Kaul's modular monolith. It is a
bounded Client-planning module rather than a generic task-management service.

Responsibility routes attention but grants no access. Assignment and
reassignment resolve the responsible user server-side and revalidate active
same-Organisation current Client access. If that access later ends, the record
and stored responsible user remain until explicit reassignment, responsibility
history remains, the item disappears immediately from the former user's Home,
Assignment or account/access changes continue, and currently authorised users
see that reassignment is required.

Follow-up mutations use the central Client-access boundary, the shared
per-Client transaction lock where access changes can race, optimistic versions,
and expected-state updates. Database relationships preserve Organisation and
Client scope for the Client, optional Goal, creator, responsible user, lifecycle
actors, and responsibility history. Goal lifecycle changes never cascade to a
Follow-up.

Follow-up records in every lifecycle state are retained and cannot be
hard-deleted or cascade-deleted through ordinary application behaviour.
`COMPLETED` and `CANCELLED` records also cannot be edited, reassigned, or
reopened.

The Follow-up System uses the Audit Log only for reassignment, completion, and
cancellation. It does not create Journal records, notifications, calendar
events, recurrence, subtasks, or workflow automation.

---

# Document System

Responsible for:

- Client-scoped Document and immutable DocumentVersion application workflows
- Bounded streaming upload, format validation, SHA-256, and fail-closed scan
- Private quarantine and immutable-object promotion through `DocumentStorage`
- Integrity-checked, server-mediated attachment downloads

The Documents application layer reuses Authentication and Client Management
for current access and Audit for durable traceability. The storage adapter is
deliberately narrower: it knows opaque keys and streams only, not users,
Organisations, Clients, assignments, or audit policy.

The accepted upload sequence is audit intent, quarantine stream, validation,
scan, promotion, Client lock, access revalidation, metadata plus successful
audit outcome transaction, then safe response. File storage cannot participate
in a PostgreSQL transaction, so definitive rollback uses compensation while an
ambiguous commit preserves the object for reconciliation.

Generated documents, templates, OCR, conversion, indexing, preview, generic
attachments, and cloud-provider frameworks are outside this slice. ADR 0004
records the storage, scanner, and backup-set boundary.

---

# Search

Responsible for searching:

- Clients
- Journal entries
- Documents

Search should always respect user permissions.

Users should never receive search results for clients they cannot access.

---

# Reporting

Responsible for generating:

- Monthly reports
- Printable summaries
- Future statistics

The implemented Monthly Report is a manually authored Client-scoped module
with one canonical lineage per calendar month. Its shared drafts use optimistic
versions. Signing atomically records the signer snapshot and audit outcome;
PostgreSQL protects every signed revision from update, deletion, or silent
replacement. A correction extends the existing lineage with a directly linked
signed revision.

Automatic synthesis from Journal records remains future work.

The structured-record migration is forward-only and additive: nullable Client
fields and structured Journal columns are added without rewriting existing
rows, and legacy Journal content remains explicitly versioned and readable.
The migration replaces signing constraints and trigger functions in place so
old and new signed formats retain PostgreSQL-level integrity. Rolling the
application back after this migration requires an owner-reviewed compatibility
decision; the safe recovery path is the pre-migration backup plus normal
forward migration, not destructive column removal. A dedicated disposable
database rehearsal applies every pre-feature migration, inserts a realistic
legacy signed row, then applies and verifies the feature migration.

---

# Export

Responsible for exporting organisation data.

Exports should include:

- Clients
- Users
- Assignments
- Journal entries
- Documents
- Uploaded files

Exports should be portable and independent of the hosting provider.

---

# Backup

Responsible for protecting data.

Backups should include:

- Database
- Uploaded documents
- Generated reports

Backups should be automatic.

Restoring backups should be documented and regularly tested.

---

# Audit Log

Responsible for recording important events.

Examples:

- User login
- User creation
- Client creation
- Client assignment
- Journal creation
- Goal completion and archive
- Follow-up reassignment, completion, and cancellation
- Document upload
- Export generation

The audit log exists for traceability. Milestone 4 audited transitions use the
existing durable intent and immutable outcome architecture, with the business
transition and successful outcome coupled where the existing audit guarantees
require it. Expected-state updates and operation identity prevent repeated
requests from producing duplicate business outcomes or success evidence.

Ordinary planning creation, edits, Goal pause/resume, reads, calculated due
states, and no-op submissions are represented by retained domain records and do
not create immutable audit noise. Audit records contain stable identifiers, not
Client names, Goal or Follow-up descriptions, Journal text, request bodies, or
exception text.

---

# Communication Between Systems

Authentication identifies the user.

↓

User Management determines permissions.

↓

Client Management determines which clients are accessible.

↓

Journal, Goals, Follow-ups, Documents, Search and Reports use those permissions.

↓

Export and Backup protect organisational data.

No system should bypass the permission model.

---

# Design Principles

Each system should:

- Have one responsibility.
- Be easy to understand.
- Be independently testable.
- Avoid unnecessary coupling.
- Support future growth.

Whenever possible, new functionality should extend an existing system rather than introducing a new one.

---

# Future Expansion

The architecture should support future additions such as:

- Multiple organisations
- Microsoft Entra ID
- Notifications
- Calendar integration
- Mobile applications
- Public API
- AI-assisted documentation

These features should be additive rather than requiring major redesign.

---

# Current Status

Architecture approved.

Milestones 0 through 4 are complete. Implemented modules now cover Better
Auth-backed authentication and session guards, immutable audit operations,
Administrator and Staff management, and Client management with one central
organisation-, lifecycle-, and Assignment-aware access scope for ordinary
lists, permission-aware basic search, direct detail, and Staff Home. Role-aware
Client-list projections provide current primary-responsibility context only to
Administrators, while Staff Home returns only the current user's assigned
Client overview and responsibility. Client workspaces present current primary
and secondary responsibility without introducing future feature sections.
The Milestone 3 Journal domain/database foundation and interactive Client-
workspace interface are implemented with author-private drafts, current Client
authorisation, Server Action mutations, Server Component history/detail reads,
flat corrections, optimistic concurrency, atomic audited signing, and durable
PostgreSQL integrity controls. Client Components are limited to the draft form,
pending states, and destructive confirmation. Printable Journal views are
deferred work and do not block Milestone 3. Security and domain reviews, final
focused race and UI reviews, and pull-request CI passed; the final UI was
squash-merged to main in #34.

The Milestone 4 Goal and Follow-up modules and visible workflows are now
implemented. They reuse the central Client authorisation and mutation lock,
optimistic versions, scoped PostgreSQL relationships, retained lifecycle
history, immutable responsibility history, the five approved audit actions,
Stockholm due semantics, own-authorised Home projection, and immutable signed
Journal Goal snapshots. Permanent integration and browser evidence covers
access loss, archived read-only behaviour, terminal states, concurrency,
keyboard use, narrow screens, and high-text reflow. The foundation and visible
workflows were squash-merged in #38 and #39.

The separate product integration candidate implements the approved expanded
Client, structured Journal, Monthly Report, and Client Documents tracks.
Personnummer uses the Stage A envelope-encryption boundary in ADR 0003; the
attended conversion and retained-key restore gates remain separate. Monthly
Reports reuse current Client access and audited immutable signing. Documents
reuse the same authorisation boundary, with immutable versions, private
storage, fail-closed malware scanning, and a manifest-bound database/object
backup set as defined in ADR 0004. These additions preserve the modular
monolith and do not rewrite legacy signed Journal records.

This candidate remains separate from the completed Milestones 0–4 baseline on
main and from the Pilot release candidate. Implementation is not Milestone 5
completion or activation approval. **Homelab Pilot Readiness** and the later
**Production / Cloud Launch Readiness** gates remain open. Global search,
export, notifications, and other unapproved modules remain deferred. See
[PROJECT_STATE.md](PROJECT_STATE.md) for the dated integration baseline and
remaining validation; Kaul is not approved for sensitive production use.
