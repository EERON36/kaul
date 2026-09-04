# Kaul Technical Stack

Version: 0.1

---

## Purpose

This document defines the approved technologies and technical boundaries for Kaul.

Its purpose is to:

- Prevent inconsistent technology choices
- Give contributors and coding assistants clear implementation guidance
- Keep the application portable
- Keep Version 1 understandable and maintainable
- Avoid unnecessary infrastructure and framework complexity

Technology choices may be revised when there is a demonstrated technical or business need.

Changes should not be made solely because another tool is newer, more fashionable, or theoretically more scalable.

---

## Technical Principles

Kaul should use a small and conventional technical stack.

The stack should prioritise:

- Simplicity
- Security
- Portability
- Maintainability
- Strong documentation
- Type safety
- Reliable backups
- Ease of deployment
- Low operating cost

Version 1 should not use distributed systems, microservices, Kubernetes, event buses, or other infrastructure intended for substantially larger systems.

A single well-structured application and one relational database are sufficient.

---

## Application Architecture

Kaul will initially be implemented as a modular monolithic web application.

This means:

- The user interface and backend application live in one project.
- Business areas remain separated through clear modules and boundaries.
- One deployment contains the complete application.
- One PostgreSQL database stores structured application data.
- Uploaded files are stored separately from the application source code.
- Systems may be separated later only if a genuine operational need develops.

The modular monolith should reflect the systems described in `ARCHITECTURE.md`.

Examples include:

- Authentication
- User management
- Client management
- Assignments
- Journal entries
- Documents
- Reporting
- Search
- Export
- Audit logging

The codebase must not be organised as one large collection of unrelated page components.

---

## Web Framework

Kaul will use:

- Next.js
- React
- TypeScript
- Next.js App Router

Next.js will provide:

- Server-rendered application pages
- Routing
- Layouts
- Server-side application logic
- Form and mutation handling
- API endpoints where required
- Access to React Server Components

### Framework Rules

- Use the App Router.
- Prefer server-rendered pages for authenticated application views.
- Prefer server-side data access.
- Use client components only where browser interactivity is required.
- Do not expose database access directly to the browser.
- Do not create a separate frontend and backend unless a later requirement justifies it.
- Do not adopt experimental framework features for critical business functionality.
- Framework upgrades must be intentional and tested.

---

## Programming Language

Kaul will use TypeScript for application code.

TypeScript should be configured with strict type checking.

### Language Rules

- Do not use JavaScript files for application logic unless required by external tooling.
- Avoid the `any` type.
- Use explicit domain types at system boundaries.
- Validate untrusted runtime input even when TypeScript types exist.
- Use English names for source code, files, functions, variables, database models, and API structures.
- All text visible to users must be written in Swedish.

---

## Runtime

Kaul will use a supported Long-Term Support release of Node.js.

The exact Node.js version should be pinned in the repository and container configuration when the project is bootstrapped.

Development, testing, pilot, and production environments should use the same major Node.js version.

---

## Package Manager

Kaul will use npm.

The repository must include and commit the npm lock file.

### Package Rules

- Do not mix npm, Yarn, pnpm, or Bun within the project.
- Avoid adding a dependency for behaviour that can be implemented clearly with a small amount of standard code.
- Review dependencies before adding them.
- Prefer widely used, actively maintained packages.
- Avoid packages that introduce unnecessary runtime services.
- Remove unused dependencies.
- Apply dependency updates deliberately rather than automatically accepting every major release.

---

## Database

Kaul will use PostgreSQL from the beginning.

PostgreSQL will be used in:

- Local development
- Automated tests where practical
- Homelab pilot deployment
- Future VPS or cloud deployment

SQLite will not be used as the primary application database.

### Database Rules

- PostgreSQL is the authoritative structured data store.
- Database access must occur on the server.
- PostgreSQL must not be exposed directly to the public internet.
- Database configuration must be supplied through environment variables.
- Development and production should use the same database engine.
- Database backups must use PostgreSQL-compatible backup tools.
- Application records must use stable identifiers.
- Timestamps must be stored consistently and converted appropriately for the Swedish interface.
- Database-specific functionality should only be used when it provides a clear benefit and does not unnecessarily reduce portability.

