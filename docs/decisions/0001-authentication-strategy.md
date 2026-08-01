# ADR 0001: Authentication Strategy

Status: Proposed
Date: 2026-08-01

## Context

Milestone 1 requires individual staff accounts, administrator-managed account
lifecycle, secure sessions, password management, rate limiting, and audit events.
Public registration, external identity providers, email delivery, MFA, and client
or journal functionality are outside this milestone.

Authentication is a security boundary, but it is not Kaul's business
authorisation model. This decision must remain consistent with
[SECURITY.md](../SECURITY.md), [DOMAIN_MODEL.md](../DOMAIN_MODEL.md),
[TECH_STACK.md](../TECH_STACK.md), [CODING_STANDARDS.md](../CODING_STANDARDS.md),
and [MILESTONES.md](../MILESTONES.md).

## Decision

Kaul proposes Better Auth for Version 1 authentication.

The currently reviewed stable candidate is Better Auth `1.6.25`. Before
implementation, `better-auth`, `@better-auth/prisma-adapter`, and the Better Auth
CLI package must be pinned to exact, mutually compatible stable versions and
verified against the repository's pinned Next.js, React, Prisma, Node.js, and
TypeScript versions. Beta, RC, canary, and other prerelease versions are not
permitted.

If the implementation checks below cannot be satisfied by the selected stable
version, this ADR must return for review rather than being weakened silently.

## Responsibility and User Ownership

Kaul will use one shared Better Auth `User` record. Milestone 1 will not add a
second Kaul user-profile table.

Better Auth owns:

- Password hashing and credential verification
- Credential accounts and authentication sessions
- Authentication cookies and authentication endpoints
- Authentication-specific database records

The shared `User` is extended with these Kaul-owned fields:

- `organisationId`
- `professionalTitle`
- `role`
- `mustChangePassword`
- `temporaryCredentialExpiresAt`

Kaul owns the fields' meaning, mutation rules, validation, auditing, and use in
business authorisation. All five fields are server-owned and must reject browser
input. Better Auth additional fields must use `input: false`; plugin-owned fields
must receive equivalent endpoint and server-side protection.

There is one canonical role field with exactly two allowed values:

- `ADMINISTRATOR`
- `STAFF_MEMBER`

The Admin plugin's role column is this canonical field, not a second role system.
Its custom access-control roles use the two Kaul values. Better Auth's default
`admin` and `user` meanings, multiple comma-separated roles, and `adminUserIds`
bypass are not used. Kaul enforces exactly one role and the database schema must
prevent other stored values. The exact Prisma enum or database constraint must be
confirmed with the pinned adapter during schema review.

Organisation membership is evaluated before role checks. A session or a Better
Auth permission never proves access to Kaul business data by itself.

## Prisma Schema and Migration Workflow

Kaul will use the official Prisma adapter with PostgreSQL. Better Auth's stable
documentation supports Prisma schema generation but not Prisma migration.

The required workflow is:

1. Configure Better Auth and the selected plugins.
2. Run the exact pinned CLI schema generator. For the reviewed candidate, the
   command is `npx auth@1.6.25 generate`—never `@latest`.
3. Inspect and merge the generated models into Kaul's Prisma schema.
4. Preserve the Prisma 7 generator's custom client output at
   `../src/generated/prisma`.
5. Create a descriptive, named Prisma migration.
6. Inspect the generated SQL for tables, constraints, indexes, foreign keys, and
   destructive changes.
7. Apply the migration using Prisma only.
8. Commit both schema and migration after verification.

Better Auth's `migrate` command must not be used with Prisma. Experimental joins
remain disabled. Every Better Auth upgrade requires a newly generated schema diff
and normal Prisma migration review.

## Authentication Methods and Public Signup

The required email-and-password settings are:

- `emailAndPassword.enabled: true`
- `emailAndPassword.disableSignUp: true`
- `emailAndPassword.autoSignIn: false`

No social or anonymous provider is configured. Public email verification and
public password-reset email are not implemented in Milestone 1.

