# KAUL-222 - Complete quiesced Documents backup and isolated restore tooling

Status: CLOSED. Owners: Sol (operator), Records worker (real rehearsal). Lead: Main Astra.
Risk: CRITICAL / SECURITY-SENSITIVE. Priority: P1 activation prerequisite.
Discovery base: 63ba72a1d5eacc24c3cb619cc570f1d8b72c6f05.

At discovery base 63ba72a, Pilot commands backed up and restored PostgreSQL only. The strict object manifest verifier was a component, not backup-set orchestration. Restore-check mounted active Documents storage. These did not satisfy ADR 0004 combined activation gates.

## Bounded scope

Add explicit locked backup/validate/restore Documents-set commands using existing validated environment, pinned Restic and database lifecycle guards. Require confirmed stopped Kaul and Caddy before a set is captured. Compare immutable storage with database metadata, bind exact PostgreSQL and object-only snapshot IDs to application SHA/migrations/object digests in a strict manifest, validate before completion and keep services stopped. Preserve historical DB-only commands and preconversion backups.

Restore requires a new guarded restore database and a precreated empty isolated root. Select only manifest exact snapshot IDs; reject missing/orphan/corrupt/nonregular objects and metadata mismatch. Never restore quarantine, overwrite an existing database/root, use active storage in the private restore checker, or perform cleanup. Add secret-free separate restore-root wiring.

Extend disposable Linux PostgreSQL/append-only Restic rehearsal for actual manifest-bound capture and isolated restore. Prove failure paths and exact restored metadata/object comparison; authorised/denied download evidence must be explicit and may use the existing guarded integration seam. Do not label the original DB-only rehearsal combined proof.

Worker self-check, Main full-diff review, independent security review, focused tests and exact-head GitHub CI required before acceptance. Main owns shared board/runbook. KAUL-221 owns scanner topology/readiness/startup; coordinate overlapping operator code. No dependency/schema/migration/security-policy or live infrastructure changes.
## Implementation and reviewed integration

Main staged and committed the independently reviewed worker deltas under standing
candidate-development authority. Operator worker commit `4c63452` integrated as
`c778ad1`; rehearsal worker `08c165f` integrated as `91a6352`. The only conflicts
were the operation-lock command list and its test: the resolution preserves all
KAUL-221 scanner/readiness commands and all KAUL-222 recovery commands.
Independent Astra inspected and accepted the exact combined operator/test blobs.

The completed source adds guarded quiesce, combined capture/validation/restore,
strict metadata and catalog parsing, actual object hashes, isolated restore-root
wiring, and Node 24 plus actual Restic authentication before an outage. Database
archive streaming has separate temporary-resource cleanup so it cannot erase
in-progress set metadata. The Documents schema selects combined capture even
with zero rows; this avoids an online first-upload race. Standalone capture
records the selected declared recovery image; internal pre-change capture uses
the current image when available. Neither is represented as proof of last writer.

Worker checks passed: core 17, Documents operator 13, adjacent core/Restic/private
restore 30, static operator 3, syntax/format/diff checks. Independent Astra ran
core 17, Documents operator 13 and rehearsal adapter 27. Main reran adapter 27,
integrated core/static 20 and the merged lock-list check. These operator tests
use deterministic stubs; they do not prove a Restic/database restore.

The independent review found and corrected one rehearsal adapter rejection of
the real base-file-only pg_dump child. Its regression reproduced the failure;
the exact command now passes through to real Docker without broadening other
fixture operations.

Exact-source [CI 33962083930](https://github.com/EERON36/kaul/actions/runs/33962083930)
at `91a635264619cf8c57cced853edf3a3dfa48968c` failed during validation.
The existing backup rehearsal passed. The new rehearsal failed before migrations
because its internal-only PostgreSQL network did not expose the requested
loopback port. Unit tests passed 751 cases and failed one global source-contract
assertion on the authentication-only `snapshots --latest 1` option; no restore
selected `latest`. PostgreSQL/browser suites were not run in this attempt.
Both bounded corrections were reviewed and integrated: worker a5715e8 became
ddce48d; worker c200c0e became 0173710. The auth-only listing no longer uses the
unnecessary option; only the temporary CI PostgreSQL fixture receives an extra
bridge, with its explicit loopback binding retained. No valid test or production
network policy was weakened.
## Completed runtime evidence and acceptance

[Run 33962467276](https://github.com/EERON36/kaul/actions/runs/33962467276) at
`01737101e91596bc599fd556f0698084dbd06cf1` passed 752 unit tests in 78 files,
224 PostgreSQL tests in 19 files and all 44 browser tests. Static/build,
migration/conversion, real scanner/readiness and every operational rehearsal
passed. Only unchanged mandatory dependency audit failed.

[Backup job 101296619437](https://github.com/EERON36/kaul/actions/runs/33962467276/job/101296619437)
executed both rehearsals. The new one applied all ten reviewed migrations,
seeded two immutable Documents versions, captured and validated the exact set,
and restored a new `kaul_restore_ci_backup_documents` database and isolated root.
Actual Prisma reported ten migrations and up-to-date schema. Two authorised byte
downloads and four denied domain downloads passed, with durable SUCCEEDED audit
before bytes and no file opens for denial. UID1000 EACCES probes proved read-only
permissions on three directories and two files. Final metadata/digest comparison
and quarantine exclusion passed.

The ephemeral CI manifest was
`778a84b4db67cbad865abee11e7c1c076c4861784948ec2f5f1dd065f3caac34`.
This is evidence identity, never a live restore instruction. The unpublished
image revision/status seam, fictional upload scan and permission-level read-only
checks do not prove published-image packaging, actual bind-mount behavior, live
scanner persistence or owner-host/key recovery. Those remain attended gates.

Independent Astra separately read the runtime logs, confirmed exact source
identity and the retained KAUL-217-221 boundaries, and recommended closure with
no additional actionable repository issue. Main accepts and closes KAUL-222.
KAUL-209 strict audit remains an external mandatory merge/release blocker.
No live service, database, storage, key, network or protected Git change occurred.