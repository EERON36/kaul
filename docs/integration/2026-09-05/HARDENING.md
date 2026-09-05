# Unified candidate hardening - 5 September 2026

Status: repository hardening complete at source 0173710. No meaningful READY
repository ticket remains. Mandatory audit blocks release and deployment.
The execution board is authoritative for exact source and final validation.

## Whole-candidate assessment

Main inspected the integrated lineage and sent independent read-only reviews
across identity/privacy/authorisation and Documents/Reports/Journal/migrations.
The operations worker separately inspected CI, image publication, scanner,
startup, backup/restore and the retained owner guide. Discovery base was
63ba72a1d5eacc24c3cb619cc570f1d8b72c6f05; findings were not assumed to be
regressions introduced by KAUL-202/203/204 or KAUL-216.

Six evidence-backed tickets resulted:

- KAUL-217: raw profile and session mutation routes bypassed Kaul controls.
- KAUL-218: scanner configuration allowed a freshness ceiling above 24 hours.
- KAUL-219: Report recovery classified an unsettled transaction prematurely.
- KAUL-220: release publication lacked an exact validation/current audit gate.
- KAUL-221: scanner refresh isolation and startup readiness were incomplete.
- KAUL-222: combined backup/isolated restore orchestration was missing.

All six have Main and independent Astra acceptance. The initial
application findings were proved with pinned-router memory execution, scanner
protocol/configuration execution and real PostgreSQL fault regressions. Changes
remain bounded to those verified conditions and associated tests. No dependency,
lockfile, schema, migration, ordinary authorisation, privacy or audit policy was
changed. KAUL-222 completed source review, integrated review and real combined
PostgreSQL/Restic restore validation under the same lifecycle.

## Interactions and preserved boundaries

The independent identity review found no additional actionable defect in
Personnummer authenticated encryption, Organisation/Client binding, strict key
parsing, conversion reconciliation, projection exclusion, or central access and
assignment enforcement. The professional name mutation was consequential because
Journal and Monthly Report immutable signer snapshots use that name; KAUL-217
closes the raw route while retaining approved controlled account/logout flows.

The records review found no additional actionable defect in Documents lifecycle,
read/download integrity and revocation, Client/Assignment serialization, report
lineage, or additive structured-Journal migration. KAUL-219 now waits for the
same Client lock before classifying uncertain signing. Its real commit/rollback
waiter tests reject premature FAILED attempts; uniqueness alone is not accepted
as proof. KAUL-216 retains its separate download failure proof unchanged.

The historical Pilot's first six migrations are unchanged. The candidate adds
four reviewed migrations: structured records/reports, Stage-A Personnummer
encryption, Documents and Documents lifecycle protection. Fresh guarded local
hardening_0905 creation applied all ten. GitHub separately rehearses populated
legacy structured-record migration and Personnummer conversion. These do not
prove an uninspected live database is coherent or authorize live migration.

KAUL-221 preserves private service ports, scanner privilege and persistent
signatures; only the scanner gains a dedicated outbound-update network. A
container ping is not Documents readiness. The new actual adapter/storage probe
must succeed before ingress is opened. The old single update command is not the
initial historical-to-unified conversion/activation procedure.

The original backup rehearsal proves PostgreSQL backup/restore and retained-key
fixture behavior. Standalone object-manifest verification is separate. Earlier
board wording calling this combined restore proof was corrected. KAUL-222 now
supplies actual exact-set capture and isolated database/object restore in
CI 33962467276, including restored DocumentVersion metadata comparison, two
authorised byte downloads, four denials, durable audit and UID1000 read-only
permission checks. The unpublished-image/status fixture and fictional upload
scan do not prove image packaging, a live scanner, a read-only bind mount or
the owner's host. Those remain explicit attended gates.

## Strict dependency gate refreshed

Executed npm run audit:ci on 5 September: FAIL, four High package entries,
including aggregate Prisma/config entries. The strict gate and dependency tree
remain unchanged:

- prisma 7.9.1 -> @prisma/config 7.9.1 -> deepmerge-ts 7.1.5.
- prisma 7.9.1 pins mysql2 exactly 3.15.3. Better Auth's tree deduplicates it.
- Registry inspection: stable prisma 7.10.0 still pins mysql2 3.15.3 and
  @prisma/config 7.10.0 still pins deepmerge-ts 7.1.5.
- Prisma's current latest tag resolves to 8.0.0-rc.13, a prerelease. It is not
  an approved remedy. npm's suggested Prisma 6 downgrade is also rejected.

Upstream fixed package versions exist, but the inspected stable Prisma releases
still pin affected versions. No normal compatible update was established that
clears the mandatory gate. KAUL-209 remains WAIT FOR UPSTREAM. Do not suppress,
allow-list, override, downgrade, use a prerelease or rewrite the ORM to clear it.
The assessment is dated; rerun registry/advisory inspection when upstream changes.

Primary advisories:

- [DeepmergeTS recursive-graph exhaustion](https://github.com/advisories/GHSA-ggr8-5vv4-36mx).
- [mysql2 authentication downgrade](https://github.com/advisories/GHSA-3f6p-5ww8-9rcr).
- [mysql2 compressed-protocol exhaustion](https://github.com/advisories/GHSA-rgwj-5xj2-c3m3).

## Local-only work and environmental evidence

A fresh status inventory covered every registered worktree. No missed product
dependency was established beyond the already classified preserved alternatives.
The old owner guide is still local-only and contains obsolete PR43/SHA/snapshot
values; it informs gate ordering, not current live identity. Gate C scratch
scripts, Windows harness proposal, Youth UI experiment, visual alternatives and
modified historical instructions remain preserved. No ignored key-, password-,
dump- or credential-shaped payload was opened. No cleanup occurred.

KAUL-207's broader Windows shell-harness reliability and KAUL-215's historical
Docker/API/E2E failure remain dated environmental evidence. Healthy local
PostgreSQL and 107 integrated domain regressions do not establish that old
failure's cause. Complete GitHub Linux browser evidence is recorded separately.
There is no evidence-backed reason to replay those rejected/local alternatives
or silently claim Windows recovery. The intended homelab runtime is Linux.

## Transition boundary

No live state has been inspected during this phase. Historical Pilot SHA,
image digest, migration count, snapshots, listener state and key custody must be
refreshed in a separately authorized attended session. Existing-host checks are
not first-install host-preflight: that command intentionally rejects an active
Caddy listener. Prove actual Restic authentication in the exact protected
operator context before stopping healthy services.

The [owner-attended transition record](../../../deploy/pilot/UNIFIED_CANDIDATE_ACCEPTANCE.md)
covers release authority, host/network checks, retained-key custody,
migration/conversion order, exact restore commands, scanner persistence/alerts,
controlled startup and browser/stakeholder acceptance. The board and PR identify
the candidate SHA, CI state and mandatory audit blocker. No homelab command, deployment, live key or database
operation is authorized by this engineering report.

## Final engineering validation

[Run 33962467276](https://github.com/EERON36/kaul/actions/runs/33962467276) at
`01737101e91596bc599fd556f0698084dbd06cf1` passed 752 unit tests, 224 PostgreSQL
tests and all 44 browser tests; static checks, production build, all ten
migrations, legacy conversion rehearsals, actual scanner/readiness checks,
firewall/ingress rehearsals and both database-only and combined backup rehearsals
passed. The only failed step was mandatory dependency audit on the same recorded
upstream advisories. No additional source churn is justified by that blocker.

Independent Astra confirmed the combined runtime logs and all reviewed source
identities, finding no additional actionable repository issue. Main accepts the
bounded hardening work. The repository may be held at this reviewed technical
checkpoint while upstream remediation is awaited; it is not release-ready.
Dependency remediation or any later source delta requires proportionate tests
and renewed independent review. Documentation-only closure is recorded on the
candidate branch; resolve its tip for the final documentation SHA.