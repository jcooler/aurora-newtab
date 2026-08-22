# Aurora Flow Implementation Plan

**Goal:** Implement the owner-approved Flow mode as one persisted, cross-tab
timer session and one immersive photo-forward screen containing only the
user's current focus sentence, the timer, and the top unchecked task.

**Architecture:** One `TimerSessionProvider`, mounted once around Aurora's App,
owns the `timerSession` subscription, absolute-deadline reconciliation, and
atomic timer writes. The dashboard Timer and the mutually exclusive Flow
screen consume that same authority; neither owns a second reducer, interval,
or storage subscription. Flow renders the existing Background with its photo
controls suppressed, but does not mount the canvas, docks, layout/edit chrome,
Settings, tray, or palette. Focus and Tasks continue to use their existing
top-level keys and reducers. Schema v15 adds only `timerSession`; connector,
layout, Notes, permission, CSP, dependency, and Store boundaries do not move.

**Visual direction:** Flow is Aurora's photograph turned into a quiet work
field, not a black modal or another widget card. The focus sentence is the
thesis, the timer is the only dominant form, the phase/progress line encodes
real state, and the current task sits as one restrained next action. Existing
photo ink and accent tokens carry every color so bright pink, light, dark, and
custom widget surfaces remain valid. The one signature gesture is the timer's
thin horizon rail: elapsed time advances across the photograph while all
other dashboard furniture is absent. Motion is limited to that stateful rail
and is disabled by `prefers-reduced-motion`.

**Governing specs:**

- `docs/superpowers/specs/2026-08-21-aurora-flow-design.md`
- `docs/superpowers/specs/2026-08-21-aurora-continuous-delivery-roadmap-design.md`
- `docs/superpowers/specs/2026-08-17-aurora-named-layouts-live-canvas-design.md`

**Packet boundary:** Program B / Flow only. Do not implement soundscapes, tab
stash, Flow history, widget stacks, Weather enrichment, new widgets or
connectors, manifest permissions, dependencies, release packaging, or any
Chrome Web Store action. Do not modify the protected original checkout.

**Process:** Every production or QA-harness behavior begins with an observed
focused RED. Keep commits bounded by the tasks below. Request one bounded
implementation review after Tasks 1-5, apply at most one confirmed
Critical/Important fix cycle, then run one stabilized full gate and push.

## Product decisions fixed by this plan

1. `timerSession: null` is the canonical idle, non-Flow state. A paused timer,
   a running timer, or any Flow state uses the full stored shape.
2. Entering Flow is one atomic action: it sets `flow: true` and starts or
   resumes the current phase. If the timer is already running, its exact
   `endsAt` is preserved. Pausing inside Flow proves `flow` is independent of
   `running`.
3. Ending Flow changes only `flow` and leaves mode, deadline, remaining time,
   and cycles untouched. If that produces the canonical idle/non-Flow state,
   it normalizes back to `null`.
4. Absolute `endsAt` is authoritative. Rendering derives remaining time
   locally; storage is written only for user actions and phase transitions,
   never every 500ms. An overdue work phase becomes a running break; an
   overdue break becomes canonical idle work. No negative countdown appears.
5. One provider may exist per browser tab, but one provider is the sole timer
   owner within that tab. Cross-tab writes serialize through the existing
   `AuroraStorage.update` authority and subscriptions distribute the result.
6. The first unchecked item in the first Todo list is Flow's current task.
   Checking it uses `todoReducer(toggleItem)` against fresh storage, promoting
   the next unchecked item in that same list. If none exists, no task block is
   rendered.
7. Flow entry closes the shared dialog stack first. A persistence-backed close
   guard may veto entry; Flow never strands a hidden dialog beneath it.
8. Escape and End flow set only `timerSession.flow = false`. Ctrl/Cmd+Shift+E
   is ignored while Flow is active. No `layout` or `layouts` write is legal.
9. The v14 -> v15 step is identity because `timerSession` is a new top-level
   key supplied by the defaults merge. Per the approved Flow spec,
   `METADATA_ONLY_FLOOR` advances to 15; the full v14 migration/verification
   path materializes `timerSession: null` atomically while proving every prior
   user value, including legacy and named layouts, remains exact.

## Task 0: Checkpoint this just-in-time plan

**Files:**

