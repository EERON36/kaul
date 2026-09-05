# KAUL-224 - Keep Administrator search results near search controls

Status: ACCEPTED - integrated; broader candidate QA/CI pending. Owner: Client mobile worker. Lead: Main Astra.
Risk: MEDIUM (presentation only). Priority: P2.
Discovery base: 3a93122515350570e176c08a97620d404d38fd57.

## Verified finding and bounded scope

After a settled Administrator search, the full client-creation form separates search controls from results by approximately 1,490-1,516 pixels at 360/390/430-pixel phone widths. Results are easy to miss.

Correct only presentation order/proximity and add focused browser coverage. Keep client creation available. Preserve search scope, authorization, form semantics and data behavior; no redesign or extra feature.

## Acceptance

- Search results follow the search interaction in a logically proximate location and remain understandable at 360 x 800, 390 x 844 and 430 x 932, including enlarged text.
- Client creation remains available without burying search output; keyboard order remains logical.
- Desktop behavior and existing search/creation workflows do not regress.
- Worker self-check, Main review, responsive and relevant full regressions precede integration. A security-sensitive behavior change requires separate Red-Team review.

Source evidence: completed mobile QA and retained local `final-checks.json`, `search-after-submit-390.png` and `search-results-separation-390.png`. No authorization/search-scope defect was observed.

## Reviewed implementation and regression evidence

The unchanged Client list section now immediately follows search; the unchanged client-creation form follows results. No state, action, permission, query, data shape or field semantics changed.

The new browser regression failed against original source with a 1,460-pixel search/result gap (40-pixel bound at normal desktop text). Fixed-source Client search suite passed 4/4 tests, including desktop and all three requested phone widths at 100%/200% text, bounded proximity, page reflow, actual Tab order, partly filled creation preservation and successful enlarged-phone creation. A test-only screenshot persistence rerun passed 1/1 and retained seven views. Main inspected the 390-pixel result layout.

Focused Client units passed 26/26; formatting, typecheck and diff check passed. Full lint passed with four existing warnings outside changed files. Main full-diff review and fresh independent review found no actionable issue or product security-behavior change. Main separately accepted the final settling/screenshot test adjustments. Worker commit `e8ee30b` integrated as `b055d6b`. Source blob `bef243b01fe9896cb59e3220d8b1ee650dfe2507`; final browser blob `b58f3da13e8ba4f9259119c946d0d015942f99cf`.

An initial partial-reference fixture query did not match the existing exact-reference search behavior; the fixture was corrected. A stopped baseline server caused one connection-refused attempt. Neither is classified as a product defect. The completed causal red and green runs are separate evidence.