# KAUL-220 - Require exact validated source before image publication

Status: CLOSED - accepted, integrated and exact-source CI verified. Owner: Records worker after KAUL-219. Lead: Main Astra.
Risk: CRITICAL / SECURITY-SENSITIVE. Priority: P1 release false-green.
Discovery base: 63ba72a1d5eacc24c3cb619cc570f1d8b72c6f05.

At discovery base 63ba72a, the tag workflow checked only ancestry of main before publishing GHCR. It did not require a successful exact-source Validate run or execute strict audit. This permitted publication despite a mandatory red gate, contrary to MILESTONES.

Scope: require successful trusted exact-commit full validation before publication and rerun the current strict dependency audit before registry login/publication. Fail closed for absent, pending, failed, wrong-source or untrusted validation. Preserve current approved release lineage unless evidence requires narrowing. Add deterministic gate tests; no live tag, release, registry publication, policy bypass or dependency changes.

Worker self-check, Main review, independent security review, focused and GitHub workflow regressions are required before acceptance and candidate integration. Real release execution remains an owner-only gate.
Worker c542076 was accepted after Main complete-diff review and independent Astra review, then integrated as 5968550. Worker passed 53 gate/release/audit contracts and static checks; independent Astra passed 50 gate/audit cases. Run 33959074626 on that exact commit passed 692 unit, 224 PostgreSQL and 44 browser tests; the mandatory audit remains correctly red. The real release workflow was not invoked: no tag, registry login or publication was authorized. See KAUL-220-implementation.md for exact trust checks and historical-workflow limits.
