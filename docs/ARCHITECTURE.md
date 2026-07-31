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

Every client belongs to exactly one category:

- Ungdom
- Vuxen

Every client has one primary staff member.

Future versions may support multiple assigned staff members.

---

# Journal System

Responsible for:

- Journal entries
- Follow-ups
- Weekly reports
- Signatures

Every journal entry belongs to exactly one client.

Journal entries should be immutable once signed.

Corrections should be stored as new entries rather than modifying historical records.

---

# Document System

Responsible for:

- Uploaded files
- Generated documents
- Templates

Examples:

- Weekly Reports
- Socialtjänsten
- Skatteverket

The document system should not know how authentication or client assignment works.

It simply stores and retrieves documents.

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

- Weekly reports
- Printable summaries
- Future statistics

Reports should read from existing data.

They should never duplicate information.

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
- Document upload
- Export generation

The audit log exists for traceability.

---

# Communication Between Systems

Authentication identifies the user.

↓

User Management determines permissions.

↓

Client Management determines which clients are accessible.

↓

Journal, Documents, Search and Reports use those permissions.

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

Implementation has not yet started.