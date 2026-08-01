# Kaul Coding Standards

Version: 0.1

---

## Purpose

This document defines the coding standards for Kaul.

Its purpose is to keep the codebase:

- Understandable
- Consistent
- Secure
- Testable
- Maintainable
- Accessible to future contributors

These standards apply to human contributors and coding assistants.

The standards should support good engineering without introducing unnecessary abstraction or ceremony.

---

## General Principles

Kaul should prefer clear and conventional code over clever code.

Code should be written so that another developer can understand its intent without reconstructing the author's reasoning.

The project follows these principles:

- Simplicity over abstraction
- Explicit behaviour over hidden behaviour
- Readability over brevity
- Secure defaults over convenience
- Small focused modules over large general-purpose files
- Domain language over framework language
- Tested business rules over assumptions
- Reuse after repetition is demonstrated, not predicted

Do not create abstractions solely because similar code may exist in the future.

---

## Language

Application code is written in TypeScript.

All developer-facing names use English.

All end-user-facing text uses Swedish.

### Examples

Developer-facing:

```ts
client
journalEntry
assignedUser
signedAt
createWeeklyReport
```

User-facing:

```text
Klient
Anteckning
Ansvarig pedagog
Signerad
Skapa veckorapport
```

### Language Rules

- Do not mix Swedish and English in identifiers.
- Domain entities use the English terminology defined in `DOMAIN_MODEL.md`.
- User-visible labels, messages, validation errors, and document content use Swedish.
- Technical comments and documentation use English.
- Avoid abbreviations unless they are widely understood.
- Prefer descriptive names over short names.

---

## TypeScript

TypeScript strict mode must remain enabled.

### TypeScript Rules

- Avoid `any`.
- Use `unknown` for untrusted values until they are validated.
- Do not suppress type errors without a documented reason.
- Do not use non-null assertions merely to silence the compiler.
- Prefer narrow domain types over broad primitive types where useful.
- Use enums or string unions only when the permitted values are genuinely constrained.
- Do not duplicate types that can be safely derived from validated schemas.
- Public module boundaries should have clear input and output types.
- Runtime validation is still required for external input.

Example:

```ts
type ClientCategory = "YOUTH" | "ADULT";
```

Avoid unnecessary wrapper types that provide no additional safety or meaning.

---

## Naming Conventions

Use the following conventions:

- Components: `PascalCase`
- Types and interfaces: `PascalCase`
- Functions and variables: `camelCase`
- Constants: `UPPER_SNAKE_CASE` only for genuine constants
- Files and directories: `kebab-case`
- Database models: singular `PascalCase`
- Database fields: `camelCase`
- Environment variables: `UPPER_SNAKE_CASE`
- Audit action names: stable `UPPER_SNAKE_CASE`

Examples:

```text
client-list.tsx
journal-entry-form.tsx
permission-service.ts
weekly-report.ts
```

```ts
function createJournalEntry() {}
type JournalEntryStatus = "DRAFT" | "SIGNED";
const MAX_UPLOAD_SIZE_BYTES = 10_000_000;
```

Avoid vague names such as:

```text
data
item
thing
helper
utils
manager
processor
```

These names may be used only when their meaning is genuinely clear from the surrounding context.

---

## File and Module Structure

Code should be organised by domain area rather than only by technical file type.

Preferred conceptual structure:

```text
src/
├── app/
├── components/
│   └── ui/
├── modules/
│   ├── authentication/
│   ├── users/
│   ├── clients/
│   ├── assignments/
│   ├── journal/
│   ├── goals/
│   ├── follow-ups/
│   ├── documents/
│   ├── reports/
│   ├── search/
│   ├── exports/
│   └── audit/
├── lib/
├── styles/
└── test/
```

The exact structure may be refined during bootstrapping.

### Module Rules

A domain module may contain:

```text
components/
schemas/
services/
queries/
permissions/
types/
tests/
```

Not every module needs every directory.

Create directories only when they contain real code.

### Boundary Rules

- Pages and components should not contain complex business logic.
- Business operations belong in domain services or focused server-side functions.
- Database queries should not be scattered through UI components.
- Permission checks should use reusable server-side functions.
- Validation schemas should remain close to the domain operation they validate.
- Modules should expose a small intentional public interface.
- Avoid circular dependencies between modules.
- Shared code must be genuinely shared.

---

## Functions

Functions should perform one understandable task.

### Function Rules

- Prefer small focused functions.
- Use early returns to reduce unnecessary nesting.
- Avoid functions with many boolean arguments.
- Prefer named option objects when several parameters are required.
- Separate validation, authorisation, data access, and presentation when practical.
- Do not hide important side effects behind vague function names.
- Mutation functions should clearly communicate that they change state.
- Handle expected failure cases explicitly.

