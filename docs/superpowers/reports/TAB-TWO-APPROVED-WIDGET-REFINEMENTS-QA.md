# Tab Two approved widget refinements QA

**Date:** 2026-09-05<br>
**Result:** AUTOMATED_PASS_OWNER_QA_PENDING<br>
**Branch:** feat/aurora-2-observatory<br>
**UI runtime source:** 661c633ec93a5499b70d0f5f04d174e86d983191<br>
**Final exact stabilization source:** 86a963fb1626e416c02afe0653559e54f2787710

The owner approved the complete rendered widget prototypes on September 5, 2026. This packet implements those ten widget identities, shared stack controls, and subscribed Account & Sync in the existing worktree. The final stabilization source differs from the UI runtime source only in two Calendar QA waits and a deterministic crypto test. The final documentation checkpoint preserves that exact runtime tree.

## Delivered presentation

| Surface | Result |
|---|---|
| Calendar | Compact gives one event its title space. Standard preserves Agenda/Month selection. Full places a complete top-aligned month beside the readable agenda. Normal rows cap at three; long content uses two; Standard also uses two across several days. Localized visible times retain full source/date/end information in accessible labels. Arrow/Home/End switching restores focus after saved preferences settle. All-day spans retain the inclusive last day. |
| Weather | Temperature leads, high/low are separate, and forecast text has room to wrap. Full uses six hourly slots plus supporting measurements. Details, alerts, stale cache, and environmental details retain their existing actions. |
| Metrics | Headline and chart both describe active days. Multiple categories on one date count once. The 7/30/90/365-day ranges use exact 1/5/7/28-day intervals, including the short last interval. Compact uses daily markers; larger bars expose exact interval labels to keyboard users. Full category summaries remain available. Empty, loading, error, locked, and retained states fit. |
| GitHub | Contribution history fills the available graph width, with trailing 84/182/365-day framed views and matching totals. Month labels keep adequate separation; Full work items are title-led. GitLab's shared graph defaults remain intact. |
| Quick Links | Six stacked links use three columns and two rows, with readable labels, cached favicons, and initial fallbacks. Paging, editing, adding, and drag behavior are retained. |
| World Clocks | Framed rows add the weekday and offset relative to the local timezone, including DST and fractional offsets. Five configured clocks fit Full. |
| Countdown | The nearest event leads with its day count, name, and localized date. Calendar-day arithmetic and Today behavior remain unchanged. |
| Jira and Sentry | Titles lead and metadata supports them. Jira shows one/two/three items across tiers. Sentry keeps the leading issue in Compact and two/three rows in Standard/Full, including long titles. Diagnostic context remains accessible. |
| On This Day | A featured year and story lead, with two events in Standard and three in Full. Birth/death context and source attribution remain available. |
| Stack controls | Resting dots are quieter; arrows appear on hover/focus and remain available for touch. Initial shelf geometry is settled before paint. Manual selection, keyboard, swipe, drag, and persistence retain their authority. |
| Account & Sync | Subscribers see membership and Manage billing first. Existing alternative plans sit behind a native disclosure. Encrypted sync precedes account-data export; existing billing, sync, verification, export, and deletion handlers are preserved. |

The ten identities are ics, weather, metrics, github, links, worldClocks, countdown, jira, sentry, and onThisDay. The other 28 widget identities retain their accepted presentation. Intrinsic free Clock, Greeting, Quote, World Clocks, Countdown, and Links stay intrinsic. Named layouts, TierFrame dimensions, explicit placement, manual stacks, independent Calendar data authorities, and all existing free capabilities remain intact. No runtime dependency, browser permission, hosted object, provider grant, or release artifact was added.

## Native rendered evidence

The review gallery contains 156 distinct native widget/state cases plus two Account & Sync captures. They use actual installed-extension Chromium, bounded synthetic fixtures, and unchanged Compact/Standard/Full frame dimensions at a 1408 × 445 viewport. Coverage includes normal and long content, empty states, dark/light/blue themes, Calendar four/five/six-week months, keyboard view switching, all Metrics ranges and lifecycle states, five World Clocks, and stack pointer/keyboard/touch interaction. Later focused runs use headed Chromium and touch simulation. Original-resolution captures were inspected; geometry alone was not treated as visual acceptance.

Capture provenance is per case, preserving the already-green evidence:

- 89f88c22ebaebfda203ba34ddafbad4d7a5ab689 / 2026-09-06T01-35-39.578Z: retained native cases before the harness reached an outdated Countdown-empty expectation. Its initial Metrics-empty fixture was superseded by a truly empty fixture.
- 680947c94d6a06109913f1e7204363f37fd5f367 / 2026-09-06T01-38-24.056Z: 55 passing headed/touch cases covering Calendar, Sentry, five World Clocks, Countdown, and Account disclosure.
- 661c633ec93a5499b70d0f5f04d174e86d983191 / 2026-09-06T01-51-06.448Z: 15 passing headed/touch Metrics empty/loading/error/locked/retained cases. Compact empty/error/locked and Full retained were inspected after the final state-layout correction.

These directories are under artifacts/qa-approved-widget-refinements/. The gallery overlays only the latest evidence for each case. Retained native sets have zero unexpected requests, console errors, page errors, document overflow, or escaped controls. No owner or customer data was used. A separate Chromium pass verified all 158 gallery images load and both filters work with no page/console errors.

## Verification and corrections

| Gate | Result |
|---|---|
| Whole repository unit suite at final exact source | 280 files / 4,443 tests PASS |
| Final Calendar QA contracts | 12 tests PASS |
| Deterministic provider crypto test | 5 tests PASS, also included in the full unit pass |
| Final documentation, composed-gate, portability and support contracts | 28 tests PASS |
| TypeScript and exact production/preview/account-local builds | PASS through final specialist builds |
| Composed stabilization | 12 automated specialists PASS; production account authentication DEFERRED_OWNER_QA |
| Final composed request/write/error ledger | {"requests":16,"storageWrites":18,"consoleErrors":0,"pageErrors":0,"failedRequests":0} |

The composed evidence is artifacts/qa-paid-mvp-stabilization/86a963fb1626e416c02afe0653559e54f2787710/evidence.json. Google Calendar retained 13 final captures and Microsoft Calendar retained 14, with zero unexpected requests, console errors, or page errors. Their revised Full compositions were inspected. The standard exact invocation and its continuation use the repository's unchanged matrix and final validator. Screenshot gates paused for personal inspection; the same retained captures were judged and remaining specialists resumed without recapturing completed candidate evidence. The final exact-source cycle followed genuine failures in the changed Calendar harness; earlier incomplete attempts remain preserved.

The bounded visual review corrected clipped Sentry density without reducing the approved two/three rows, an ineffective Compact Metrics state selector, Weather temperature specificity, and stack shelf placement. Calendar provider QA now waits for the fully composed fixture day before counting its three visible rows, then opens the date context to verify every Google/Microsoft/ICS fixture event. This preserves provider-composition coverage despite the approved visible row cap.

The final full test rerun exposed a preexisting nondeterministic test: replacing a random ciphertext's final character with A occasionally changed nothing. The test now always changes its first character to a different canonical character. No encryption implementation or hosted state changed.

One final Google attempt completed the composed-content assertions before Chromium closed during its screenshot call. The failed attempt was retained under artifacts/qa-approved-widget-refinements/86a963fb1626e416c02afe0653559e54f2787710/google-browser-closed-attempt. Only the affected specialist was rerun before the matrix continued; no completed specialist was repeated for this interruption.

## Known historical limitation

An exploratory sweep of 49 script-test files reported 298/310 PASS, with 12 failures in the historical qa-shared-frame-p2.test.mjs planner: "SF-P2 has no family for framed widget metrics". The same planner, test, supporting P1 script, and size contracts are unchanged from baseline 3769b9995279c95139c52fd28a844532b473894d; invoking it with that baseline's size contracts reproduces the failure. This is recorded historical harness debt. Current widget and Metrics specialists pass independently in the final composed matrix. Do not describe the exploratory sweep as wholly green or expand this UI packet into a historical harness rewrite. The existing large-chunk build advisory also remains.

## Remaining owner and publication boundaries

The cumulative checklist in TAB-TWO-PAID-MVP-DEFERRED-OWNER-QA.md now includes these approved refinements. Stable Chrome, real account/provider consent, real assistive technology, the owner's MacBook and mixed-DPI setup, native downloads, and final visual acceptance on actual layouts remain owner witnesses. This packet does not claim a fresh visual approval of all 38 identities or proven superiority over every competitor.

Data-portability Task 7 remains hosted and verified at its prior evidence source. Production account export remains enabled; this UI packet performed no hosted mutation. Monitored support, provider verification, Supabase Pro, live Stripe, merge, packaging, release, rollout, OAuth publication, and every Chrome Web Store action remain separate approvals. Fitness remains on hold.
