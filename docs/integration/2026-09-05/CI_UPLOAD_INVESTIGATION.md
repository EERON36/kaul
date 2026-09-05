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