Prefer:

```ts
await signJournalEntry({
  journalEntryId,
  signerId,
});
```

Avoid:

```ts
await processEntry(id, true, false);
```

Do not split straightforward logic into many tiny functions when doing so makes the flow harder to follow.

---

## Components

React components should focus on presenting information and handling necessary interaction.

### Component Rules

- Prefer Server Components by default.
- Add `"use client"` only when browser-side state or APIs are required.
- Keep client-component boundaries small.
- Do not fetch sensitive data directly from client components.
- Do not place permission decisions solely inside components.
- Use semantic HTML before adding ARIA attributes.
- Keep Swedish interface text close to the interface unless centralisation provides a demonstrated benefit.
- Avoid components with large numbers of unrelated props.
- Prefer composition over deeply configurable universal components.
- Do not build a generic component system before repeated patterns exist.

A component may format data, but important domain decisions should occur before rendering.

---

## Server-Side Operations

All sensitive operations must execute on the server.

Examples include:

- Authentication
- Permission checks
- Client creation
- Assignment changes
- Journal signing
- Document access
- Report generation
- Organisation export
- Audit-event creation

### Operation Order

A typical mutation should:

1. Authenticate the current user.
2. Validate the input.
3. Verify organisation membership.
4. Check role and assignment permissions.
5. Load required current state.
6. Apply domain rules.
7. Perform the database transaction.
8. Create the required audit event.
9. Return a safe result.

The exact order may vary when security or transactional consistency requires it.

Never trust:

- Hidden form fields
- Client IDs supplied by the browser
- Role values supplied by the browser
- Organisation IDs supplied by the browser
- File metadata supplied by the browser
- UI visibility as proof of permission

---

## Database Access

Prisma access must remain server-side.

### Query Rules

- Keep queries close to their domain module.
- Select only fields required by the operation where practical.
- Avoid repeatedly loading large related object graphs.
- Make organisation boundaries explicit in sensitive queries.
- Permission checks and data retrieval should minimise opportunities for cross-organisation access.
- Use transactions when several related changes must succeed or fail together.
- Avoid raw SQL unless Prisma cannot express the required operation clearly.
- Review raw SQL carefully for parameterisation and organisation boundaries.
- Do not return Prisma records directly to the browser when they contain unnecessary fields.

### Migration Rules

- Use descriptive migration names.
- Review generated migrations before applying them.
- Never assume a schema change is safe because Prisma generated it.
- Test migrations against realistic fictional data.
- Do not edit migration history already applied to shared environments.
- Create an explicit backup before high-risk production migrations.

---

## Validation

All untrusted input must be validated at runtime.

### Validation Rules

- Use Zod for shape and basic constraint validation.
- Perform validation on the server.
- Client-side validation may duplicate selected rules for better usability.
- Database-dependent domain rules belong outside basic Zod schemas.
- Swedish validation messages must be clear and actionable.
- Avoid exposing internal field or database names in user-facing errors.
- Normalise input deliberately rather than silently changing important content.
- Preserve meaningful whitespace and formatting in journal text where appropriate.

Validation failure is an expected outcome and should not be treated as an application crash.

---

## Error Handling

Errors should be classified and handled intentionally.

Useful categories include:

- Validation error
- Authentication error
- Authorisation error
- Not-found error
- Conflict error
- Storage error
- Unexpected internal error

### Error Rules

- Users receive calm Swedish messages.
- Internal stack traces are never shown in production.
- Sensitive record content must not be included in error messages.
- Expected domain failures should use explicit result or error types.
- Unexpected errors should be logged with a safe correlation identifier.
- Do not catch errors only to ignore them.
- Do not expose database or library errors directly to users.
- Failed multi-step operations should not leave partial state where a transaction can prevent it.

Example user-facing message:

```text
Anteckningen kunde inte sparas. Försök igen eller kontakta administratören om problemet kvarstår.
```

---

## Security

Security rules in `SECURITY.md` take precedence over convenience.

### Coding Security Rules

- Do not implement custom cryptography.
- Do not store plain-text passwords.
- Do not expose secrets to client-side code.
- Do not commit secrets.
- Do not build SQL through string concatenation.
- Do not render untrusted HTML.
- Escape or safely render user-entered text.
- Validate uploaded files on the server.
- Enforce file-size and file-type restrictions.
- Generate unpredictable storage identifiers.
- Use secure cookies for authenticated sessions.
- Apply permission checks immediately before protected operations.
- Avoid storing sensitive application data in `localStorage` or `sessionStorage`.
- Do not include journal text in analytics, logs, URLs, or error-reporting metadata.
- Treat exports and document downloads as sensitive operations.

Security-related shortcuts must be rejected rather than marked as future cleanup.