Disabling the user interface is insufficient. An integration test must call the
mounted public email signup endpoint directly, assert denial, and verify that no
`User` or `Account` record was created.

Login responses must be generic in Swedish for a wrong password, unknown email,
inactive account, and expired temporary credential. The response must not reveal
which condition occurred.

## Admin Plugin and Least Privilege

The Admin plugin is used only with a custom access controller. The expected
permissions for `ADMINISTRATOR` are:

- `user`: `create`, `list`, `get`, `set-password`, `ban`
- `session`: `list`, `revoke`

`STAFF_MEMBER` receives none of these permissions. The exact permission names and
the endpoints each permission gates must be verified against the pinned stable
release before implementation. In particular, verification must prove that
`ban` covers both deactivation and reactivation, and that `session: revoke`
covers the required single-session and all-session operations.

The following permissions and capabilities are forbidden:

- Impersonation, including administrator impersonation
- Hard user deletion
- Arbitrary email changes
- Generic unrestricted user updates
- Unrestricted Better Auth role changes
- Any user-ID-based administrator bypass

Kaul-owned server operations wrap account administration and enforce the current
database-backed session, active state, organisation, `ADMINISTRATOR` role, target
rules, final-administrator invariant, input validation, and audit protocol.

The mounted Better Auth endpoints remain an attack surface. Common Better Auth
before/after hooks or an equally strong server-side mechanism must enforce those
same rules when a permitted Admin endpoint is called directly. Tests must call
the HTTP endpoints directly rather than trusting only the Kaul user interface.
If the pinned stable version cannot cover direct and server-API calls reliably,
the affected endpoint must not be exposed and this decision must be reviewed.

## Account Lifecycle

The user-facing term is **account deactivation**, not banning. Internally it maps
to Better Auth's non-expiring `banned` state unless implementation verification
finds a safer supported mechanism.

Deactivation must, as one idempotent Kaul operation:

1. Verify the acting administrator and target organisation.
2. Refuse to deactivate or demote the final active administrator.
3. Set the target account to the non-expiring inactive state.
4. Revoke all target sessions.
5. Preserve the user and every historical reference.
6. Record the audit outcome.

Better Auth documents that banning prevents sign-in and revokes existing
sessions, but Kaul still verifies both effects. The central authentication guard
must load the full database-backed session and current user on every protected
request and deny inactive users. Reactivation clears the inactive state, records
an audit event, and does not restore revoked sessions.

## Sessions and Server-Side Guards

Sessions are stored in PostgreSQL with:

- `expiresIn: 43_200` seconds (12 hours)
- `disableSessionRefresh: true`
- `cookieCache.enabled: false`
- No remember-me option

This is an absolute lifetime measured from session creation, not an idle timeout.
Session use must not move the expiry. Tests cover the instant immediately before
and immediately after the 12-hour boundary.

Logout revokes the current session. A normal password change uses
`revokeOtherSessions: true`. Administrator-assisted reset and deactivation revoke
all sessions. Revocation tests must prove denial on the next protected request.

Every protected page, route handler, server action, and mutation performs full
server-side session validation. Next.js proxy or middleware checks and navigation
redirects are convenience controls only; cookie presence is never authoritative.

## Password Policy and Forced Change

Milestone 1 password policy is:

- Minimum 15 characters
- Maximum 128 characters
- Spaces and passphrases allowed
- No composition rules
- No scheduled password expiry
- Strong generated temporary passwords

Kaul uses Better Auth's maintained password hashing and does not implement custom
cryptography.

`mustChangePassword` is server-owned. While it is true, the central guard allows
only password change, logout, and the minimum session access required by those
operations. Every other page, route handler, server action, and mutation is
denied server-side.

The flag and temporary-credential expiry are cleared only after Better Auth
confirms a successful password change, which must request
`revokeOtherSessions: true`. Direct URL and direct server-operation bypasses are
tested.

## Temporary Credentials and Reset

