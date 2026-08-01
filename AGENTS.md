# Kaul Agent Instructions

## Purpose

This file defines how coding agents must work within the Kaul repository.

Agents are expected to act as critical engineering collaborators, not passive code generators.

Their responsibility is not merely to implement requests. They must help protect the project's simplicity, security, consistency, portability, and maintainability.

---

## Read Before Making Changes

Before planning or implementing a change, read the documentation relevant to the task.

The primary project documents are:

- `docs/PROJECT_SPEC.md`
- `docs/ARCHITECTURE.md`
- `docs/DOMAIN_MODEL.md`
- `docs/TECH_STACK.md`
- `docs/CODING_STANDARDS.md`
- `docs/SECURITY.md`
- `docs/DEPLOYMENT.md`
- `docs/UI.md`
- `docs/MILESTONES.md`
- `docs/decisions/`

Documents that do not yet contain content should not be treated as established requirements.

The following order of authority applies:

1. Security and privacy requirements
2. Project specification
3. Domain model
4. Architecture
5. Current milestone
6. Technical stack
7. Coding standards
8. Individual implementation requests

If instructions conflict, stop and clearly describe the conflict before changing code.

Do not silently choose one interpretation.

---

## Working Behaviour

Agents must:

- Understand the existing implementation before modifying it.
- Inspect relevant files rather than guessing their contents.
- Identify which domain module owns the requested behaviour.
- Explain material risks, contradictions, or missing requirements.
- Prefer the smallest complete solution.
- Preserve existing behaviour unless a change is intentional.
- Keep changes focused on the current task.
- Add or update tests for important behaviour.
- Update documentation when behaviour or architecture changes.
- State assumptions clearly.
- Admit uncertainty rather than inventing an answer.
- Review generated work critically before presenting it as complete.

Agents must not assume that generated code is correct merely because it compiles.

---

## Be Constructively Critical

Do not blindly implement every suggestion.

Challenge a request when it would:

- Conflict with existing project documentation
- Expand the current milestone without a demonstrated need
- Weaken authentication or authorisation
- Risk exposing sensitive information
- Break signed-record immutability
- Damage historical traceability
- Introduce vendor lock-in
- Make export or migration more difficult
- Add unnecessary infrastructure
- Add a dependency without sufficient value
- Duplicate an existing responsibility
- Introduce premature abstraction
- Create a likely maintenance burden
- Violate the 2 AM Test
- Solve an imagined future problem rather than a current requirement

When challenging a request:

1. Explain the concern plainly.
2. Identify the affected requirement or principle.
3. Propose the smallest safe alternative.
4. Continue with the safe, in-scope portion where possible.

Do not become obstructive over harmless implementation details.

Criticism should be proportional to the risk and complexity of the decision.

---

## Scope Control

Version 1 is intentionally small.

Before implementing a feature, determine whether it belongs to the current milestone.

Do not silently add:

- Extra dashboards
- Analytics
- Notification systems
- Calendar integrations
- AI functionality
- Public APIs
- Multi-organisation administration
- Fine-grained custom permissions
- Real-time collaboration
- Native mobile applications
- Background-processing infrastructure
- Additional deployment services
- Generic workflow engines
- Features described only as potentially useful later

Future compatibility may be considered, but speculative features must not be implemented.

The project should be extensible through clear boundaries, not through unused abstractions.

---

## Planning Changes

For non-trivial changes, provide a concise implementation plan before editing code.

The plan should identify:

- The requirement being addressed
- The relevant module or modules
- Files likely to change
- Important domain or security rules
- Tests that must be added or updated
- Documentation affected
- Any unresolved decision

Do not create an extensive planning document for a small, obvious change.

---

## Architecture Rules

Kaul is a modular monolith.

Agents must preserve this architecture.

Do:

- Organise business logic by domain module.
- Keep module responsibilities clear.
- Use reusable server-side authorisation functions.
- Keep database access in server-side data-access code.
- Keep important domain rules outside presentation components.
- Use transactions for operations that must remain consistent.
- Keep uploaded-file storage behind a replaceable abstraction.

Do not introduce:

- Microservices
- Kubernetes
- Separate frontend and backend applications
- Event buses
- GraphQL
- Dedicated search infrastructure
- Generic repository layers without demonstrated value
- Cloud-provider-specific business logic