---

## Journal Records

Journal entries require additional care because they may become official records.

### Journal Rules

- Drafts and signed records must be clearly distinguished.
- Only authorised users may create drafts for a client.
- Signed records are immutable through ordinary application operations.
- Signing must occur on the server.
- Signing information must preserve the historical signer name, title, role, and timestamp.
- Corrections must reference the original record.
- Do not update the original text when adding a correction.
- Do not allow silent replacement of signed content.
- Journal identifiers must remain stable.
- Journal content must not be written to ordinary application logs.
- Tests must cover attempted modification of signed records.

---

## Audit Events

Important actions must create audit events using centralised audit functionality.

### Audit Rules

- Use stable action identifiers.
- Do not create arbitrary audit-action strings throughout the codebase.
- Audit events must be append-only during ordinary operation.
- Audit metadata must remain minimal.
- Do not store full journal text in audit metadata.
- Include the actor, target, action, result, and timestamp where applicable.
- Security-relevant failures may require audit events.
- Audit failures during critical mutations must be handled deliberately rather than silently ignored.

Example actions:

```ts
const AuditAction = {
  USER_CREATED: "USER_CREATED",
  CLIENT_CREATED: "CLIENT_CREATED",
  ASSIGNMENT_CREATED: "ASSIGNMENT_CREATED",
  JOURNAL_ENTRY_SIGNED: "JOURNAL_ENTRY_SIGNED",
  DOCUMENT_UPLOADED: "DOCUMENT_UPLOADED",
  ORGANISATION_EXPORTED: "ORGANISATION_EXPORTED",
} as const;
```

---

## Logging

Operational logging and audit logging are separate concerns.

### Logging Rules

- Prefer structured logs.
- Include a request or correlation identifier when useful.
- Never log passwords, sessions, reset tokens, or secrets.
- Never log complete journal entries.
- Avoid complete personal identifiers.
- Do not use `console.log` as permanent production observability.
- Temporary debugging logs must be removed before merging.
- Log failures at the boundary where useful context is available.
- Avoid logging the same failure repeatedly at several layers.

---

## Comments

Code should normally explain itself through structure and naming.

Use comments to explain:

- Why a non-obvious decision exists
- Security constraints
- Domain constraints
- Compatibility workarounds
- Temporary limitations with a tracked follow-up

Do not use comments to restate the code.

Prefer:

```ts
// Preserve the original signer details because signed records must remain
// historically accurate after a user's title changes.
```

Avoid:

```ts
// Set signedAt to the current date.
signedAt = new Date();
```

Outdated comments are defects and should be updated or removed.

---

## Documentation

Public or complex modules should document:

- Their responsibility
- Important inputs and outputs
- Permission assumptions
- Important side effects
- Domain constraints

Do not generate excessive documentation for trivial functions.

Material architectural decisions should be recorded in `docs/decisions/`.

Documentation changes should accompany code changes when behaviour or operational procedures change.

---

## Testing Standards

Tests should focus on behaviour and risk.

### Test Naming

Test names should describe:

- The situation
- The action
- The expected result

Example:

```ts
it("denies a staff member access to a client without an active assignment", async () => {
  // ...
});
```

### Testing Rules

- Test successful and denied paths.
- Test domain invariants.
- Test permission boundaries.
- Test journal immutability.
- Test organisation isolation where applicable.
- Test validation at server boundaries.
- Use fictional Swedish test data.
- Avoid tests that depend on execution order.
- Avoid tests that assert implementation details without user or domain value.
- Do not mock the entire application architecture.
- Use PostgreSQL for database-sensitive integration tests.
- Add a regression test when fixing a meaningful defect.

High-risk functionality requires tests before it is considered complete.

---

## Accessibility

Accessibility is part of correctness.

### Accessibility Rules

- Use semantic HTML.
- Every form control requires an accessible label.
- All functionality must be usable with a keyboard.
- Focus must move predictably.
- Focus indicators must remain visible.
- Dialogs and slide-in panels must manage focus correctly.
- Error messages must be associated with relevant fields.
- Do not use colour as the only status indicator.
- Support browser zoom and magnification.
- Avoid layouts that break at large text sizes.
- Use adequate contrast.
- Important actions require clear text labels.
- Test critical workflows without a mouse.

The 2 AM Test includes users working under fatigue, stress, visual impairment, and time pressure.

---

## Swedish Interface Standards

User-facing Swedish should be plain, professional, and consistent.

### Writing Rules

- Prefer familiar words.
- Avoid unnecessary technical terminology.
- Avoid casual startup language.
- Use sentence case.
- Use consistent entity names.
- Use direct action labels.

Prefer:

```text
Spara anteckning
Tilldela pedagog
Arkivera klient
Skapa veckorapport
```

