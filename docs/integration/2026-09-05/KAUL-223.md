# KAUL-223 - Journal date/time reflow under text enlargement

Status: ACCEPTED - integrated; broader candidate QA/CI pending. Owner: Journal mobile worker. Lead: Main Astra.
Risk: MEDIUM (presentation only). Priority: P2.
Discovery base: 3a93122515350570e176c08a97620d404d38fd57.

## Verified finding and bounded scope

Mobile QA reproduced overflowing Journal date/time controls at 360 and 390 CSS pixels with 200% text enlargement. Native input minimum sizing expands the event field grid; date/time picker affordances become clipped. At 430 pixels the controls also escape their fieldset even without page-wide overflow.

Correct only responsive presentation and add focused browser regression coverage. No Journal workflow, signing, immutability, domain, authorization or data changes.

## Acceptance

- Date/time controls remain contained and usable at 360 x 800, 390 x 844 and 430 x 932, including 200% text enlargement; do not hide overflow or suppress enlargement.
- Normal desktop presentation remains usable and date/time values and Journal draft/review behavior remain unchanged.
- Exercise focused regression against the original failure, including control containment rather than document width alone.
- Worker self-check, Main review, responsive and relevant full regressions precede integration. A security-sensitive behavior change requires separate Red-Team review.

Source evidence: the owner-provided completed mobile QA, plus retained local `kaul-mobile-qa.md`, `observations.json`, `supplement-reflow-zoom.json` and `journal-event-text200-390.png` in the 5 September QA artifact directory. Physical-phone behavior remains unverified.

## Reviewed implementation and regression evidence

The change constrains the Journal event grid and native input minimum widths, and reduces horizontal padding only within the narrow Journal draft panel/event fields. A presentation class identifies that panel. Font enlargement is retained; no overflow hiding or date/time/workflow change was introduced. Desktop retains its two-column event layout. The correction editor shares the same panel.

The new regression failed against original source at 360 pixels/200% text when controls escaped their fieldset. Offline original-font checks also reproduced the 390-pixel page overflow and 430-pixel inner-container overflow. Fixed-source browser tests passed all four viewport cases, including the three requested phones at 100%/200% text and desktop, with actual saved values and unchanged review semantics. All nine existing Journal browser tests also passed: 13/13 combined. Main visually inspected the saved 360/200 screenshot and confirmed the complete date/time and both native picker icons.

Focused formatting, lint, full typecheck and diff check passed. Main reviewed the full diff and a fresh independent review found no actionable issue or product security-behavior change. The final test-only screenshot-path adjustment was separately accepted by Main. Worker commit `da6564c` integrated as `f60cb67`. Source blobs `fea0820b49207594ef356075b450791565404fff` and `b12aba35301dc81b63bd9605557164f13b580f50` match independent review; final test blob `bdf958daaf617efe7decbdd2612a17aa976cd856` matches Main acceptance.

An initial nested fixture field was rejected before browser execution and corrected; it is not product failure evidence. No trigger, signing, authorization, Documents, dependency or migration source changed.