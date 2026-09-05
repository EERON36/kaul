# KAUL-225 - Classify repeated-signing browser request-capture failure

Status: CLOSED (verification) - classified, reviewed, integrated and full updated candidate validation completed. Owner: Signing verification worker. Lead: Main Astra.
Risk: test-only investigation of a security-sensitive workflow. Classified as test instrumentation; no product defect established.
Discovery base: 3a93122515350570e176c08a97620d404d38fd57.

## Evidence and scope

The existing Journal stale-save/repeated-signing browser test reached the successful signing notice, but its listener did not populate `signingRequest`; the assertion failed before replay and duplicate-outcome assertions ran. The QA environment used a disposable PostgreSQL database and Next webpack development server. Earlier Linux candidate CI passed all 44 browser tests.

Determine whether this is request-capture instrumentation, test-environment behavior or evidence of a signing defect. Capture only sanitized transport metadata; do not persist session headers or request payloads. Preserve existing failed evidence. Signing production code may not change without evidence and a dedicated review.

KAUL-215 covers a historical Docker API/local E2E failure and does not classify this specific successful-sign/capture failure. KAUL-219 concerns Monthly Report uncertain-transaction recovery, not this Journal test. This verification task does not close either historical limitation by implication.

## Acceptance

Provide a reproducible diagnosis and focused runtime evidence. If correcting test instrumentation, preserve genuine repeated-request/single-signature assertions and prove the intended replay executes. Main review and relevant browser/integration regressions are required; any security-sensitive source behavior change additionally requires Red-Team review.

## Diagnosis and accepted delta

Main and fresh independent review classify the failure as request-capture instrumentation mismatch. The original listener required a `next-action` header, but the reproduced successful sign was a native multipart navigation POST without that header. The pinned Next 16.3.2 implementation supports both native and hydrated fetch transports. No signing product defect was established and no production signing source changed.

The corrected test waits for the actual first POST to the exact review URL. Actual native replay returned HTML 404 because the signed draft is no longer available to the review page; hydrated Action replay returned RSC 200. Both required the exact safe signing conflict, exactly one signed entry and an unchanged full signed row. Payloads and narrow replay headers remain in memory only.

Worker proved both transports and all nine existing Journal browser tests passed. Focused ESLint, typecheck and diff check passed. Main reviewed the complete diff; a separate independent review found no actionable issue and confirmed that replay proof is preserved and strengthened. Reviewed test blob: `7074635af0e8c835a1dc040351fc95c0f9f1a5e9`. Worker commit `67167cc` integrated as `a7c1b00` with identical blob. The exact candidate validation was the final closure gate and is recorded below.

Two preliminary attempts failed before capture at the original immediate overflow assertion; they are not replay passes. A temporary hydration diagnostic and transport logging were removed after proving the cause. Prior failed evidence remains preserved locally. KAUL-215 historical environment cause remains open.

Primary references: [Next updating data](https://nextjs.org/docs/app/getting-started/updating-data), [Next forms](https://nextjs.org/docs/app/guides/forms), [Playwright Request](https://playwright.dev/docs/api/class-request). Exact native/fetch behavior is established by installed pinned source plus the executed tests, rather than documentation alone.

## Final closure

Main accepts and closes this ticket after integrated mobile QA, 22 relevant local browser passes and [full updated candidate validation](https://github.com/EERON36/kaul/actions/runs/33995335426): 752 unit, 224 PostgreSQL and 49 browser passes, with only the already-known mandatory audit blocker. [Complete mobile acceptance](MOBILE_REMEDIATION.md) records the evidence and remaining physical-phone boundary.
