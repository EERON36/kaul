# Independent Astra reviews — 5 September 2026

These are bounded source reviews by a fresh Astra context that did not plan, implement, manage or integrate the reviewed work. Main Astra assessed and accepted the findings. They do not replace executed runtime validation or the final combined-candidate gate.

## KAUL-205 diagnostic publication

Baseline: 82bf2987189a029516b7e6221f600af931827522. Published diagnostic commit: de079f5180167d987896866c5d54a0de11dff582, Draft PR #45, run 33949791534.

Result: ACCEPT diagnostic-only publication; no blocking leakage, artifact-scope or false-green finding. Fixed stage/retry labels, bounded HTTP status and six allowlisted public codes are the only response evidence retained. The workflow uploads only the named diagnostic JSON glob for seven days. Original assertions remain, with explicit HTTP 201 checks added.

The reviewer executed 17 adversarial in-memory sanitizer cases, all passing. Main/worker evidence separately includes 13 sanitizer/filesystem tests and five existing upload route/client tests. A P3 finding about diagnostic writes masking the original browser exception or truncating earlier evidence was accepted and fixed with best-effort failure-path writing and atomic replacement. The reviewer rechecked the exact correction and accepted it before publication.

Reviewed final SHA-256 hashes:

- .github/workflows/validate.yml: BA3921377400E68E511D520B60C4504D43567A354736671F868F9C470827095A
- e2e/documents.spec.ts: D4042BD270D7A370D488442F13158FE1D5D2BF5A9BE10FBF9AAB67DF0342422B
- src/test/document-upload-diagnostic.ts: B29AA6DCBDEBF065637C0B9E6D528140D90AB6EB4D6C9965238E85D5EB0C6945
- src/test/document-upload-diagnostic.test.ts: 876650D741DBCFAB38E238CB92456101B5956F9EB6CA2F9536F8113E9D624068

Limits: artifact production and the failure cause were unverified at review. A public service-unavailable response alone cannot distinguish scanner from storage failure. Early runner termination can prevent diagnostic collection. Review does not approve runtime changes or the final candidate.

## KAUL-202, KAUL-203 and KAUL-204

Reviewed HEAD: 2d3c0a81f73bfd77255f2e54fa2acd23ad4534b5. The nine critical source/test files below were confirmed identical to 90f1eb3. Complete critical changes from 82bf298 through 27df04e were inspected with surrounding authorization, audit, Client mutation locking, filesystem handles and schema/migration constraints.

Result: ACCEPT retained security changes for integration; no blocking finding.

- Reports revalidate the actor and apply Organisation, Assignment and Client-lifecycle restrictions in payload queries. Archived drafts remain excluded and authorized signed history remains readable. Replacement retries reopen only the direct unsigned child; locking, unique constraints and lineage triggers prevent branching.
- Documents metadata repeats Client access predicates. Downloads verify the opened handle, reauthorize under the shared Client lock and commit success audit evidence before releasing it. Denial records failure; ambiguous transaction errors do not fabricate definitive failure. The outer failure path closes the handle.
- Test storage ignores ambient runtime roots, validates the task ID, creates a fresh task directory and checks canonical path, directory identity and ownership marker before deletion. Existing or replaced paths are preserved; retry setup recreates the required adapter subdirectories.

The reviewer inspected the real PostgreSQL revocation tests and the download test's actual lock-wait evidence. Direct SQL guard tests require the specific integrity error and roll back even when a guard regresses. git diff --check 82bf298..HEAD passed.

Coverage:

- src/modules/reports/monthly-report-internal.ts
- src/modules/reports/monthly-report.integration.test.ts
- src/modules/reports/monthly-report.test-support.ts
- src/modules/documents/documents-internal.ts
- src/modules/documents/documents.integration.test.ts
- src/test/document-test-storage.ts
- src/test/document-test-storage.test.ts
- playwright.config.ts
- e2e/documents.spec.ts

Limits: the reviewer did not run database, browser, build or filesystem-writing tests. The fresh 215 PostgreSQL passes and static/build results are lead-owned evidence. Audit transport ambiguity is supported by source review but not a new direct fault-injection regression. Ownership checks do not protect against a hostile same-user process racing path replacement. Whole-candidate browser and final independent review remain open.