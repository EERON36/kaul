# Mobile remediation acceptance - 6 September 2026

Main Astra accepts the bounded mobile source delta. No new P1/P2 mobile regression was established in the exercised automated scope. Physical-phone behavior remains unverified.

## Candidate and tickets

Executable source: `f60cb6776e72a24bc7ba4c60872ac566cc503695`. The first complete updated candidate checkpoint is `80c00a381459b9b71eff70578704ab99bda832fc`; documentation closure may advance the branch tip without changing executable files. Resolve Draft PR #46 and its exact-head checks for the current SHA. The former frozen `3a931225` is superseded.

- [KAUL-223](KAUL-223.md) CLOSED: Journal date/time grid and narrow panel padding preserve the complete enlarged native controls, with normal desktop layout and unchanged saved event-time semantics.
- [KAUL-224](KAUL-224.md) CLOSED: the unchanged result section follows search; creation remains available afterward. Search scope and authorization are unchanged.
- [KAUL-225](KAUL-225.md) CLOSED (verification): the failed capture assumed hydrated fetch transport. Both native and hydrated actual-request replays now prove the safe conflict, single signed entry and unchanged signed row. No production signing defect was established.

Worker self-check, Main full-diff review, causal red/green responsive tests and affected full browser regressions passed before acceptance. Fresh independent review found no actionable issue and no product security-behavior change. It independently scrutinized the signing test proof; no production signing/authorization/immutability change required an additional security gate. Main separately reviewed final test-only settling and screenshot-output adjustments. Accepted worker commits were integrated without conflict and matching source blobs were verified.

## Integrated validation

[Full updated candidate run 33995335426](https://github.com/EERON36/kaul/actions/runs/33995335426) at 80c00a3 passed 752 unit tests, 224 PostgreSQL tests and all 49 browser tests. Formatting, lint, typecheck, production build, Prisma generation, committed migrations/conversion rehearsals, real scanner/readiness, ingress/firewall and actual combined backup/isolated restore passed. Only the unchanged mandatory dependency audit failed. KAUL-209 remains WAIT FOR UPSTREAM; no audit policy, dependency, lockfile, schema or migration changed.

The local integrated rerun used an archived copy of source f60cb67: all 280 compared tracked application, Prisma, browser-test, package and Next configuration files matched the candidate's SHA-256 hashes. Its 22 relevant existing/new browser checks passed: shell 3, Client search 4, Documents 1, Journal responsive 4, Journal workflow 9 and Monthly Reports 1.

The broader local walkthrough and follow-ups passed:

- 179 screen/mode observations across login/navigation, Administrator/Staff Home, Client search/context, Journal draft/review/signed/correction/history, Monthly Report draft/review/signed/replacement, and Documents error/upload/history/list/archive states. The 360 × 800, 390 × 844 and 430 × 932 matrix and 200% root-text cases showed zero page overflow or measured offscreen element offenders. Landscape 844 × 390 and 125%/150% text checks also ran. Main inspected representative screenshots, including complete native date/time controls in new and correction drafts.
- Real Chromium tab zoom at 125%, 150% and 200% was checked separately from text enlargement. Settled 200% search and Journal checks proved exact effective 360 × 800, 390 × 844 and 430 × 932 dimensions, root font 16 px and pixel ratio 2. Native viewport captures confirmed visible date/time and picker controls. One earlier search measurement raced the resize and was excluded from exact-width acceptance; a polling-based follow-up passed all six search/Journal cases. Initial full-page zoom screenshots clipped their capture area, so the final zoom visual evidence uses native viewport captures rather than those images.
- Touch-profile file selection, upload, download, archive/read-only and denied states passed. Documents source was not changed. Native physical pickers, on-screen keyboards, Safari/WebKit, browser chrome and real phones remain outside this automated evidence.

The supplemental walkthrough comprised three passing tests plus one passing settled-zoom confirmation. Main's acceptance is scoped to tested Chromium rendering and emulated touch; it is not a physical-device or full accessibility certification.

## Safe resource disposition and remaining gates

The recreated task database `kaul_test_mobile_qa_20260905_01` was dropped through the repository guard; the separately existing normal `kaul` database remains. New task Documents storage was disposed by each original owner closure. The exact labeled QA scanner had no mounts and was stopped/removed after exclusive-ID/label verification. Task browser contexts and server were stopped; port 3147 has no listener. Shared PostgreSQL remains running.

The old `C:/Users/EERON/AppData/Local/Temp/kaul-documents-e2e-mobile_qa_20260905_01` remains retained. Its lost original ownership closure cannot be reconstructed from a current marker. No weaker cleanup was performed. See the separate [storage disposition](MOBILE_STORAGE_DISPOSITION.md).

The [three-step physical-phone smoke test](MOBILE_PHONE_SMOKE.md) is prepared for the separately authorized owner/brother-testing phase. KAUL-207/215 historical environment limitations and KAUL-214 owner activation remain distinct. No main merge, Pilot/live modification, deployment, live migration, real secret/key operation or live Documents/scanner/storage change occurred.

Evidence method references: [Chromium tab zoom](https://developer.chrome.com/docs/extensions/reference/api/tabs#method-setZoom), [Playwright extension testing](https://playwright.dev/docs/chrome-extensions), [native viewport screenshot capture](https://chromedevtools.github.io/devtools-protocol/tot/Page/#method-captureScreenshot). Local measurements and images, rather than these API descriptions, establish the reported rendering outcomes.
