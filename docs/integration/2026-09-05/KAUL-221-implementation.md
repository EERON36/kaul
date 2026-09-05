# KAUL-221 - Scanner update and private startup evidence

Status: Implemented and self-checked; independent review pending.
Risk: CRITICAL / SECURITY-SENSITIVE. Priority: P1 activation prerequisite.
Base: 63ba72a; integrates with the accepted KAUL-218 configuration ceiling.

The scanner previously belonged only to an externally isolated Docker network,
so its normal FreshClam daemon could not refresh signatures. The old update
command started only Kaul with --no-deps and could reopen Caddy without a
working scanner. First activation also needs the distinct Personnummer
conversion and combined backup/restore gates; ordinary update is not that path.

Only the scanner now joins a dedicated update network. No service publishes a
new port and neither PostgreSQL nor Kaul gains external connectivity. The
private scanner has no Documents mount or application credentials. Existing
pinned image, unprivileged identity and persistent signature volume remain.

New protected prepare-scanner and verify-documents commands use the existing
validated environment and operation lock. Startup/update wait for the pinned
scanner; application starts with Caddy stopped, and the real application's
scanner adapter must return CLEAN under the configured freshness ceiling.
A new exclusive quarantine probe verifies storage access without modifying
accepted objects or pre-existing quarantine. Any readiness failure prevents
Caddy startup, and a failed application/Documents check stops Kaul.

Six filesystem/readiness regressions pass. Six focused operator/topology cases
pass, including start/update success ordering, readiness failures and scanner
preparation failure before stopping a healthy application. Full typecheck
passes. Operator tests use fictional process stubs; real-loopback ClamAV and
Linux final candidate CI remain separate checks. No real deployment, network,
storage, keyring, database or scanner configuration was changed.

KAUL-222 owns manifest-bound backup/restore orchestration and separate restore
storage. The final attended runbook must compose both tickets. This delta does
not claim backup completion or satisfy the owner's live gates.

Official contracts checked on 5 September 2026:

- https://docs.docker.com/reference/compose-file/networks/ (internal networks are externally isolated).
- https://docs.clamav.net/manual/Installing/Docker.html (private scanner, persistent definitions and FreshClam behavior).
