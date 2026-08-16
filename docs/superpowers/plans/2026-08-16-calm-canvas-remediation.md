# Aurora 2 Calm Canvas Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the stretched Adaptive Stage with the approved photo-forward Calm Canvas while preserving every frozen registry, planner, storage, migration, permission, privacy, and accessibility contract.

**Architecture:** Keep the planner as the sole authority for identity, zone, order, spans, variants, priorities, locks, and Dock disposition. Add an explicit content-flow presentation to `BoardItem`, then render Day, Now, and Work Pulse as content-sized flow grids inside a symmetric overlay composition; Dock keeps its existing finite horizontal ownership. Validate the stable implementation with an inventory-driven packaged-Chromium replay and original-resolution visual inspection.

**Tech Stack:** React 19, TypeScript 5.9, Tailwind CSS 4 plus source CSS, Vitest and Testing Library, Playwright 1.62, Chrome MV3.

**Spec:** `docs/superpowers/specs/2026-08-16-aurora-2-calm-canvas-remediation-design.md`

## Global Constraints

- Do not change storage schema v11, migrations, `LayoutV2`, registry entries, profile thresholds, density tokens, capacity tables, planner output, connector behavior, permissions, secrets, backup content, or external endpoints.
- Do not modify `D:\DEV\Chrome plugin`.
- Do not perform any Chrome Web Store action; W6-P5 remains blocked pending contemporaneous owner approval.
- Write each production behavior from a failing focused test and observe the expected failure before implementation.
- Allow one implementation review and one Critical/Important fix-rereview cycle.
- Run the full unit suite, production/preview builds, and full browser harness only once after implementation and visual acceptance stabilize.

---

### Task 1: Add explicit content-flow placement without weakening planner metadata

**Files:**
- Modify: `src/newtab/components/BoardItem.tsx`
- Modify: `src/newtab/components/BoardItem.test.tsx`
- Modify: `src/newtab/App.tsx`
- Modify: `src/newtab/App.test.tsx`

**Interfaces:**
- Consumes: existing `StageAllocation` and `WidgetRegistryEntry` values.
- Produces: `placement?: 'planned' | 'flow'` on `BoardItem`; `planned` remains the default and `flow` retains finite spans while omitting explicit planner start lines.

- [x] **Step 1: Write the failing component test**

Add a test proving the production change that would break Calm Canvas: a flow item accidentally restoring explicit `colStart` or `rowStart`.

```tsx
it('flows from planner order while retaining its finite planner spans', () => {
  render(
    <BoardItem entry={weather} allocation={allocation()} profile="standard" placement="flow">
      content
    </BoardItem>,
  )
  const item = document.querySelector('[data-block-id="weather"]') as HTMLElement
  expect(item.style.getPropertyValue('--board-col-span')).toBe('2')
  expect(item.style.getPropertyValue('--board-row-span')).toBe('2')
  expect(item.style.gridColumn).toBe('span 2')
  expect(item.style.gridRow).toBe('span 2')
})
```

- [x] **Step 2: Run the focused test and observe RED**

Run: `npm test -- src/newtab/components/BoardItem.test.tsx`

Expected: TypeScript/Vitest fails because `placement` is not a `BoardItem` prop.

- [x] **Step 3: Implement the minimal placement seam**

Add the prop and choose starts only in planned mode:

```tsx
interface BoardItemProps {
  entry: WidgetRegistryEntry
  allocation: StageAllocation
  profile: LayoutProfile
  placement?: 'planned' | 'flow'
  className?: string
  children: ReactNode
}

const gridPlacement = placement === 'flow' || !allocation.rect
  ? { gridColumn: `span ${colSpan}`, gridRow: `span ${rowSpan}` }
  : {
      gridColumn: `${finiteSpan(allocation.rect.colStart)} / span ${colSpan}`,
      gridRow: `${finiteSpan(allocation.rect.rowStart)} / span ${rowSpan}`,
    }
```

Keep Dock sizing and every existing data attribute unchanged.

- [x] **Step 4: Observe component GREEN, then write the failing App integration assertion**

Run: `npm test -- src/newtab/components/BoardItem.test.tsx`

Then add an App test that renders a normal profile and asserts Day, Now, and Pulse item styles use `span N`, while a Dock item remains finite and exactly once.

Run: `npm test -- src/newtab/App.test.tsx -t "flows finite canvas zones"`

Expected: FAIL because `App` still publishes explicit planner start lines.

- [x] **Step 5: Pass flow placement from App and run the focused set**

Pass `placement="flow"` from `App` for non-Dock allocations, then run:

Run: `npm test -- src/newtab/components/BoardItem.test.tsx src/newtab/App.test.tsx`

Expected: both files pass without warnings.

- [x] **Step 6: Commit Task 1**

