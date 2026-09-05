# KAUL-205 — GitHub upload investigation

## Baseline and first diagnostic reproduction

The original PR #44 source 82bf2987189a029516b7e6221f600af931827522 failed initial Documents upload in both attempts of run 33919394787. Local Astra browser passes did not explain that failure.

A diagnostic-only branch retained that exact source and added sanitized response evidence without changing upload runtime, ClamAV requirements, quarantine, storage or original assertions. Fresh independent Astra accepted publication and a diagnostic-write resilience correction.

- Diagnostic SHA: de079f5180167d987896866c5d54a0de11dff582.
- Draft PR: https://github.com/EERON36/kaul/pull/45.
- Run: https://github.com/EERON36/kaul/actions/runs/33949791534.
- Result: FAILURE. Formatting, lint, typecheck, 583 unit tests across 71 files, 197 PostgreSQL tests across 19 files, both migration rehearsals and build passed. Firewall, ingress and backup rehearsal jobs passed. Browser result: 43 passed, one failed with two retries. Audit was skipped after browser failure.

All three bounded artifact files report the same result:

```json
{
  "stage": "initial-upload",
  "httpStatus": 503,
  "applicationCode": "DOCUMENT_SERVICE_UNAVAILABLE"
}
```

This reproduces the original upload-stage failure on GitHub and rules out merely missing Swedish success text. It does not distinguish scanner health/freshness/protocol failures from storage failure. The next diagnostic must make that distinction using restricted fictional CI evidence. No root cause or fix is claimed yet.

The downloaded seven-day GitHub artifacts are preserved in the diagnostic worktree's ignored tmp/kaul-205-ci-33949791534 directory. Attempt-one artifact SHA-256: D9B45AEF8B3EAC002086A18952D754291F9CD997E4D7ED008E311BDB7B6E8F30. No arbitrary response body, trace, credential, identifier, private path or uploaded file contents are included in this durable report.
## Unified checkpoints

Run 33950802108 at 13fced974c863921a44fb1cd027925c4fabddf88 passed 618 units across 73 files, 215 PostgreSQL tests across 19 files, migrations, static/build checks and the three operational rehearsal jobs. It failed the same initial upload with 503 / DOCUMENT_SERVICE_UNAVAILABLE on all three attempts; 43 other browser cases passed. The retained owned-storage and scanner-timer changes therefore did not resolve the actual GitHub failure.

Run 33951288543 at 734fa0b06a9401eb18bbeca7852c034cb37a4338 passed 622 units across 74 files and 215 PostgreSQL tests across 19 files. Both enhanced Client-edit browser cases passed, including failed-save values and narrow-viewport dirty cancel/navigation/repeated saves. The browser result remained 43 passed and the same one Documents upload failure. Audit was skipped after failure; the unchanged local audit still fails on known upstream findings.

## Service probe and collector correction

Diagnostic-only commit 09b33d06426771e0e36c17ee2a1ae9a3540a82b5 produced a bounded service artifact in run 33951215750. Storage write, validation and open passed. Scanner connection, VERSION response and raw INSTREAM response passed. SCANNER_SIGNATURE_FRESHNESS failed; actual SCANNER_ADAPTER_SCAN did not pass, and promotion did not occur. This narrows the issue to signature acceptance but does not distinguish stale, future-dated and malformed timestamps.

That run also exposed a diagnostic-only import regression: the E2E collector imported the service probe, which imports server-only production modules. Browser collection failed before executing tests. This is separate from the already reproduced application upload failure; the service artifact is retained and no browser pass is claimed for this run.

Correction 0e62b6b496eb3bbfe950251ca72b6a926db20525 moves directory inspection into a pure Node/test-environment helper and adds only fixed timestamp classifications. Twenty-two focused tests, default-Node import smoke, real Playwright test collection, lint, typecheck, formatting and diff check passed. Fresh independent Astra accepted the exact correction. Run 33951865295 is the next measurement; its result is pending at this checkpoint.