- Create: `docs/superpowers/plans/2026-08-21-aurora-flow-implementation.md`
- Modify: `docs/superpowers/aurora-2/STATUS.md`
- Modify: `docs/superpowers/aurora-2/ROADMAP.md`

- [x] Verify the active branch is clean at the pushed Program A checkpoint and
  the protected checkout is clean at its required hash.
- [x] Add Flow as the current bounded packet in the ledgers, run placeholder
  and diff-hygiene scans, then commit:

```powershell
git add docs/superpowers/plans/2026-08-21-aurora-flow-implementation.md docs/superpowers/aurora-2/STATUS.md docs/superpowers/aurora-2/ROADMAP.md
git commit -m "docs: approve the Aurora Flow implementation plan"
```

## Task 1: Add schema v15 and the pure persisted session model

**Files:**

- Modify: `src/lib/storage/schema.ts`
- Modify: `src/lib/storage/migrations.ts`
- Modify: `src/lib/storage/index.ts`
- Modify: `src/lib/storage/migrations.test.ts`
- Modify: `src/lib/storage/index.test.ts`
- Modify: `src/lib/backup.ts`
- Modify: `src/lib/backup.test.ts`
- Modify: `src/privacy/dataFlows.ts`
- Modify: `src/privacy/dataFlows.test.ts`
- Create: `src/newtab/widgets/timer/timerSession.ts`
- Create: `src/newtab/widgets/timer/timerSession.test.ts`

- [ ] **RED - storage contract:** Add tests requiring `CURRENT_VERSION === 15`,
  `defaults().timerSession === null`, an identity `migrations[14]`, exact v14
  migration with `timerSession: null`, floor-15 live initialization with
  atomic verification/rollback, strict backup acceptance/rejection for the
  complete TimerSession shape, backup round-trip, and exhaustive privacy-key
  classification. Run the focused storage/backup/privacy set and record the
  failures before changing production.
- [ ] Implement `TimerSession` exactly as the approved spec defines, add the
  top-level key/default, v14 identity step, floor change, backup validator, and
  local-only included privacy row. Never alter connector redaction or existing
  migration semantics.
- [ ] **RED - pure timer model:** Add pure tests for null idle materialization,
  start/pause/resume/reset, exact running reload from `endsAt`, paused reload
  from `remainingMs`, work-to-break and break-to-idle overdue recovery, cycles,
  Flow entry preserving a running deadline, Flow entry starting a paused/idle
  phase, Flow exit preserving timer state, paused Flow, and null normalization.
- [ ] Implement the model by adapting the existing pure `timerReducer`; do not
  read clocks or storage inside model functions and do not persist
  `justFinished`.
- [ ] Run focused GREEN, TypeScript, and diff hygiene. Commit:

```powershell
git add src/lib/storage src/lib/backup.ts src/lib/backup.test.ts src/privacy src/newtab/widgets/timer/timerSession.ts src/newtab/widgets/timer/timerSession.test.ts
git commit -m "feat(flow): persist the timer session contract"
```

## Task 2: Establish one timer authority and cut over the dashboard Timer

**Files:**

- Create: `src/newtab/widgets/timer/TimerSessionProvider.tsx`
- Create: `src/newtab/widgets/timer/TimerSessionProvider.test.tsx`
- Modify: `src/newtab/widgets/timer/TimerWidget.tsx`
- Modify: `src/newtab/widgets/timer/TimerWidget.test.tsx`
- Modify: `src/newtab/App.tsx`
- Modify: `src/newtab/App.test.tsx`

- [ ] **RED - authority:** Add provider tests proving hydration from null,
  derived countdown without per-tick writes, one write at a crossed deadline,
  atomic actions against fresh stored state, subscription-driven cross-context
  updates, and one provider-owned clock regardless of how many consumers read
  the context.
- [ ] Implement the single provider with `useStoredKey('timerSession')`,
  `useStoredKey('timerConfig')`, one `useNow(500)`, and serialized
  `storage.update('timerSession', ...)` transitions. Expose hydrated session,
  live remaining time, progress, start/pause/reset, enter/exit Flow, and phase
  completion feedback. Do not mount another timer reducer in a consumer.
- [ ] **RED - Timer cutover:** Update TimerWidget tests to require restored
  running/paused sessions, dashboard controls writing `timerSession`, existing
  panel/tray behavior and config controls unchanged, and a `Start flow` primary
  action that first closes the dialog stack and then atomically enters Flow.
