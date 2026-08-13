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
- Document uploads
- Weekly reports
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

---

# Current Status

Milestone 0 is complete. Milestone 1 authentication, audit, and Staff
management slices are implemented, with production credential-delivery and
sole-Administrator recovery procedures still outstanding. Milestone 2 Clients
and Assignments is complete: Administrators can create and edit the permitted
fields of **Ungdomar** and **Vuxna** Clients, manage primary and secondary Staff
assignments, see current primary responsibility in ordinary discovery, and
archive eligible Clients into a separate read-only historical workflow. Staff
Home shows currently assigned active Clients with the current user's
responsibility, the Client workspace presents current primary and secondary
responsibility, and permission-aware basic name and Personreferens search uses
the same assignment-based access semantics. The Milestone 3 Journal
domain/database foundation is implemented, including private drafts, current
Client access, explicit audited signing, immutable signed records, and flat
corrections. The Journal interface and complete end-user workflow remain
unimplemented, so Milestone 3 is not complete. Document, report, global search,
export, and other later-milestone functionality also remain unimplemented;
Kaul is not production-ready.
