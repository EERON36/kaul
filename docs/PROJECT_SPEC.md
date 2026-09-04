# Kaul

Version: 1.0 (Project Specification)

---

## Purpose

This document is the primary source of truth for the Kaul project.

All architectural, design and development decisions should align with this specification unless intentionally revised.

---

# Product Vision

Kaul is a professional case management and documentation platform built for Swedish organisations working with young people and adults.

The system focuses on secure documentation, simple workflows and long-term maintainability.

Kaul is designed to replace paper-based documentation and disconnected spreadsheets with one clear and reliable system.

The first release intentionally focuses on a small feature set implemented well.

---

# Target Users

The first version targets small organisations with one or more staff members responsible for client documentation.

Typical users include:

- Pedagogues
- Social workers
- Treatment staff
- Support workers
- Administrators

---

# Language

The application is designed for Swedish organisations.

### User Interface

Everything visible to end users shall be written in Swedish.

Examples:

- Ungdomar
- Vuxna
- Dokument
- Anteckningar
- Pedagog

### Development

Everything used by developers shall be written in English.

Examples:

- users
- clients
- assignments
- journalEntries
- documents

Source code, APIs, database tables and documentation use English.

---

# Product Goals

Kaul exists to provide:

- Simple documentation
- Professional client management
- Secure access to information
- Reliable long-term storage
- Easy migration to other systems
- Minimal administration

---

# Design Principles

The interface should feel like professional Swedish municipal software.

It should be:

- calm
- predictable
- accessible
- readable
- distraction free

The interface should avoid:

- unnecessary animations
- excessive colours
- dashboard clutter
- decorative elements

Users should spend their time documenting work rather than learning the software.

---

# Core Principles

Every feature should support at least one of these principles.

- Simplicity
- Reliability
- Security
- Accessibility
- Portability

If a feature makes Kaul significantly more complicated while providing little value, it should not be included.

---

# User Roles

## Administrator

Can:

- Manage staff
- Manage clients
- Assign clients
- Manage document templates
- View signed documentation for clients in their organisation
- Create and manage only their own unfinished Anteckning drafts for authorised
  clients
- View and manage shared Goals and Follow-ups for non-archived clients in their
  organisation; archived planning information is read-only
- Export organisation data
- Archive clients

---

## Staff Member

Can:

- Log in
- View assigned clients
- Create and manage only their own unfinished Anteckning drafts for currently
  assigned clients
- View signed journal entries for currently assigned clients
- View and manage shared Goals and Follow-ups for currently assigned active
  clients
- Upload documents
- Generate reports
- Search assigned documentation

Cannot:

- View unassigned clients
- Manage users
- Change permissions
- Delete signed documentation

---

# Anteckningar and Signed Records

An unfinished Anteckning draft is private to its author. No other user may
read, list, preview, edit, discard, or sign it, including an Administrator.
Normal current Client authorisation still applies to the author, so writing a
draft does not preserve access after the author loses Client access.

Version 1 permits at most one open draft for each author and Client. Saving a
draft is not signing it. Signing is a separate authenticated Kaul action that
changes the author's draft from `DRAFT` to `SIGNED`; it is not a cryptographic,
BankID, certificate-based, or external electronic signature.

Once signed, an entry follows normal current Client authorisation rather than
draft privacy. Administrators may read signed entries for Clients in their
Organisation, while Staff Members may read them only for Clients they are
currently authorised to access through active assignments. Historical
authorship alone does not preserve access. The Ungdomar/Vuxna category is not a
Journal authorisation boundary.

A signed original cannot be edited or deleted by any user, including an
Administrator. A mistake is corrected through a separate signed correction
linked to the original. The correction has its own author, content, signing
action, signing information, and audit evidence; the original remains
unchanged.

---

# Goals and Follow-ups

Goals describe what a Client is working toward. Follow-ups describe what needs
to happen next. They are shared Client planning information, not private user
records, signed Journal records, or a generic task-management system.

Every Goal and Follow-up read or mutation requires normal current Client
authorisation. Historical creation, activity, or responsibility does not grant
or preserve access. Goals have no responsible owner in Version 1. Every
Follow-up stores one responsible user. When responsibility is assigned or
reassigned, the selected user must be active, belong to the same Organisation,
and currently have normal Client access. Responsibility is an attention and
accountability concept rather than an access boundary. If that access later
ends, the stored responsible user remains until an authorised user explicitly
reassigns the Follow-up, while the former responsible user immediately loses
visibility.

Goals and Follow-ups cannot be hard-deleted in any lifecycle state in Version
1. Terminal Goals cannot be edited or reopened; terminal Follow-ups cannot be
edited, reassigned, or reopened. Goal selection is optional during Journal
drafting. Signing preserves the selected Goal identifiers and their signing-time
titles as immutable Journal context; later Goal changes do not rewrite a signed
entry.