- [ ] Replace TimerWidget's local reducer/ticker with the shared controller.
  Keep its accessible pill, panel geometry, utility-tray presentation, chime,
  flash, announcement, and config contract unless the persisted authority
  structurally supersedes them.
- [ ] Mount the provider exactly once around App and add an App regression that
  the Timer widget and App read one shared controller rather than two owners.
- [ ] Run focused GREEN, TypeScript, and diff hygiene. Commit:

```powershell
git add src/newtab/widgets/timer src/newtab/App.tsx src/newtab/App.test.tsx
git commit -m "feat(flow): give the timer one cross-tab authority"
```

## Task 3: Build the immersive Flow screen and dashboard switch

**Files:**

- Create: `src/newtab/flow/FlowScreen.tsx`
- Create: `src/newtab/flow/FlowScreen.test.tsx`
- Modify: `src/newtab/components/Background.tsx`
- Modify: `src/newtab/components/Background.test.tsx`
- Modify: `src/newtab/App.tsx`
- Modify: `src/newtab/App.test.tsx`
- Modify: `src/newtab/index.css` only for Flow-specific responsive tokens that
  cannot be expressed truthfully with existing utilities

- [ ] **RED - Flow content:** Add component tests for today's existing mantra,
  the empty mantra input writing the same `focus` key, stale-focus handling,
  the first unchecked task, accurate remaining count, atomic task completion
  and promotion, and no task husk when absent.
- [ ] **RED - Flow controls:** Require a large accurate timer, named work/break
  phase, progress rail, Pause/Resume, End flow, Escape through the shared stack,
  focus entry, visible focus indicators, and reduced-motion-safe classes.
- [ ] Implement the restrained photo-field composition using the existing
  display/body fonts, `text-photo`, `--canvas-fg`, `--canvas-fg-muted`, and
  `--accent`. Do not add a generic opaque card, hard-code for black widgets,
  or create new color settings.
- [ ] **RED - Background boundary:** Prove Flow can retain the photograph while
  suppressing the change-photo control. Add the smallest explicit Background
  prop and preserve default behavior byte-for-byte.
- [ ] **RED - App switch:** Add integration tests that stored `flow: true`
  renders Background plus FlowScreen but no canvas surface, widget, dock,
  layout badge, settings gear, tray, palette, or photo button; Ctrl/Cmd+Shift+E
  is ignored; End/Escape restores the exact dashboard; timer state continues;
  and the complete interaction write log contains no `layout` or `layouts`.
- [ ] Implement the mutually exclusive App branch. All existing dashboard
  hooks may remain mounted only if they perform no hidden presentation work;
  no dashboard component or second timer consumer may mount beneath Flow.
- [ ] Run focused GREEN, accessibility-oriented queries, TypeScript, and diff
  hygiene. Commit:

```powershell
git add src/newtab/flow src/newtab/components/Background.tsx src/newtab/components/Background.test.tsx src/newtab/App.tsx src/newtab/App.test.tsx src/newtab/index.css
git commit -m "feat(flow): clear the dashboard down to the work"
```

## Task 4: Prove cross-tab continuity and extend scratch-only Chromium QA

**Files:**

- Modify: `scripts/qa-nl-p6-scenarios.mjs`
- Modify: `scripts/qa-nl-p6.mjs`
- Modify: `scripts/qa-nl-p6-window.mjs`
- Modify: `scripts/preview-information-first.test.mjs`
- Create: `docs/superpowers/reports/FLOW-QA.md`

- [ ] **RED - harness contract:** Extend the Node contract test to require a
  sixth `flow` storage scenario, Flow-aware product readiness/invariants, an
  ignored edit chord rather than a missing-session false failure, and explicit
  no-layout-write checks. Observe failure before changing the drivers.
- [ ] Seed Flow with a long-running absolute deadline, today's focus sentence,
  and at least two unchecked tasks. Make the matrix wait for either the normal
  canvas or `[data-flow-screen]`; keep existing scenarios' assertions exact.
- [ ] At every existing viewport capture Flow in its normal state and after the
  attempted edit chord. Assert the screen is present and bounded, the timer and
  exit control are reachable, the canvas/docks/fixed controls remain absent,
  no horizontal overflow exists, and no storage write occurs merely because
  the screen rendered.