The large one-off service probe stays on PR #45's original diagnostic baseline. It is not integrated into the active candidate. Any eventual CI readiness fix will be a separate minimal change, with fresh review and actual GitHub validation, preserving the pinned scanner image and production freshness policy.
## Timestamp classification and remediation decision

Run 33951865295 at 0e62b6b496eb3bbfe950251ca72b6a926db20525 collected and executed the browser suite successfully, then reproduced the same initial upload 503 on all three attempts (43 other browser tests passed). The preflight artifact classified the signature timestamp as STALE. Storage write/validation/open, scanner connection/VERSION and raw INSTREAM passed; the actual adapter did not pass signature acceptance, and promotion was withheld.

The first upload failure reported root/objects/quarantine directories all present. Later retries on the original diagnostic baseline reported them absent, consistent with its separate ambient-root cleanup problem. The active candidate already retains the reviewed owned test-storage lifecycle; that does not repair stale scanner definitions.

Exact-image inspection found that the pinned image is preloaded, its entrypoint can start clamd from those definitions while freshclam runs in the background, and its health command checks PING/PONG rather than Kaul's signature-age requirement. This is consistent with the official [ClamAV Docker documentation](https://docs.clamav.net/manual/Installing/Docker.html). The measured mismatch is therefore a healthy service according to its reachability probe but signatures rejected by Kaul's unchanged 24-hour policy.

Selected remediation: a separate minimal CI-only change will disable competing background updates, run one bounded explicit FreshClam update, and verify readiness through the actual ClamAvDocumentScanner before browser validation. The pinned image, production scanner policy, quarantine and public 503 behavior remain unchanged. Closure still requires refreshed signatures and successful real GitHub upload/browser execution; implementation and paired before/after validation are in progress.
## Paired resolution and closure

The reviewed four-file CI fix is worker commit 3ce63cc8563d294958564963c133a11aa65fd21b, integrated into the candidate as dc29c03023cc2d138d3a71702cd4021230ca5361 and the original diagnostic baseline as 0e413522cf6383a6f9d4e8d96d0fdf480f81abe5. No production scanner, image, dependency, schema, freshness threshold or quarantine rule changed.

[Diagnostic run 33952919474](https://github.com/EERON36/kaul/actions/runs/33952919474) at 0e41352 passed explicit refresh and actual adapter readiness, 598 units across 73 files, 197 PostgreSQL tests across 19 files, and all 44 browser tests in 2.5 minutes. Formatting, lint, typecheck, migration rehearsals, build and all three operational rehearsal jobs passed. Its only failing stage was the unchanged audit.

[Unified run 33952908177](https://github.com/EERON36/kaul/actions/runs/33952908177) at dc29c03 independently passed explicit refresh and actual adapter readiness, 628 units across 75 files, 215 PostgreSQL tests across 19 files, and all 44 browser tests in 3.5 minutes. The static, migration, build and operational rehearsal stages also passed. Audit ran and failed on the same documented deepmerge-ts/mysql2 advisories; overall CI therefore remains FAILURE.

The fixed labels DOCUMENT_SCANNER_REFRESHED and DOCUMENT_SCANNER_READY were emitted by actual successful steps in both runs. Failure-artifact upload was correctly skipped because browsers passed; this is not evidence that the audit passed. The diagnostic-only preflight is not present in the unified source, so candidate success does not depend on it.

Main Astra closes KAUL-205: the measured GitHub failure was stale preloaded signatures accepted by container reachability health but rejected by Kaul's unchanged freshness policy. Explicit foreground update plus production-adapter readiness resolves the actual upload on the original baseline and the unified candidate. The exact reason the former background updater had not supplied fresh definitions was not established; CDN rate limiting is not asserted. Owned-storage retry repair remains a separate accepted fix. This closure does not grant release or live deployment approval.
