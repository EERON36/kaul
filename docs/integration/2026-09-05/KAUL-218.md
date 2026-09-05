# KAUL-218 - Enforce Documents scanner freshness ceiling

Status: CLOSED - accepted, integrated and exact-source CI verified. Owner: Main Astra. Lead: Main Astra.
Risk: CRITICAL / SECURITY-SENSITIVE. Priority: P2.
Discovery base: 63ba72a1d5eacc24c3cb619cc570f1d8b72c6f05.

## Evidence and scope

The following finding describes discovery base 63ba72a before correction.

Configuration accepts signature ages through 168 hours although SECURITY and ADR 0004 require at most 24 hours. Executed parser and fake-protocol scanner evidence accepts 48-hour signatures when configured to 72. Default 24 remains safe.

Reject configuration above 24 hours and prove boundary, stale and unavailable scanner handling. Preserve stricter operator choices and fail-closed upload behavior. No scanner deployment or storage change.

## Acceptance and execution gates

Worker implementation and self-check, Main full-diff review, focused tests and surrounding regressions, independent Astra Red-Team delta review, acceptance, candidate integration and exact-head GitHub CI are required. No authorization, organisation/client scope, audit ordering, privacy or generic error protections may be weakened. Dependency audit remains a separate mandatory blocker. No live operations or protected-branch changes are authorized.

Four new over-ceiling parser cases failed against unchanged source. The sole production correction is max(168) to max(24). Seven parser cases prove allowed stricter positive values and rejection beyond 24; three loopback cases prove exact threshold acceptance and rejection before payload consumption.

Main implementation/self-check: 68 surrounding Documents tests across ten files passed after supplying the unchanged generated Prisma client; typecheck, focused lint/Prettier and diff check passed. Independent Astra: 20 focused tests and an additional parsed 12-hour loopback boundary check passed; exact three blobs accepted with no findings. Worker commit 435bc22 integrated as 54b1696. Run 33959074626 at 5968550 passed 692 unit, 224 PostgreSQL and 44 browser tests, including actual scanner upload; only mandatory audit failed. No live scanner configuration changed.
