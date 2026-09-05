# KAUL-222 - Complete quiesced Documents backup and isolated restore tooling

Status: IN PROGRESS. Owner: Sol. Lead: Main Astra.
Risk: CRITICAL / SECURITY-SENSITIVE. Priority: P1 activation prerequisite.
Discovery base: 63ba72a1d5eacc24c3cb619cc570f1d8b72c6f05.

Current Pilot commands back up and restore PostgreSQL only. The strict object manifest verifier is a component, not backup-set orchestration. Restore-check currently mounts active Documents storage. These cannot satisfy ADR 0004 combined activation gates.

## Bounded scope

Add explicit locked backup/validate/restore Documents-set commands using existing validated environment, pinned Restic and database lifecycle guards. Require confirmed stopped Kaul and Caddy before a set is captured. Compare immutable storage with database metadata, bind exact PostgreSQL and object-only snapshot IDs to application SHA/migrations/object digests in a strict manifest, validate before completion and keep services stopped. Preserve historical DB-only commands and preconversion backups.

Restore requires a new guarded restore database and a precreated empty isolated root. Select only manifest exact snapshot IDs; reject missing/orphan/corrupt/nonregular objects and metadata mismatch. Never restore quarantine, overwrite an existing database/root, use active storage in the private restore checker, or perform cleanup. Add secret-free separate restore-root wiring.

Extend disposable Linux PostgreSQL/append-only Restic rehearsal for actual manifest-bound capture and isolated restore. Prove failure paths and exact restored metadata/object comparison; authorised/denied download evidence must be explicit and may use the existing guarded integration seam. Do not label the original DB-only rehearsal combined proof.

Worker self-check, Main full-diff review, independent security review, focused tests and exact-head GitHub CI required before acceptance. Main owns shared board/runbook. KAUL-221 owns scanner topology/readiness/startup; coordinate overlapping operator code. No dependency/schema/migration/security-policy or live infrastructure changes.