Avoid:

```text
Submit
Process
Execute
Awesome!
Something went wrong!
```

Destructive and irreversible actions must clearly explain their effect.

---

## Formatting

The project will use Prettier for automated formatting.

### Formatting Rules

- Do not manually fight the formatter.
- Do not introduce unrelated formatting changes in focused pull requests.
- Keep files reasonably sized.
- Break up a file when it contains multiple unrelated responsibilities.
- Do not split files solely to meet an arbitrary line-count limit.
- Keep import organisation consistent with the configured tooling.

---

## Dependency Standards

Dependencies carry security and maintenance costs.

Before adding a dependency, determine:

1. What problem it solves.
2. Whether the platform or existing stack already solves it.
3. Whether it is actively maintained.
4. Whether its licence is acceptable.
5. Whether it runs on the server, browser, or both.
6. Whether it processes sensitive data.
7. Whether it substantially increases bundle size or operational complexity.
8. Whether it can be removed or replaced later.

Do not add a dependency solely because a coding assistant suggested it.

---

## Git Standards

Use small, meaningful commits.

### Commit Rules

- Each commit should represent one coherent change.
- Use imperative English commit messages.
- Do not commit generated secrets or local data.
- Do not commit broken code intentionally to the shared main branch.
- Do not mix broad refactoring with unrelated feature changes.
- Review staged files before committing.
- Generated migration files belong in Git.
- Lock files belong in Git.

Examples:

```text
Add client assignment domain service
Enforce signed journal immutability
Add PostgreSQL development container
Document pilot backup procedure
```

---

## Pull Requests and Reviews

Even when one developer is working alone, changes should be reviewed before merging or considering them complete.

A review should ask:

- Does this match the project specification?
- Is it needed for the current milestone?
- Is the implementation simpler than necessary?
- Are permissions enforced on the server?
- Could this expose another client's or organisation's data?
- Are errors and edge cases handled?
- Are important behaviours tested?
- Is the Swedish interface clear?
- Does it pass the 2 AM Test?
- Is the documentation still accurate?

Coding assistants must not treat their own generated implementation as automatically correct.

---

## Refactoring

Refactoring should improve current code, not prepare for imaginary future requirements.

Refactor when:

- Responsibilities are unclear.
- Duplication causes inconsistent behaviour.
- Security rules are repeated and may drift.
- A file has accumulated unrelated logic.
- Tests are difficult because boundaries are poor.
- Domain terminology is inconsistent.

Do not refactor merely to introduce a design pattern or abstraction.

Behaviour should remain covered by tests during meaningful refactoring.

---

## Prohibited Patterns

The following are prohibited unless an architectural decision explicitly approves them:

- `any` used to bypass type safety
- Client-side permission enforcement as the only protection
- Direct database access from client components
- Plain-text passwords
- Secrets committed to Git
- Custom authentication cryptography
- Silent modification of signed records
- Publicly accessible uploaded files
- Sensitive data in URLs
- Sensitive journal content in logs
- Hard-coded organisation or user IDs
- Hard-coded host-specific file paths
- Duplicate permission logic spread across pages
- Catching and ignoring errors
- Large generic utility files containing unrelated behaviour
- Premature microservices
- Premature generic repository patterns
- Unreviewed dependencies
- Disabling tests to make a change pass
- Using production data in development or automated tests

---

## Definition of Done

A change is complete when:

- It addresses a validated requirement in the current milestone.
- It follows the project specification and domain model.
- It uses approved technologies.
- It has appropriate server-side authorisation.
- Input is validated.
- Expected errors are handled.
- Relevant tests pass.
- Type checking passes.
- Linting passes.
- Formatting passes.
- User-visible content is Swedish.
- Accessibility has been considered.
- Security implications have been reviewed.
- Audit behaviour is correct where required.
- Documentation is updated where required.
- No sensitive data or secrets are included.
- The implementation is understandable without unnecessary complexity.

A feature is not complete merely because it works in the happy path.

---

## Engineering Decision Test

Before implementing a solution, ask:

1. Is this required by the current milestone?
2. Is this the smallest clear solution?
3. Does an existing module already own this responsibility?
4. Are we introducing an abstraction before repetition exists?
5. Are authorisation and organisation boundaries enforced?
6. Could this change historical records incorrectly?
7. Is sensitive information exposed to the browser, logs, or URLs?
8. Can the behaviour be tested?
9. Can Aaron understand it six months from now?
10. Does the interface pass the 2 AM Test?

When uncertain, prefer the simpler implementation and document the unresolved concern.

---

## Current Status

These coding standards are approved for initial project bootstrapping.

They may be revised when implementation experience demonstrates a clear need.

Material exceptions should be intentional, reviewed, and documented.