Administrators never choose temporary passwords. Kaul generates them with the
platform's cryptographically secure random generator. A temporary password:

- Meets the password-length policy
- Is displayed once over an authenticated response
- Is never logged or stored separately in plaintext
- Sets `mustChangePassword` to true
- Sets `temporaryCredentialExpiresAt` to 24 hours after creation
- Is not sent through ordinary email during the pilot

Delivery is out of band through a channel explicitly approved by the deploying
organisation. No channel is assumed approved by this ADR. Milestone 1 cannot be
operationally accepted until that channel and its identity-verification procedure
are recorded. After expiry, session creation is denied and an already restricted
session loses password-change access; another administrator-assisted reset is
required.

The pilot reset flow must:

1. Verify the acting administrator and refuse self-reset through the admin flow.
2. Apply organisation and final-active-administrator safeguards.
3. Generate and set a new temporary password.
4. Set the forced-change flag and 24-hour expiry.
5. Revoke every target session.
6. Record the audit outcome.
7. Return the password exactly once.

Public reset email is not implemented in Milestone 1. Recovery when the only
active administrator has lost access is an operational decision required before
pilot deployment; it must not become a public setup or reset endpoint.

## Initial Organisation and Administrator

Initial setup uses a repository-owned operator command, never an HTTP setup page.
It must use the pinned stable Better Auth server API and:

- Securely prompt for a non-default password without echoing or logging it
- Validate the same 15-to-128-character policy
- Create or verify the single organisation idempotently
- Create exactly one initial `ADMINISTRATOR`
- Write a safe audit event
- Refuse default credentials and accidental repeated setup
- Detect an existing account after an ambiguous failure before any retry
- Give an operator a specific recovery result without exposing credentials

The command is disabled or refuses execution once initial setup is complete. It
must use fictional data in automated tests.

## Rate Limiting and Reverse Proxy Contract

Better Auth rate limiting uses database storage and is explicitly enabled in
test, pilot, and production. The initial sign-in rule is at most 5 requests per
60 seconds per resolved client IP for `/sign-in/email`; all other auth endpoints
retain an explicitly reviewed default limit. Tests verify the limit, recovery
after the window, and a generic response. Thresholds must be reviewed with pilot
traffic, not silently changed.

Local development may use the direct connecting client configuration documented
for that environment. The deployed Caddy contract is:

- Caddy overwrites one dedicated header, `X-Real-IP`.
- Better Auth reads only `x-real-ip` through `ipAddressHeaders`.
- The application container is reachable publicly only through Caddy.
- Broad private-network `trustedProxies` ranges are prohibited.
- Client-supplied forwarded headers are overwritten, not appended.

Caddy is implemented in a later milestone, but spoofing tests must prove that a
client cannot choose the rate-limit key or bypass the sign-in threshold.

## Secrets, Origins, and Cookies

Startup validation with Zod requires:

- `BETTER_AUTH_SECRET`: at least 32 characters of cryptographically secure,
  environment-specific secret material
- `BETTER_AUTH_URL`: one fixed, valid absolute base URL for the environment

Invalid or missing values fail startup. Development, test, pilot, and production
use separate secrets. Secrets, passwords, session tokens, and connection details
must never enter client bundles, source control, logs, audit metadata, or errors.

Trusted origins are an explicit environment-specific allowlist. Broad dynamic
host or forwarded-host trust is prohibited. HTTPS and `Secure` cookies are
required outside localhost. Authentication cookies are HTTP-only;
cross-subdomain cookies and cookie session caching are disabled. CSRF and origin
checks remain enabled.

## Failure Consistency

This ADR does not claim that Better Auth mutations and Kaul audit writes share a
transaction. That must be proven against the pinned adapter before any atomicity
claim is made.

Administrator operations use an idempotency key and a durable audit intent before
the irreversible authentication mutation. If the intent cannot be written, the
mutation does not start. The outcome is then recorded against the same key.

If the Better Auth result is ambiguous or the outcome audit write fails, Kaul:

1. Returns a safe correlation identifier and does not advise a blind retry.
2. Checks the shared `User`, credential account, sessions, and intended target
   state before another mutation.
3. Completes the missing audit outcome idempotently or records a reviewed recovery
   outcome.

The shared `User` removes separate profile-creation failure, but it does not make
credential, user-field, session, and audit writes automatically atomic.
Fault-injection tests cover failures before and after each durable boundary.

## Audit Actions

Kaul defines these stable action identifiers:

- `authentication.login.succeeded`
- `authentication.login.failed`
- `authentication.logout`
- `authentication.initial-administrator.created`
- `authentication.staff.created`
- `authentication.password.changed`
- `authentication.password.administrator-reset`
- `authentication.account.deactivated`
- `authentication.account.reactivated`
- `authentication.role.changed`
- `authentication.session.revoked`

Events record the actor when known, target, organisation, timestamp, result, and a
safe correlation or operation identifier. They never record passwords, password
hashes, session tokens, cookies, reset material, or full request bodies. Failed
login auditing must not change the generic client response or leak account
existence.

## Required Verification

Milestone 1 acceptance requires tests for:

- Public signup denial with no created user or account
- Valid login; wrong password; unknown email; and generic failure responses
- Inactive-user sign-in denial and denial of an existing session after
  deactivation
- Absolute expiry on both sides of 12 hours and immediate session revocation
- Forced-change direct URL and server-operation bypass attempts
- Temporary-password expiry and administrator-assisted reset
- Staff denial from every account-administration endpoint, including direct HTTP
  calls
- Rate limits, expiry of the rate window, and proxy-header spoofing
- Final-active-administrator protection for deactivation and role change
- Ambiguous and partial account-creation failures, audit failure, and recovery
- Absence of passwords and sessions from logs and errors
- Clean PostgreSQL migration and Better Auth upgrade schema diffs

Security-sensitive tests use the real PostgreSQL adapter where adapter behaviour
matters. Time boundaries use controlled time rather than slow waits.

## Deferred and Unresolved Decisions

The Have I Been Pwned plugin is deferred to Milestone 7 — Pilot Readiness. It is a
required security review item, not a rejected feature. Its network, privacy,
availability, failure-mode, and user-message implications must be assessed then.

Before this ADR can become Accepted, implementation planning must resolve:

- Exact stable package pins and a clean compatibility installation
- Exact Admin permission-to-endpoint mapping in the pinned release
- Whether the Prisma role field can be constrained to the two Kaul values without
  adapter incompatibility
- Direct-endpoint hook coverage for invariants and audit outcomes
- The organisation-approved temporary-credential delivery channel
- The single-administrator credential-loss recovery procedure
- Whether any Better Auth and audit writes can safely share a Prisma transaction

## Consequences

This design delegates credential and session mechanics to a maintained library
while keeping Kaul's organisation, role, lifecycle, and audit rules explicit and
server-side. It avoids a duplicate user profile and avoids new infrastructure in
Milestone 1.

The cost is that Kaul must maintain a careful integration boundary around the
Admin plugin and must review generated schema changes on every Better Auth
upgrade. The temporary-password pilot flow also creates an operational secret
handoff that must be approved and documented before real use.

## Better Auth References Reviewed

- [Changelog](https://better-auth.com/changelog)
- [Prisma adapter](https://better-auth.com/docs/adapters/prisma)
- [CLI](https://better-auth.com/docs/concepts/cli)
- [Database and additional fields](https://better-auth.com/docs/concepts/database)
- [Email and password](https://better-auth.com/docs/authentication/email-password)
- [Admin plugin](https://better-auth.com/docs/plugins/admin)
- [Hooks](https://better-auth.com/docs/concepts/hooks)
- [Session management](https://better-auth.com/docs/concepts/session-management)
- [Rate limiting](https://better-auth.com/docs/concepts/rate-limit)
- [Security reference](https://better-auth.com/docs/reference/security)
