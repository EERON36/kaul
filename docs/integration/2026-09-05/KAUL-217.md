# KAUL-217 - Block unapproved raw profile mutation

Status: CLOSED - accepted, integrated and exact-source CI verified. Owner: Sol. Lead: Main Astra.
Risk: CRITICAL / SECURITY-SENSITIVE. Priority: P2.
Discovery base: 63ba72a1d5eacc24c3cb619cc570f1d8b72c6f05.

## Evidence and scope

The following finding describes discovery base 63ba72a before correction.

Pinned Better Auth 1.6.25 accepts core name changes through the mounted update-user route, bypassing Kaul account controls. A fictional in-memory router reproduction changed a Staff professional name even with forced password change and expired temporary credentials. Signed Journal and Monthly Report snapshots use that name; stable user identity remains intact.

Block the unapproved raw update-user route and the confirmed raw revoke-session, revoke-sessions and revoke-other-sessions routes that bypass the durable Kaul logout path. Cover ordinary Staff, Administrator, forced-change and expired-temporary-credential contexts, trailing slash and approved authentication flow preservation. No account redesign or dependency changes.

## Acceptance and execution gates

Worker implementation and self-check, Main full-diff review, focused tests and surrounding regressions, independent Astra Red-Team delta review, acceptance, candidate integration and exact-head GitHub CI are required. No authorization, organisation/client scope, audit ordering, privacy or generic error protections may be weakened. Dependency audit remains a separate mandatory blocker. No live operations or protected-branch changes are authorized.

Worker commit e737676 was reviewed by Main and independent Astra, then integrated as 5e6f399. Only route-policy.ts and route-policy.test.ts changed. The actual pinned Better Auth memory adapter exercises four identity states and all four blocked mutations, preserving professional names and sessions while session lookup remains available. Direct/trailing-slash route cases and existing controlled logout/password-change flows remain covered.

Worker: 32 route tests and 57 surrounding authentication tests passed; full typecheck, focused lint/format and diff check passed. Independent Astra: 64 tests across five files passed, verified mounted policy and UI logout path, no actionable findings. Main reviewed complete source/test diff and exact accepted blobs. GitHub run 33959074626 at integrated 5968550 passed all 692 unit, 224 PostgreSQL and 44 browser tests; only mandatory audit failed. Fixture router tests are memory-only, not PostgreSQL authentication workflow proof; full CI supplies the separate existing database/browser regressions. No dependency or auth schema changed.