A material architectural change requires an architecture decision record.

---

## Security and Privacy

Security requirements are not optional cleanup work.

Agents must:

- Enforce permissions on the server.
- Apply organisation boundaries before role and assignment checks.
- Verify access immediately before sensitive operations.
- Treat browser-supplied identifiers as untrusted.
- Validate all untrusted input.
- Keep secrets out of source control.
- Keep sensitive data out of URLs.
- Keep journal content out of ordinary logs.
- Keep passwords, sessions, and tokens out of all logs.
- Prevent public or predictable access to uploaded files.
- Use maintained security libraries.
- Preserve secure cookie and session configuration.
- Consider denied-access paths in tests.
- Use fictional information in development and tests.

Agents must never:

- Implement custom cryptography
- Store plain-text passwords
- Rely on hidden navigation as access control
- Put database credentials in client-side code
- Disable a security control merely to simplify development
- Use production data for local development
- expose PostgreSQL directly to the public internet

When a request creates a security concern, raise it before implementation.

---

## Authorisation Model

Version 1 has two application roles:

- Administrator
- Staff Member

Administrators may access all clients within their organisation.

Staff members may access only clients connected to them through an active primary or secondary assignment.

The same rules apply to:

- Direct page access
- Server operations
- Search
- Journal entries
- Goals
- Follow-ups
- Documents
- Reports
- Downloads
- Exports

Do not duplicate authorisation logic independently across pages.

Centralise and test permission behaviour.

Historical authorship does not grant continued access after an assignment ends.

---

## Journal Integrity

Journal records require special protection.

Agents must preserve these rules:

- Draft entries may be edited only by authorised users.
- Signed entries are immutable.
- Signing occurs on the server.
- Signing captures the historical signer name, professional title, role, and timestamp.
- Later changes to a user's profile do not alter historical signing information.
- Corrections are separate signed records.
- Corrections reference the original entry.
- Original signed content is not overwritten.
- Signed entries are not normally deleted.
- Journal content is never placed in ordinary logs or audit metadata.
- Stable journal identifiers are preserved.

Any implementation that bypasses these rules must be rejected.

---

## Data Ownership and Portability

The customer owns all information stored in Kaul.

Agents must avoid designs that make migration unnecessarily difficult.

New entities and relationships should be considered in:

- Organisation exports
- Human-readable exports
- Machine-readable exports
- Database backups
- File backups
- Restore procedures
- Stable identifier preservation

Do not make exports depend on internal Prisma representations.

Do not tie business logic exclusively to:

- Proxmox
- A particular VPS provider
- Azure
- AWS
- A specific object-storage vendor

Provider-specific integration belongs behind configuration or an adapter.

---

## Database Changes

Kaul uses PostgreSQL and Prisma.

Before changing the schema:

- Review the domain model.
- Identify whether the change represents a real business concept.
- Consider existing data.
- Consider migration and rollback risks.
- Consider export implications.
- Consider audit implications.
- Consider signed-record history.
- Add or update relevant tests.

Agents must:

- Use descriptive migration names.
- Inspect generated migrations.
- Commit migration files.
- Avoid rewriting applied shared migrations.
- Warn clearly about destructive changes.
- Preserve stable identifiers and relationships.
- Use transactions where consistency requires them.

Do not switch the project to SQLite for convenience.

Do not perform undocumented manual production schema changes.

---

## Dependencies

Adding a dependency is an architectural and maintenance decision.

Before adding one, explain:

- The problem it solves
- Why existing platform functionality is insufficient
- Whether it is actively maintained
- Whether it runs in the browser or server
- Whether it processes sensitive data
- Its security and operational implications
- Whether a smaller alternative exists

Do not add dependencies for trivial behaviour.

Do not replace an approved technology merely because another option is newer or more popular.

The exact authentication library must be evaluated against the current supported Next.js version before selection.

---

## User Interface

Everything visible to end users must be written in Swedish.

Developer-facing code and documentation use English.

The interface must remain:

- Calm
- Predictable
- Professional
- Accessible
- Keyboard usable
- Compatible with browser zoom and magnification
- Understandable under fatigue and time pressure

Use the 2 AM Test:

> Can a tired staff member understand what to do without training or guesswork?

Avoid:

- Dashboard clutter
- Decorative animations
- Excessive colours
- Excessive icons
- Startup-style language
- Ambiguous labels
- Hidden critical actions
- Colour-only status communication
- Unnecessary confirmation dialogs
- Artificial progress metrics without real meaning

Important actions should use clear Swedish text labels.

---

## Testing Expectations

Tests should focus on risk and behaviour.

Prioritise tests for:

- Authentication
- Denied authentication attempts
- Role permissions
- Assignment-based client visibility
- Direct URL access
- Organisation isolation
- Journal signing
- Signed-entry immutability
- Correction workflows
- Document access
- File download permissions
- Export completeness
- Audit-event creation
- Archive behaviour
- Migration-sensitive business rules

When fixing a meaningful defect, add a regression test.

Do not remove, weaken, skip, or rewrite valid tests merely to make a change pass.

Do not treat high test coverage as a substitute for meaningful tests.

---

## Validation and Error Handling

All mutations must validate input on the server.

Agents should distinguish between:

- Validation failures
- Authentication failures
- Authorisation failures
- Missing records
- Conflicts
- Storage failures
- Unexpected internal failures

User-facing errors must:

- Be written in Swedish
- Be calm and actionable
- Avoid exposing implementation details
- Avoid exposing sensitive information

Unexpected failures should produce safe operational logs with a correlation identifier where useful.

Do not catch and silently ignore errors.

---

## Code Quality

Follow `docs/CODING_STANDARDS.md`.

In particular:

- Keep TypeScript strict mode enabled.
- Avoid `any`.
- Avoid non-null assertions used only to silence errors.
- Prefer descriptive English names.
- Keep business logic outside presentation components.
- Prefer Server Components by default.
- Keep client boundaries small.
- Do not scatter Prisma queries through UI code.
- Avoid generic utility files containing unrelated functions.
- Avoid premature abstraction.
- Remove temporary debugging output.
- Keep commits focused.

Code should be understandable to Aaron six months later.

---

## Documentation and Decisions

Update documentation when a change affects:

- Product scope
- Domain rules
- Architecture
- Technology choices
- Security behaviour
- Deployment
- Backup or recovery
- User workflows
- Milestones

Create an architecture decision record in `docs/decisions/` for material decisions that:

- Replace an approved technology
- Introduce a new infrastructure service
- Change a major domain relationship
- Change authentication strategy
- Change file-storage strategy
- Change deployment architecture
- Create a significant exception to existing standards

Do not create decision records for routine implementation details.

---

## Repository Safety

Agents must not:

- Commit or reveal secrets
- Modify production credentials
- Use real personal data
- Force-push shared branches
- Rewrite published Git history
- Delete backups
- Delete migrations without explicit approval
- Run destructive database commands without explicit approval
- Change deployment infrastructure outside the requested task
- Remove documentation because it appears unused
- Mark unfinished work as complete

When a command may destroy data, explain the risk and request explicit approval before running it.

---

## Completing a Task

Before declaring a task complete:

1. Review the original requirement.
2. Review the generated diff.
3. Remove unrelated changes.
4. Run relevant type checks.
5. Run linting.
6. Run relevant automated tests.
7. Run a production build when appropriate.
8. Check server-side authorisation.
9. Check Swedish user-facing text.
10. Check accessibility implications.
11. Check audit behaviour.
12. Check export and migration implications.
13. Update documentation where needed.
14. Report anything not tested or not completed.

Do not claim success when checks failed or were not run.

Clearly distinguish:

- Completed work
- Verified work
- Assumptions
- Remaining risks
- Suggested future work

---

## Agent Decision Test

Before implementing a requested change, ask:

1. Is it required by the current milestone?
2. Does it represent a real user or business need?
3. Does it conflict with existing documentation?
4. Is there a smaller safe solution?
5. Does it preserve security and historical traceability?
6. Does it preserve data portability?
7. Does it add a technology or abstraction unnecessarily?
8. Can it be tested?
9. Can Aaron maintain it six months from now?
10. Does it pass the 2 AM Test?

When the answer is unclear, explain the concern instead of confidently guessing.

---

## Final Principle

The goal is not to produce the most code or the most sophisticated architecture.

The goal is to build the smallest secure and reliable version of Kaul that solves the organisation's real documentation needs and can grow without requiring a complete rewrite.