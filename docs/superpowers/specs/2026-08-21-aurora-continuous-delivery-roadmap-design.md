# Aurora Continuous Delivery Roadmap - Design

**Status:** Owner approved in chat on 2026-08-21. The owner explicitly
authorized back-to-back execution without routine continuation prompts.

**Extends:**

- `2026-08-17-aurora-named-layouts-live-canvas-design.md`
- `2026-08-19-aurora-widget-stacks-design.md`
- `2026-08-21-aurora-flow-design.md`

**Supersedes:** The stale sequencing language that still describes PR-P6 as
reopened or NL-P5 as the current packet. It does not supersede any frozen
storage, privacy, connector, permission, recovery, CSP, dependency, protected
checkout, or Store boundary.

## 1. Objective

Continue from the accepted named-layouts baseline and deliver Aurora as a
stable product that can grow from its current 26 widget identities and nine
connectors into a much broader dashboard without sacrificing user-owned
placement, recovery, privacy, accessibility, or visual quality.

The work is deliberately split into independently testable programs. No one
implementation plan may combine them into a single broad rewrite.

## 2. Governing laws

1. The user owns placement; the system owns safety. Nothing auto-swaps,
   guesses, or reflows an authored layout.
2. The owner may intentionally fill the screen with widgets. The accepted
   NL-P6 F9 density ruling remains unchanged.
3. Flow, stacks, Weather enrichment, and connector expansion each use one
   just-in-time plan and one bounded review/fix cycle.
4. Every production behavior starts with an observed focused failing test.
5. Owner-facing visual evidence is generated from `dist` rebuilt from the
   exact reviewed commit.
6. Chrome Web Store upload, field edits, saves, submission, publication,
   distribution, and rollout remain blocked until a new action-specific
   W6-P5 approval.
7. `D:\DEV\Chrome plugin` remains read-only at
   `eb1354b6a5b041fb6d494655c3dae1862572bc51`.
8. Accepted evidence is immutable provenance. A new QA run writes to an
   ignored scratch directory unless an explicit judgment pass intentionally
   replaces the canonical artifact.

## 3. Delivery sequence

### Program A - Baseline stabilization

Close the accepted NL-P6 baseline before adding new stateful systems.

- Reconcile `STATUS.md`, `ROADMAP.md`, `DECISIONS.md`, and README with the live
  named-layout product and the owner's F9 ruling.
- Remove current React test warning noise without changing product behavior.
- Give the Node-only information-first contract an explicit npm command.
- Run one stabilized unit, type, production-build, and real-Chromium gate.
- Rebuild `dist` from the reviewed checkpoint. Do not stage a Store upload.

### Program B - Flow

Implement the approved Flow spec before stacks. Flow is more contained and
first establishes the persisted cross-tab timer authority that the product
already lacks.

1. Persist and recover `timerSession` with schema, migration, and backup
   coverage.
2. Move timer ownership from component-local state to the stored session
   without creating multiple tickers or data owners.
3. Add the Flow screen: mantra, timer, and top unchecked task.
4. Prove cross-tab continuity, exact dashboard restoration, phase rollover,
   and zero layout writes.

### Program C - Widget stacks

Implement the approved manual-stack spec after Flow.

1. Add the optional stack document model, strict cleaning, and pure edit
   operations.
2. Render one content-tight anchored card that reserves its tallest member.
3. Add manual arrows, dots, keyboard paging, and the 40px swipe experiment.
4. Add 500ms hold-to-stack creation, reorder, remove, dissolve, and one-entry
   undo semantics in live edit mode.
5. Extend the short-height and narrow-floor Chromium matrix with saved and
   reloaded stacks.

Smart surfacing and docked stacks remain deferred. No stack changes face
without an explicit user action.

### Program D - Weather enrichment

Keep air quality, UV, and pollen as Weather facts, not separate widgets.

1. Write a provider and permission design before implementation. Air quality
   and UV are the first deliverable. Pollen ships only with truthful
   geographic availability and an explicit unavailable state.
2. Use expanded Weather whitespace for useful readings and explanations.
3. Keep Compact and Docked Weather concise and preserve the approved time,
   wind, sunrise, and sunset conventions.
4. Re-run Weather corner, expansion, permission, cache identity, request-race,
   and short-height witnesses.

### Program E - Expansion platform

Make additions repeatable before adding dozens of identities.

- Store a durable candidate catalog with user value, source, authentication,
  permissions, privacy, cache/freshness, settings, tiers, dock behavior,
  empty/error states, and maintenance risk.
- Add a documented scaffold and executable contract checks for registry
  identity, migration, backup redaction, origin ownership, settings state,
  tier completeness, no-whitespace behavior, and Chromium catalog coverage.
- Keep one data owner per identity and the existing provider-direct model.

### Program F - Addition waves

Each wave receives its own spec, plan, TDD cycle, catalog, Chromium evidence,
and checkpoint.

1. **Browser-native:** Reading List, Recently Closed, Downloads, and Tab
   Groups, subject to exact Chrome API and permission review.
2. **Work:** Linear, Sentry, and Todoist.
3. **At a glance:** On This Day, public holidays, severe weather, and
   aurora/Kp forecast.
4. **Broader integrations:** Notion, Slack, and Spotify after their OAuth,
   scope, and privacy costs are accepted in their own designs.

Stocks remain intentionally deferred. The current Crypto widget stays in
scope and unchanged unless a later owner decision reopens markets.

## 4. Release strategy

`cb6c4db` is the source baseline for this program, not an upload candidate.
Program A creates a trustworthy checkpoint. Programs B through F advance the
feature branch in bounded packets. A final release-restaging packet runs only
after the chosen feature waves stabilize, so Aurora does not repeatedly build
and discard Store packages while active feature work continues.

No Store action is implied by a local ZIP, screenshot, dossier, or clean gate.

## 5. Test and review contract

Every packet follows this order:

1. Write only that packet's implementation plan.
2. Observe a focused RED before each production change.
3. Reach focused GREEN and type cleanliness.
4. Request one independent bounded review.
5. Apply at most one confirmed-finding fix cycle and rereview.
6. Run one stabilized full unit, production build, and applicable Chromium
   gate.
7. Update ledgers, commit, push, and prove active/protected repository state.
8. Continue directly to the next packet unless blocked by missing authority,
   external credentials, required manual hardware evidence, or W6-P5.

## 6. Deferred features

- Smart stack surfacing
- Docked stacks
- Flow soundscapes
- Flow tab stash
- Flow history and analytics
- Stocks and portfolio tracking
- Integrations whose provider terms, OAuth model, or data-use boundaries have
  not been verified

Deferred means sequenced later, not silently discarded.