Completing a Follow-up never automatically creates or signs a Journal entry.
Notifications, calendar integration, recurrence, subtasks, workflow automation,
productivity metrics, and automatic documentation remain outside Version 1.

---

# Client Categories

The system supports two client categories that must remain clearly separated in
the application for legal and operational reasons:

- Ungdomar
- Vuxna

Both categories follow the same workflow. This requirement does not, by
itself, establish separate staff access or visibility rules; that unresolved
domain question is recorded in the domain model.

---

# Minimum Viable Product

Version 1 must include:

- Authentication
- Role-based permissions
- Client management
- Client assignment
- Journal entries
- Signed records
- Client Goals
- Client Follow-ups
- Document uploads
- Monthly reports with six manually authored documentation sections
- Search
- Organisation export
- Backups
- Audit logging

---

# Not Included in Version 1

The following features are intentionally postponed.

- Native mobile applications
- AI features
- Calendar synchronisation
- Email reminders
- SMS
- Public API
- Third-party integrations
- Multiple organisations

---

# Data Ownership

Customers always own their data.

Kaul must never create vendor lock-in.

The system must support complete export of:

- Clients
- Staff
- Assignments
- Journal entries
- Goals
- Follow-ups
- Documents
- Uploaded files
- Reports

Migration to another system should always be possible.

---

# Non-Functional Requirements

Kaul should be:

- Easy to learn
- Fast
- Secure
- Portable
- Reliable
- Accessible
- Maintainable

The application should continue functioning correctly regardless of where it is deployed.

---

# Initial Deployment

The first deployment will be a pilot environment.

The pilot will initially be hosted on a private homelab.

The application must be designed so it can later be migrated to professional hosting without requiring changes to application code.

No production deployment should depend on homelab-specific infrastructure.

The Homelab Pilot infrastructure is disposable. PostgreSQL application data
should remain migratable where reasonably possible through stable identifiers,
committed Prisma migrations, portable logical backups, and host-independent
configuration. Preserving compatible accounts, Clients, Assignments, and other
useful records is preferred but is not an absolute Pilot promise when security,
integrity, or migration evidence requires a controlled reset.

---

# Current Status

Milestones 0 and 1 are complete. Milestone 1 authentication, audit, and Staff
management are implemented, while production credential-delivery and
sole-Administrator recovery procedures remain separate production blockers.
Milestone 2 Clients and Assignments is complete: Administrators can create and
edit the permitted fields of **Ungdomar** and **Vuxna** Clients, manage primary
and secondary Staff assignments, see current primary responsibility in
ordinary discovery, and archive eligible Clients into a separate read-only
historical workflow. Staff
Home shows currently assigned active Clients with the current user's
responsibility, the Client workspace presents current primary and secondary
responsibility, and permission-aware basic name and Personreferens search uses
the same assignment-based access semantics. The Milestone 3 Journal
domain/database foundation and interactive **Anteckningar** workflow are
implemented. Authorised users can manage only their own drafts, review and
explicitly sign records, read signed history and detail, and create separate
flat corrections. Current Client access, audited signing, immutable signed
records, historical signer snapshots, and draft privacy remain server-
authoritative. Printable Journal views are deferred work and do not block
Milestone 3. Milestone 3 is complete: security and domain reviews, final
focused race and UI reviews, and pull-request CI passed; the final UI was
squash-merged to main in #34. Milestone 4 Goals and Follow-ups is also
complete. Shared Client Goals and Follow-ups, responsibility and access-loss
rules, Stockholm due semantics, the current user's authorised **Att göra**,
and immutable signing-time Journal Goal references are implemented through the
approved server, PostgreSQL, and accessible Client-workspace boundaries.

The operational focus remains **Homelab Pilot Readiness**. In parallel, the
approved product-development track expands Client information, replaces new
single-field Anteckningar with six structured sections while retaining legacy
records, and implements Client-scoped **Månadsrapporter**. This track is based
on the exact Pilot release-candidate application state and does not itself
authorise deployment or live sensitive data.

Homelab Pilot Readiness continues to require repeatable deployment to
an isolated Pilot environment using fictional or sanitised data, with HTTPS,
separate configuration and secrets, backup/restore verification, safe
Administrator setup, basic operations, repeatable updates, and a short user
feedback loop. **Production / Cloud Launch Readiness** is a later, separate
decision for live organisational information. This does not automatically pull
Documents, reports, global search, export, or other deferred functionality into
the Pilot. Existing Milestone 7 and production/security gates remain open at
the readiness level assigned by the authoritative milestone and security
documents.
