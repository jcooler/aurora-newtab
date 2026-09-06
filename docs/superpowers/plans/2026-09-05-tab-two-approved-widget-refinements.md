# Tab Two approved widget refinements implementation plan

> Execute inline with superpowers:executing-plans. The owner prohibits subagents. The rendered designs were explicitly approved on September 5, 2026.

**Goal:** Implement the approved presentation refinements for ten widgets, shared stack controls, and subscribed Account & Sync without changing provider or storage contracts.

**Architecture:** Keep existing React components, TierFrame dimensions, intrinsic free-canvas presentations, data owners, and action handlers. Extract only the Metrics active-day interval calculation into a small presentation helper. Use existing theme variables and scoped styles.

**Tech stack:** React, TypeScript, Tailwind/CSS, Vitest, installed-extension Chromium QA.

**Approved design:** `C:/Users/SickT/Documents/Codex/2026-09-05/continue-tab-two-paid-mvp-delivery/outputs/ui-studio/REVIEW.md`, `index.html`, `studio.js`, `studio.css`, and native-size captures in that directory. Baseline source: `3769b9995279c95139c52fd28a844532b473894d`.

## Constraints

- Existing worktree `D:/DEV/Chrome plugin-aurora-2`, branch `feat/aurora-2-observatory`; preserve all existing artifacts and untracked evidence.
- Protected original remains clean at `eb1354b6a5b041fb6d494655c3dae1862572bc51`.
- Compact 216 × 132, Standard 320 × 200, Full 460 × 284; retain each widget's supported tiers and dock/free semantics.
- Preserve separate Calendar authorities, named-layout geometry, manual stacks, all free capabilities, credentials, permissions, provider requests, and existing account actions.
- Clock, Greeting, and Quote remain intrinsic. No automatic layout changes, scrolling widget bodies, new dependencies, or Fitness activation.
- Production account export remains enabled by the completed Task 7; no hosted mutations in this UI pass.
- The remaining 28 identities retain their current presentation. This approval is not new visual acceptance for those identities.
- Test meaningful changed behavior first; verify styling in actual Chromium. Do not repeat green unrelated implementation or review. Run one final composed stabilization cycle, then only affected reruns needed for genuine failures.

## 1. Metrics and Calendar semantics

Files: `src/newtab/widgets/metrics/MetricsWidget.tsx`, `activityIntervals.ts`, their tests, `src/newtab/widgets/calendar/CalendarWidget.tsx`, its tests, and `src/newtab/index.css`.

- [ ] Add failing interval tests: multiple categories on one date count once; zero days stay zero; 7/30/90/365 ranges use 1/5/7/28-day intervals with an exact short final interval.
- [ ] Implement `activityIntervals(summary: MetricSummary)` returning `{ start, end, dayCount, activeDays }[]`, using existing contiguous local-date summaries. Reuse the same active-day predicate for the headline and chart.
- [ ] Replace category-height charts with binary Compact markers and focusable labeled interval bars. Full categories move below the chart. Preserve retry, retained history, comparisons, export routes, and range controls.
- [ ] Preserve Calendar Agenda/Month selection and month generation. Give titles priority, use localized time-only labels for events under a day heading, preserve all-day and multi-day information in accessible labels, and keep date markers separate from date numerals.
- [ ] Run focused Metrics/Calendar tests. Confirm behavior changes with literal date/count fixtures rather than CSS implementation assertions.

## 2. Weather and remaining approved widgets

Files: `src/newtab/widgets/weather/WeatherWidget.tsx`, `github/GithubWidget.tsx`, `links/LinksWidget.tsx`, `clocks/WorldClocks.tsx`, `countdown/CountdownLine.tsx`, `jira/JiraWidget.tsx`, `sentry/SentryWidget.tsx`, `glance/OnThisDayWidget.tsx`, related behavior tests, and scoped styles.

- [ ] Weather: separate high/low and readable forecast, keep alerts/details/cache behavior, use existing hourly and environmental data only.
- [ ] GitHub: widen Compact to twelve weeks while keeping existing selected views and range-consistent totals. Preserve the existing Full annual graph.
- [ ] Quick Links: retain destinations, paging, add/edit, drag, favicons; improve six-item spacing and labels.
- [ ] World Clocks: framed rows show weekday and offset from the current local timezone; cover half-hour offsets and midnight/DST cases. Preserve 12/24-hour preference and intrinsic free presentation.
- [ ] Countdown: emphasize the existing nearest-event day count with a localized date. Preserve Today, calendar-day arithmetic, dock, and intrinsic free presentation.
- [ ] Jira/Sentry: title-led work rows, subordinate metadata, readable severity/impact and existing details/actions.
- [ ] On This Day: featured story/year with restrained secondary events and source attribution; no synthetic story data in production.
- [ ] Run existing affected suites plus narrow new tests for changed date/range behavior.

## 3. Stack controls and subscriber Account & Sync

Files: `src/newtab/canvas/StackCard.tsx`, `src/settings/sections/AccountSync.tsx`, their tests, and scoped styles.

- [ ] Reduce resting stack-control weight, reveal arrows on hover/focus, retain touch targets, keyboard/swipe/drag/manual selection and saved state.
- [ ] Show subscriber membership and Manage billing before alternative plans. Put existing plans behind a keyboard-native disclosure; retain signed-out/trial/cancelled/past-due handling and every billing handler.
- [ ] Verify disclosure, focus, billing actions, stack keyboard navigation, and current state preservation with existing component suites and focused interaction tests.

## 4. Actual extension rendering and stabilization

- [ ] Build and inspect changed widgets at supported native sizes, long content, empty/loading/error/retained states, alternate themes, desktop, 1408 × 445 short window, and touch. Use synthetic fixtures and existing exact extension harnesses; write fresh evidence without deleting retained artifacts.
- [ ] Inspect real screenshots and interactions; address Important findings in one bounded review/fix cycle. Record manual ceilings honestly.
- [ ] Run TypeScript, the unit suite, required script contracts, and exact production/preview builds. Commit the runtime candidate so exact provenance checks can address its immutable source.
- [ ] Run `npm run qa:paid-mvp-stabilization -- --exact`; the runner defers owner-assisted production authentication by default. No hosted QA scripts or live-provider authorizations are implied.
- [ ] Update STATUS, ROADMAP, DECISIONS, UI QA report, and cumulative owner checklist with actual evidence and approval. Commit final documentation, push the feature branch, and prove local/upstream/remote equality plus protected-path preservation.
- [ ] Keep merge, packaging, release, rollout, OAuth publication, live Stripe, infrastructure, provider verification, and all Chrome Web Store actions separately gated.