```text
git add src/newtab/components/BoardItem.tsx src/newtab/components/BoardItem.test.tsx src/newtab/App.tsx src/newtab/App.test.tsx
git commit -m "refactor(stage): add content-flow board placement"
```

### Task 2: Replace the stretched shell with the Calm Canvas composition

**Files:**
- Modify: `src/newtab/index.css`
- Modify: `src/newtab/App.test.tsx`
- Create: `scripts/preview-calm-canvas.mjs`

**Interfaces:**
- Consumes: the `flow` placement seam and existing root `data-stage-profile`, density variables, zone variables, overflow markers, and Dock interaction ownership.
- Produces: symmetric content-sized edge clusters, a viewport-centered Now anchor, and a shrink-wrapped Dock.

- [ ] **Step 1: Write the RED browser composition probe**

Create a one-shot packaged-extension probe with a seeded sparse 1600x900 fixture and owner-like dense 2012x1397 fixture. Its page evaluation returns literal geometry for `main`, Clock, all four zone surfaces, every allocated item, and root overflow. Assert:

```js
assert(Math.abs((clock.left + clock.width / 2) - viewport.width / 2) <= 2,
  `Clock is not viewport-centered: ${JSON.stringify(geometry)}`)
assert(day.height <= dayChildrenBottom - day.top + inset + 1,
  `Day paints below its content: ${JSON.stringify(geometry)}`)
assert(pulse.height <= pulseChildrenBottom - pulse.top + inset + 1,
  `Work Pulse paints below its content: ${JSON.stringify(geometry)}`)
assert(dock.width <= dockChildrenRight - dock.left + inset * 2 + 1,
  `Dock paints beyond its content: ${JSON.stringify(geometry)}`)
assert(!geometry.documentOverflowX, `document overflow: ${JSON.stringify(geometry)}`)
```

Capture a screenshot on failure.

- [ ] **Step 2: Build preview and observe RED against the stretched shell**

Run: `npm run build:preview`

Run: `node scripts/preview-calm-canvas.mjs --focused`

Expected: the old Day, Work Pulse, and Dock envelope assertions fail.

- [ ] **Step 3: Implement the overlay and content-sized zone CSS**

Replace the stretched shell rules with this responsibility split:

```css
.adaptive-stage__grid {
  display: grid;
  height: calc(100dvh - (2 * var(--stage-inset)));
  grid-template-columns:
    minmax(0, clamp(15rem, 22vw, 28rem))
    minmax(20rem, 1fr)
    minmax(0, clamp(15rem, 22vw, 28rem));
  grid-template-rows: minmax(0, 1fr) auto;
  grid-template-areas: "day now pulse" "dock dock dock";
  gap: var(--stage-gap);
}

.stage-zone {
  grid-auto-flow: row;
  grid-auto-rows: minmax(var(--stage-track-min), auto);
  align-content: start;
  align-self: start;
  height: max-content;
  padding: 8px;
}

.stage-zone--now {
  align-self: center;
  justify-self: center;
  width: min(100%, 48rem);
  padding: 0;
}

.stage-zone--now .board-item[data-block-id="clock"] {
  grid-column: 1 / -1;
  justify-self: center;
  width: 100%;
}

.stage-zone--dock {
  justify-self: center;
  width: max-content;
  max-width: 100%;
}
```

Retain the established glance tokens, launcher surface, Signal Dock scroll/focus rules, Utility Tray, and Settings owners. Add profile-specific overrides: Compact becomes one column in `Now`, `Day`, `Pulse`, `Dock` order with Stage-owned vertical scrolling; Display and Ultrawide keep equal edge-column widths capped at readable measures.

- [ ] **Step 4: Run focused component and CSS-legibility tests**

Run: `npm test -- src/newtab/components/BoardItem.test.tsx src/newtab/App.test.tsx src/newtab/adaptiveStageLegibility.test.ts`

Fix only assertions whose explicit presentation expectation changed; do not alter planner, registry, capacity, schema, migration, privacy, or permission tests.

- [ ] **Step 5: Rebuild preview and run the focused browser replay once**

Run: `npm run build:preview`

Run: `node scripts/preview-calm-canvas.mjs --focused`

Expected: sparse 1600x900 and dense 2012x1397 pass centering, content envelope, collision, overflow, target, and runtime-error assertions. Inspect both screenshots at original resolution.

- [ ] **Step 6: Commit Task 2**

```text
git add src/newtab/index.css src/newtab/App.test.tsx scripts/preview-calm-canvas.mjs
git commit -m "feat(stage): compose the Calm Canvas"
```

### Task 3: Complete the inventory-driven real-browser UI audit

**Files:**
- Modify: `scripts/preview-calm-canvas.mjs`
- Create: `docs/superpowers/reports/CALM-CANVAS-UI-INVENTORY.md`
- Create: `docs/superpowers/reports/CALM-CANVAS-QA.md`
- Create screenshots and `evidence.json` under the task output directory.