---

## Object-Relational Mapping and Migrations

Kaul will use Prisma ORM.

Prisma will provide:

- Database schema definition
- Type-safe database access
- Migration management
- Development database inspection

### Prisma Rules

- Prisma models and fields use English names.
- Migrations must be committed to Git.
- Applied migrations must not be casually rewritten.
- Schema changes must be reviewed for data-loss risk.
- Production migrations must be performed through documented deployment commands.
- Direct manual production schema changes should be avoided.
- Prisma does not replace domain validation or permission checks.
- Database queries should remain inside server-side data-access modules.
- Application components should not contain scattered direct Prisma queries.

---

## Authentication

Version 1 will use application-managed email and password authentication through
Better Auth, as approved in
`docs/decisions/0001-authentication-strategy.md`. The initially validated stable
version is Better Auth `1.6.25`.

Better Auth handles authentication mechanics. Kaul's server-side application
layer remains responsible for business authorisation, organisation boundaries,
roles, assignments, lifecycle rules, and audit requirements.

There will be no public registration page.

The initial administrator account will be created through a controlled setup process.

Administrators may then create or invite staff accounts.

### Authentication Requirements

The authentication implementation must support:

- Individual user accounts
- Secure password hashing
- Login
- Logout
- Server-managed sessions
- Secure session cookies
- Session expiration
- Account deactivation
- Login rate limiting
- Audit events for relevant authentication actions
- Password reset through a controlled process

### Authentication Boundaries

- Authentication determines who the user is.
- Authorisation determines what the user may access.
- Authentication libraries must not replace Kaul's assignment and permission rules.
- Passwords must never be stored in plain text.
- Passwords, reset tokens, and session secrets must never appear in logs.
- Authentication secrets must be supplied through environment variables.
- Public self-registration is outside Version 1.
- Microsoft Entra ID may be added later without replacing the domain user model.

Better Auth versions must remain exactly pinned during implementation. Every
upgrade requires compatibility, generated-schema, Prisma migration, and security
review; a future version must not be adopted automatically.

The application must not implement password hashing, session cryptography, or token generation from scratch.

---

## Authorisation

Authorisation will be implemented in Kaul's server-side application layer.

It will use:

- Organisation membership
- User role
- Active client assignments
- Record lifecycle rules

### Authorisation Rules

- Permission checks must execute on the server.
- Navigation visibility is not a security control.
- Direct URLs must enforce the same permissions as navigation.
- Search results must respect permissions.
- Document downloads must respect permissions.
- Reports and exports must respect permissions.
- Mutations must verify permission immediately before making changes.
- Database records received from the browser must not be trusted as proof of access.
- Reusable permission functions should be used rather than duplicating rules across pages.

---

## Validation

Kaul will use Zod for runtime validation.

Validation is required for:

- Form submissions
- Route parameters
- Search parameters
- Environment variables
- Imported data
- Export options
- Uploaded-file metadata
- External or untrusted input

### Validation Rules

- Client-side validation improves usability but is not sufficient.
- All mutations must validate data on the server.
- Validation messages visible to users must be written in Swedish.
- Validation schemas should be reusable where appropriate.
- Domain rules that require database context must be enforced separately from basic shape validation.

---

## Forms

Kaul should prefer standard HTML forms and server-side handling where that keeps the workflow simple.

React Hook Form may be used for complex or highly interactive forms.

### Form Rules

- Do not introduce a form library for every simple form.
- Preserve user-entered text when validation fails.
- Display clear Swedish validation messages near the relevant field.
- Prevent accidental duplicate submissions.
- Warn users before discarding substantial unsaved work.
- Draft behaviour should be implemented intentionally, not by storing sensitive information in browser storage.
- Forms must remain usable with a keyboard and assistive technology.

---

## Styling

Kaul will use Tailwind CSS with project-owned design tokens and reusable interface components.

Tailwind is an implementation tool, not the design system itself.

### Visual Foundation

The design should use:

- IBM Plex Sans
- IBM Plex Serif
- IBM Plex Mono
- Flat surfaces
- One-pixel borders
- Neutral backgrounds
- Steel-blue navigation
- Minimal colour usage
- No decorative gradients
- Little or no shadow
- No unnecessary animation
- No excessive rounded corners

### Styling Rules

- User interface text is Swedish.
- Do not scatter arbitrary visual values across components.
- Define reusable tokens for typography, spacing, borders, colour, and focus states.
- Prefer reusable components for buttons, fields, tables, notices, tabs, and record layouts.
- Do not install a large component library that dictates Kaul's visual identity.
- Accessible focus indicators must remain visible.
- Colour must not be the only way information is communicated.
- Interfaces must pass the 2 AM Test.

---

## Icons

Icons should be used sparingly.

An icon library may be used for common interface actions, but icons must not replace clear Swedish labels for important actions.

### Icon Rules

- Do not decorate every navigation item or heading.
- Use conventional icons only.
- Buttons performing important actions should usually include text.
- Avoid custom illustration systems in Version 1.

---

## Date, Time, and Locale

The application is intended for Swedish users.

### Locale Rules

- User-facing dates and times use Swedish formatting.
- The application uses the `sv-SE` locale for presentation.
- The operational timezone for the initial organisation is `Europe/Stockholm`.
- Stored timestamps should use an unambiguous database representation.
- The interface should distinguish event time, creation time, and signing time.
- User-facing timestamps must not rely on the browser's locale defaults without explicit formatting.

---

## File Storage

Uploaded files will not be stored inside the Git repository or application image.

Version 1 will use a storage abstraction supporting:

- Local persistent storage during development and the pilot
- S3-compatible object storage in future hosting
- Other storage providers if needed later

The approved Pilot adapter uses `DOCUMENT_STORAGE_ROOT/objects` and
`DOCUMENT_STORAGE_ROOT/quarantine`. Application routes stream raw request
bodies without a multipart dependency. ClamAV 1.4.6 is pinned by image digest
for the private malware boundary; signature data is persistent, but quarantine
is transient and excluded from backups.

### Storage Rules

- Application code must not assume a host-specific absolute path.
- File metadata belongs in PostgreSQL.
- File content belongs in persistent file or object storage.
- Stored files should use generated storage identifiers rather than trusting original file names.
- Original file names should be preserved as metadata.
- File storage must survive application container replacement.
- File access must pass through server-side permission checks.
- Files must not be publicly addressable by predictable URLs.
- File replacement must not silently overwrite historical records.
- Storage-provider changes must not require changing the domain model.

---

## Document Generation

Printable reports and generated documents should be produced from server-side data.

Initial generated documents include:

- Monthly reports
- Journal summaries
- Organisation exports
- Selected document templates

### Document Rules

- Generated content visible to users is Swedish.
- Final documents should be reproducible or preserved as final versions.
- Generated documents must include stable references and relevant timestamps.
- Source journal entries remain authoritative.
- PDF generation technology should be selected only after testing Swedish characters, page breaks, headers, footers, and print consistency.
- Do not select a complex document-generation service before simple server-side generation has been evaluated.

---

## Search

Version 1 will use PostgreSQL-backed search.

Search may cover:

- Clients
- Journal entries
- Documents
- Reports

### Search Rules

- Search always applies server-side permission checks.
- Do not introduce Elasticsearch, OpenSearch, or another dedicated search service in Version 1.
- Start with straightforward PostgreSQL queries and indexes.
- More advanced PostgreSQL full-text search may be added when justified by real usage.
- Search results must not reveal inaccessible client names or record excerpts.

---

## Logging

Application logs are operational records, not journal records or audit records.

### Logging Rules

- Use structured server-side logging.
- Do not log full journal content.
- Do not log passwords, sessions, reset tokens, secrets, or uploaded-file contents.
- Avoid logging complete personal identifiers.
- Log enough context to diagnose failures without duplicating sensitive records.
- Production logging levels must be configurable.
- User-facing errors should not display internal stack traces.

A specific logging library may be selected during bootstrapping if it provides a clear advantage over the framework's standard facilities.

---

## Audit Logging

Audit events will be stored in PostgreSQL.

Audit logging is separate from ordinary application logging.