- [ ] Extend the real-window witness at exact 1408x445 with Flow entry/exit and
  dashboard restoration. Add a real second new-tab page assertion that both
  tabs show the same mode/deadline and displayed countdown within one second;
  pause in one and observe the other update.
- [ ] Run the focused Node contract GREEN. Build `dist` from the implementation
  commit, then run the sweep and window witness only into `.qa-flow-*` scratch
  output. Inspect Flow at 599x800, 720x900, 1024x600, 1408x445, 1600x900,
  1920x550, and 3440x1440 at original resolution. Record exact evidence and
  honest manual ceilings in `FLOW-QA.md`; do not replace accepted NL-P6 files.
- [ ] Commit:

```powershell
git add scripts/qa-nl-p6-scenarios.mjs scripts/qa-nl-p6.mjs scripts/qa-nl-p6-window.mjs scripts/preview-information-first.test.mjs docs/superpowers/reports/FLOW-QA.md
git commit -m "test(flow): prove the immersive session in Chromium"
```

## Task 5: Bounded review, stabilization, and checkpoint

**Files:**

- Modify only confirmed Critical/Important review findings in the one allowed
  fix cycle.
- Modify: `README.md`
- Modify: `docs/superpowers/aurora-2/STATUS.md`
- Modify: `docs/superpowers/aurora-2/ROADMAP.md`
- Modify: `docs/superpowers/aurora-2/DECISIONS.md`
- Modify: this plan's checkboxes

- [ ] Request one independent review of the complete Flow implementation for:
  schema/migration/backup/privacy exactness; one timer owner; serialized
  cross-tab behavior; stale hydration; phase rollover; dialog-stack entry;
  mantra/task source ownership; complete dashboard suppression/restoration;
  accessibility; responsive visual quality; zero layout writes; QA honesty;
  frozen boundaries; and Store/protected-checkout safety.
- [ ] If the review finds Critical/Important defects, add focused RED tests,
  apply one bounded fix commit, and request one rereview. Ledger Minors; do not
  start a second review cycle.
- [ ] Run the stabilized gate once after review fixes:

```powershell
npm test -- --reporter=dot
npx tsc --noEmit
npm run test:information-first-contract
node --test scripts/qa-nl-p6-output.test.mjs
npm run build
git diff --check
```

  Treat any React `act(...)` warning as a failed gate. Re-run only a focused
  causal family if this gate finds a test-only drift; do not churn the full
  suite.
- [ ] Rebuild `dist` from the exact reviewed source before any owner-facing
  check. Confirm no production preview bridge and no new manifest permission,
  dependency, connector contract, or Store artifact.
- [ ] Update README and ledgers with exact commits, counts, browser evidence,
  review disposition, and manual ceilings. Record the Flow decision without
  reopening the approved design. Commit and push:

```powershell
git add README.md docs/superpowers
git commit -m "docs: checkpoint Aurora Flow"
git push origin feat/aurora-2-observatory
```

- [ ] Prove active `HEAD` equals upstream with a clean worktree. Prove the
  protected original remains clean on `main` at
  `eb1354b6a5b041fb6d494655c3dae1862572bc51`. Then proceed directly to the
  widget-stacks just-in-time plan.

## Definition of done

Flow is complete when one persisted timer survives a genuinely new tab,
renders one accurate countdown in either dashboard or Flow, transitions phases
without negative time, and remains paused/running independently from the Flow
flag; the immersive screen shows only today's mantra, timer, and first
unchecked task over Aurora's photograph; task/focus edits use existing sources;
Done/Escape restore the dashboard exactly; the edit chord and all dashboard
chrome are absent during Flow; layout data is never written; schema v15,
migration, backup, privacy, unit, cross-tab, short-height, real-window, review,
build, checkpoint, push, and both-repository proofs are green; and no deferred
feature or Store action entered the packet.

## Plan self-review

- Every production file is preceded by a named observed-RED step.
- The one-authority design prevents the Timer and Flow screen from owning
  parallel reducers or tickers.
- Visual choices derive from Aurora's photograph, existing ink tokens, and
  real session state; no generic dashboard/modal decoration was added.
- Cross-tab, short-height, exact 1408x445, write-log, backup, and migration
  acceptance criteria each have a direct test or Chromium witness.
- Soundscapes, tab stash, history, stacks, Weather, connector expansion,
  permissions, dependencies, release packaging, and Store mutations are
  explicitly outside the packet.