**Interfaces:**
- Consumes: preview fixtures, frozen registry/connector identities, real UI roles and names, the approved 17-view witness list.
- Produces: one indexed audit with a direct result or grounded not-applicable reason for every required surface/state row.

- [ ] **Step 1: Expand the browser script from the actual registries**

Add the 17 full-page witnesses from the spec. Seed sparse and dense data through the existing preview bridge. For each page collect:

```js
{
  profile,
  viewport,
  clockCenterDelta,
  zoneEnvelopes,
  blockIds,
  duplicateIds,
  collisions,
  paintEscapes,
  horizontalOverflow,
  targetFailures,
  consoleErrors,
  pageErrors,
  failedRequests,
  missingImages
}
```

Generate individual PNGs and an `evidence.json` index.

- [ ] **Step 2: Add the registry and state inventory interactions**

Exercise all 26 registry identities at least once and the following real paths: Search/Focus entry, launcher add/edit/remove, Bookmark drill/back, Palette open/close, Weather location, Calendar source, every connector identity and Signal Dock disclosure, Tasks edit, Notes dirty/save/error/retry guard, Timer run/close/reopen, Home Assistant pending/error/action isolation, Refresh, all four Settings tabs in roomy/narrow Drawers, Data confirmation/error surfaces, and Arrange preview/Undo/Cancel/Save/reset/copy.

Use visibility assertions before every click/tap. Use Tab, Shift+Tab, Enter, Space, Escape, scroll, resize, and touch for the applicable owners. Restore storage and remove profiles in `finally`.

- [ ] **Step 3: Run the comprehensive replay once after stabilization**

Run: `npm run build:preview`

Run: `node scripts/preview-calm-canvas.mjs`

Expected: all inventory rows and 17 composition witnesses pass with zero unexpected external requests, failed requests, runtime errors, duplicate identities, collisions, paint escapes, missing images, or document-level horizontal overflow.

- [ ] **Step 4: Inspect every screenshot at original resolution**

Use the local image viewer on every generated PNG. Produce a contact sheet only as navigation; do not substitute it for original-resolution inspection. Record Critical/Important failures for immediate correction and Minor/cosmetic observations in the ledger.

- [ ] **Step 5: Diagnose and fix only genuine blocking families with RED tests**

For each Critical/Important failure, first add a focused failing unit or browser assertion, observe RED, implement the smallest correction, and rerun only that failing family once. Do not rerun the comprehensive replay incrementally.

- [ ] **Step 6: Write the evidence reports and commit Task 3**

Record the exact command, fixture, viewport, interaction, screenshot, geometry, accessibility, runtime, cleanup, and manual-ceiling result for each inventory row.

```text
git add scripts/preview-calm-canvas.mjs docs/superpowers/reports/CALM-CANVAS-UI-INVENTORY.md docs/superpowers/reports/CALM-CANVAS-QA.md
git commit -m "test(stage): audit the complete Calm Canvas UI"
```

### Task 4: Review, visual approval, final gates, and checkpoint

**Files:**
- Modify: `docs/superpowers/aurora-2/STATUS.md`
- Modify: the active roadmap/decision/ledger files only where the packet protocol requires it.

**Interfaces:**
- Consumes: stable implementation, complete UI inventory, owner visual decision.
- Produces: one reviewed, verified, pushed remediation checkpoint or a precise blocking report.

- [ ] **Step 1: Perform the single implementation review**

Review only the written acceptance criteria and classify findings as Critical, Important, or Minor under the owner's pragmatic-delivery rule. If Critical/Important findings exist, complete one RED-first fix and one rereview. Ledger Minor findings without reopening the remediation.

- [ ] **Step 2: Deliver the contact sheet and representative full-resolution captures for owner visual approval**

Do not call the UI accepted until the owner approves the representative board. If the owner rejects the visual direction, stop and diagnose before editing.

- [ ] **Step 3: Run the final gates once**

```text
npm test
npm run build
npm run build:preview
node scripts/preview.mjs
```

If the full browser harness exposes an actual failing family, fix that family and rerun it once. Do not repeat gates for report-only changes.

- [ ] **Step 4: Update packet ledgers and checkpoint**

Record exact counts, commands, evidence paths, review disposition, Minor debt, manual ceilings, frozen-contract proof, and W6-P5 Store block. Commit and push.

- [ ] **Step 5: Prove clean state and protected-original safety**

```text
git status --short
git rev-parse HEAD
git rev-parse '@{upstream}'
git -C "D:\DEV\Chrome plugin" status --short
git -C "D:\DEV\Chrome plugin" rev-parse HEAD
git -C "D:\DEV\Chrome plugin" rev-parse '@{upstream}'
```

- [ ] **Step 6: Resume W6-P3 automatically after acceptance**

Keep all Store listing, asset, package, upload, submission, and rollout actions blocked until W6-P5 receives explicit contemporaneous approval.