Audit logging must follow the domain rules in `DOMAIN_MODEL.md`.

### Audit Rules

- Audit records are append-only through ordinary application behaviour.
- Important actions should use stable action names.
- Audit metadata must remain limited and non-sensitive.
- Creating an audit event should be part of the same application operation where practical.
- The audit system must not record complete journal text as metadata.

---

## Testing

Kaul will use multiple levels of automated testing.

Approved tools:

- Vitest for unit and focused integration tests
- React Testing Library where component-level interaction tests provide value
- Playwright for browser-based end-to-end testing

### Testing Priorities

The highest-priority tests cover:

- Authentication
- Authorisation
- Client assignment visibility
- Journal signing and immutability
- Correction workflows
- Document access
- Export completeness
- Audit-event creation
- Backup and restore procedures where automation is practical

### Testing Rules

- Do not pursue coverage percentages as a goal by themselves.
- Test important behaviour and security boundaries.
- Tests should describe user or domain behaviour.
- Permission tests must include denied-access cases.
- Critical flows should be tested using PostgreSQL rather than replacing the database with SQLite.
- End-to-end tests should use fictional data.

---

## Code Quality

Kaul will use:

- TypeScript compiler checks
- ESLint
- Prettier

These checks should run locally and in continuous integration.

### Quality Rules

- Code must compile before merging.
- Linting must pass before merging.
- Automated tests relevant to the change must pass.
- Formatting should be automated.
- Avoid disabling lint or type rules without a documented reason.
- Security-sensitive warnings must not be ignored simply to make checks pass.

---

## Containers

Kaul will use Docker for repeatable development and deployment.

Docker Compose will coordinate the initial services.

Expected services include:

- Application
- PostgreSQL
- Caddy in deployed environments
- Optional development-only tools where justified

### Container Rules

- Development and deployment should use the same application image design.
- Containers must not contain production secrets.
- Persistent data must use explicit volumes or mounted storage.
- PostgreSQL data must not live inside an ephemeral application container.
- Uploaded files must not live inside an ephemeral application container.
- Container images should run as a non-root user where practical.
- Health checks should be defined for deployed services.
- Do not introduce Kubernetes in Version 1.

---

## Reverse Proxy and HTTPS

Kaul will use Caddy as the initial reverse proxy for pilot and VPS deployments.

Caddy will provide:

- HTTPS certificate management
- HTTP-to-HTTPS redirection
- Reverse proxying to the application
- Basic security header configuration where appropriate

### Proxy Rules

- Only the reverse proxy should be publicly exposed.
- PostgreSQL must remain on a private container network.
- Administration interfaces must not be publicly exposed by default.
- Proxmox must never be exposed through the Kaul domain.
- Proxy configuration must be stored in the repository without embedding secrets.
- Development on localhost does not require Caddy unless testing deployment behaviour.

A future hosting platform may replace Caddy with its managed ingress or proxy without requiring application changes.

---

## Environment Configuration

Environment-specific behaviour must use environment variables.

Expected configuration categories include:

- Application URL
- Database connection
- Authentication secrets
- Storage provider
- Storage location or bucket
- Email configuration
- Logging level
- Backup configuration

### Configuration Rules

- Secrets must not be committed to Git.
- The repository must include a documented `.env.example`.
- Environment variables must be validated at application startup.
- The application should fail clearly when required configuration is absent.
- Development, pilot, and production use separate secret values.
- Environment files containing real secrets must remain ignored by Git.
- Source-code changes must not be required when moving between supported hosting environments.

---

## Email

Version 1 may require transactional email for account invitations or password resets.

Email must not be used for ordinary client documentation or include sensitive journal content.

### Email Rules

- Use a transactional email provider or organisation-controlled SMTP service.
- Keep email content minimal.
- Do not include sensitive client information.
- Do not make email reminders a Version 1 dependency.
- Development should use a safe test mailbox or local email-capture tool.
- The specific provider should remain configurable.

---

## Backups

Backup implementation will be detailed in `DEPLOYMENT.md`.

The technical stack must support backup of:

- PostgreSQL
- Uploaded files
- Generated final documents
- Necessary deployment configuration

### Backup Rules

- Backups must be encrypted.
- At least one backup copy must be stored separately from the application host.
- Backup credentials must not be identical to normal application credentials.
- Restore procedures must be tested.
- Proxmox snapshots may supplement backups but must not be the only backup method.
- Backup and restore must use portable formats where practical.

---

## Export

Organisation exports will be generated by the application using open, documented formats.

Expected formats include:

- JSON
- CSV
- PDF
- Original uploaded file formats
- ZIP as the export package container

### Export Rules

- Export structure must be versioned.
- Export packages should contain a manifest.
- Stable identifiers and relationships must be preserved.
- The export should not depend on Prisma or PostgreSQL to be understandable.
- Export generation is restricted to authorised administrators.
- Large exports may later require background processing, but Version 1 should begin with the simplest safe implementation appropriate to expected data size.

---

## Continuous Integration

GitHub Actions will be used for initial continuous integration.

The initial pipeline should run:

- Dependency installation
- Type checking
- Linting
- Unit and integration tests
- Production build verification

### CI Rules

- CI must not use production secrets.
- CI data must be fictional.
- Dependency caching may be used when it does not make builds unreliable.
- Deployment automation should be introduced separately after the pilot process is understood.
- Passing CI does not automatically authorise production deployment.

---

## Development Environments

Kaul will use three conceptual environments.

### Development

- Runs on the developer's computer
- Uses fictional data
- May use local containers
- May be reset freely

### Pilot

- Runs on the Proxmox homelab
- Used by the initial company users
- Displays a persistent pilot warning
- Should not be used for sensitive personal data
- Uses separate credentials and database from development

### Production

- Runs on a professional external hosting provider
- Stores live organisational data
- Requires completed security, backup, monitoring, and recovery controls

The same application code and container image should be usable in all environments.

---

## Explicitly Rejected for Version 1

The following technologies or architectural approaches are not approved for Version 1:

- SQLite as the primary database
- Firebase as the primary data store
- Browser-only persistence
- Microservices
- Kubernetes
- GraphQL
- Dedicated search clusters
- Event streaming platforms
- Public object-storage buckets
- Native mobile frameworks
- Real-time collaborative editing
- Offline client record storage
- Multiple frontend frameworks
- Custom cryptography
- Building authentication entirely from scratch
- Infrastructure tied exclusively to Proxmox
- Infrastructure tied exclusively to one cloud provider

A rejected technology may be reconsidered later only when a validated requirement justifies the added complexity.

---

## Technology Decision Test

Before adding or replacing a technology, ask:

1. What demonstrated problem does it solve?
2. Can the approved stack already solve that problem clearly?
3. Does it reduce or increase operational complexity?
4. Does it weaken portability?
5. Does it introduce another service to secure, monitor, back up, or pay for?
6. Is it mature and actively maintained?
7. Can Aaron understand and maintain it six months from now?
8. Does it improve the experience for Kaul's users?
9. Is it necessary for Version 1?

The default answer to adding a new technology should be no until its value is demonstrated.

---

## Initial Approved Stack

The initial approved stack is:

```text
Application framework: Next.js with App Router
User interface: React
Programming language: TypeScript
Runtime: Node.js LTS
Package manager: npm
Database: PostgreSQL
ORM and migrations: Prisma
Runtime validation: Zod
Complex forms when required: React Hook Form
Styling: Tailwind CSS with custom design tokens
Authentication: Better Auth with local credentials, according to ADR 0001
File storage: Replaceable local and S3-compatible storage abstraction
Unit and integration testing: Vitest
Component testing: React Testing Library where appropriate
End-to-end testing: Playwright
Code quality: TypeScript, ESLint, and Prettier
Containers: Docker and Docker Compose
Reverse proxy: Caddy
Continuous integration: GitHub Actions
Primary deployment target: Standard Linux host
```

---

## Current Status

The technical stack is approved for Version 1 implementation planning.

Better Auth `1.6.25` is the initially validated authentication version. Runtime
packages must be pinned during implementation, and later upgrades require the
review described above.

Any material departure from this document should be documented as an architectural decision.
