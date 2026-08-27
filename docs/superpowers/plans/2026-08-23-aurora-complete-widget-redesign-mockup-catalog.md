# Aurora Complete Widget Redesign Mockup Catalog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone, owner-reviewable HTML/CSS catalog that genuinely redesigns every Aurora widget presentation, maps all 36 live identities into 34 target identities through the approved unified Calendar, proves exact frame and stack behavior with Playwright, and stops before production implementation.

**Architecture:** A standalone mockup application under `mockups/widget-redesign/` owns design-only fixtures, semantic render functions, tokens, and catalog navigation. It does not import production widget components or write Aurora storage. Pure catalog contracts under `scripts/` define the 36-source to 34-target inventory, supported presentation matrix, required state/theme coverage, and mixed-stack cases; a dedicated Playwright harness serves the mockup application, captures exact pixels, measures geometry/overflow/contrast-facing hooks, and writes evidence plus the final catalog under a new non-rejected path.

**Tech Stack:** Semantic HTML, modern CSS, browser-native JavaScript modules, Node.js test runner, Playwright Chromium 1.62, Sharp 0.35, existing npm/Vite toolchain only.

**Spec:** `docs/superpowers/specs/2026-08-23-aurora-unified-calendar-widget-design.md`, governed by the complete redesign takeover brief and `docs/superpowers/specs/2026-08-22-aurora-shared-widget-frames-and-stack-composition-design.md`

## Global Constraints

- Work only in `D:\DEV\Chrome plugin-aurora-2` on `feat/aurora-2-observatory`. Never write to `D:\DEV\Chrome plugin`.
- Do not restart, reset, overwrite newer legitimate work, or reuse the rejected SF-P2 catalog as accepted visual evidence.
- Do not modify `src/`, `public/`, `dist/`, extension manifests, connector implementations, storage schemas, production migrations, permissions, CSP, dependencies, or Chrome Web Store state.
- Account for all 36 live source identities exactly once. Map `ics`, `monthCal`, and `publicHolidays` to one target Calendar, producing 34 target identities.
- Preserve exact Compact 216x132, Standard 320x200, and Full 460x284 CSS pixel frames. Docked faces remain content-tight.
- Every target identity gets an identity-specific composition. Do not create one generic title, rows, footer shell and call it a redesign.
- No nested decorative cards, internal frame scrollbars, unexplained dots, provider implementation labels, country labels, or filler invented only to occupy space.
- Larger tiers must be materially larger or more useful. Signature visuals are resized before removal.
- Free-floating and same-tier stack faces use the same authored face. Stack members at one tier have identical external dimensions.
- Compact Month remains absent. Month never docks. Unified Calendar uses Agenda/Month switching at Standard and Month plus Agenda at Full.
- Ordinary clicks never show edit selection. Hover or interaction controls never obscure essential content.
- Design against black, white, bright pink, and other strongly saturated panel colors with soft harmonized rest text and brighter hover/focus text.
- Fixtures must cover dense, sparse, long-text, loading, empty, stale, partial, permission/setup, and error conditions where applicable.
- Required mixed stacks are Weather + On This Day, GitHub + Calendar, Tasks + Notes, Clock + Quote, and Jira + Sentry.
- Use one bounded whole-catalog review plus at most one fix/rereview cycle. Only Critical or Important findings block the owner gate.
- Every owner-facing capture must come from the exact reviewed mockup-source commit and record that commit plus source hashes.
- Stop at the complete widget-by-widget owner visual gate. Do not plan or begin production widget implementation in this packet.

---

## File structure

### Design-only application

- Create `mockups/widget-redesign/index.html`: catalog document and no-script explanation.
- Create `mockups/widget-redesign/styles.css`: standalone tokens, exact frame geometry, typography, states, stack chrome, responsive catalog layout, and family-specific compositions.
- Create `mockups/widget-redesign/catalog-app.mjs`: query parsing, navigation, filters, comparison boards, and render orchestration.
- Create `mockups/widget-redesign/catalog-model.mjs`: source inventory, target identities, tier declarations, information budgets, state/theme requirements, and mixed-stack definitions.
- Create `mockups/widget-redesign/fixtures.mjs`: realistic frozen fixtures only, grouped by identity and scenario.
- Create `mockups/widget-redesign/renderers/shared.mjs`: escaping, semantic primitives, frame, dock line, stack, badges, meters, charts, and state surfaces.
- Create `mockups/widget-redesign/renderers/index.mjs`: one strict renderer dispatcher that rejects unimplemented or unsupported target/tier combinations.
- Create `mockups/widget-redesign/renderers/core.mjs`: Clock, Greeting, Search, Focus, Quote, Timer, Tasks, Notes, Bookmarks, Quick Links, World Clocks, Countdown, and Habits.
- Create `mockups/widget-redesign/renderers/calendar-sky.mjs`: Calendar, Weather, Sun, Moon, On This Day, and Aurora & Kp.
- Create `mockups/widget-redesign/renderers/work.mjs`: GitHub, GitLab, Jira, Vercel, Service Status, Linear, Sentry, and Todoist.
- Create `mockups/widget-redesign/renderers/resources.mjs`: Reading List, Recently Closed, Downloads, Tab Groups, Home Assistant, RSS, and Crypto.

### Contracts, tests, and evidence

- Create `scripts/widget-redesign-catalog-contracts.mjs`: pure manifest validation and expected capture expansion.
- Create `scripts/widget-redesign-catalog-contracts.test.mjs`: inventory, matrix, state, theme, stack, path, and uniqueness tests.
- Create `scripts/widget-redesign-catalog-server.mjs`: safe loopback-only static server for the design-only application.
- Create `scripts/qa-widget-redesign-catalog.mjs`: safe local server, Playwright capture, DOM measurement, screenshot output, and evidence generation.
- Create `scripts/qa-widget-redesign-catalog.test.mjs`: pure harness contract tests and one bounded browser smoke.
- Modify `package.json`: add `test:widget-redesign-catalog` and `qa:widget-redesign-catalog` commands only.
- Create `docs/superpowers/catalog/widget-redesign/v1/CATALOG.md`: registry mapping, supported matrix, information budgets, screenshot index, review verdicts, and unresolved decisions.
- Create `docs/superpowers/catalog/widget-redesign/v1/*.png`: final exact-source screenshots only.
- Create `docs/superpowers/catalog/widget-redesign/v1/evidence.json`: machine-readable source commit, hashes, measurements, coverage, and errors.
- Create `docs/superpowers/reports/WIDGET-REDESIGN-MOCKUP-QA.md`: commands, review results, manual inspection record, limitations, and owner gate.

---

### Task 1: Freeze the 36-source to 34-target catalog contract

**Files:**

- Create: `mockups/widget-redesign/catalog-model.mjs`
- Create: `scripts/widget-redesign-catalog-contracts.mjs`
- Create: `scripts/widget-redesign-catalog-contracts.test.mjs`
- Modify: `package.json`

**Interfaces:**

- Produces: `SOURCE_WIDGET_IDS`, `TARGET_WIDGETS`, `LEGACY_TARGET_MAP`, `MIXED_STACKS`, `validateCatalogModel(model)`, and `expectedCatalogCaptures(model)`.
- Consumers: every renderer, the mockup application, Playwright harness, and catalog writer.

- [ ] **Step 1: Write the failing inventory and coverage tests.**

```js
test('maps all 36 live identities into 34 target identities exactly once', () => {
  assert.equal(SOURCE_WIDGET_IDS.length, 36)
  assert.equal(new Set(SOURCE_WIDGET_IDS).size, 36)
  assert.equal(TARGET_WIDGETS.length, 34)
  assert.deepEqual(LEGACY_TARGET_MAP, {
    ics: 'calendar',
    monthCal: 'calendar',
    publicHolidays: 'calendar',
  })
  assert.deepEqual(validateCatalogModel({ sourceIds: SOURCE_WIDGET_IDS, targets: TARGET_WIDGETS }), [])
})

test('pins the unified Calendar and required mixed stacks', () => {
  const calendar = TARGET_WIDGETS.find(({ id }) => id === 'calendar')
  assert.deepEqual(calendar.tiers, ['docked', 'compact', 'standard', 'full'])
  assert.deepEqual(calendar.standardViews, ['agenda', 'month'])
  assert.deepEqual(MIXED_STACKS.map(({ members }) => members), [
    ['weather', 'onThisDay'],
    ['github', 'calendar'],
    ['tasks', 'notes'],
    ['clock', 'quote'],
    ['jira', 'sentry'],
  ])
})
```

- [ ] **Step 2: Run the contract test and observe RED.**

Run:

```powershell
node --test scripts/widget-redesign-catalog-contracts.test.mjs
```

Expected: FAIL because the new contract modules do not exist.

- [ ] **Step 3: Implement the exact catalog model.** Declare every target's label, family, free tiers, stack tiers, dock support, presentation class, information budget per tier, applicable states, primary theme tier, and source identities. Use these exact source ids:

```js
export const SOURCE_WIDGET_IDS = Object.freeze([
  'clock', 'greeting', 'worldClocks', 'countdown', 'search', 'focus', 'links',
  'quote', 'weather', 'timer', 'tasks', 'notes', 'bookmarks', 'rss', 'github',
  'gitlab', 'jira', 'vercel', 'crypto', 'readingList', 'recentlyClosed',
  'downloads', 'tabGroups', 'ics', 'habits', 'monthCal', 'sun', 'moon',
  'status', 'homeassistant', 'linear', 'sentry', 'todoist', 'onThisDay',
  'publicHolidays', 'auroraKp',
])
```

`expectedCatalogCaptures` must expand one dark ready capture for every supported tier, one light and one saturated capture at each target's declared primary tier, applicable state captures at that primary tier, every supported stack face, five mixed stacks, the Calendar Agenda/Month comparison, and the consolidation prompt.

- [ ] **Step 4: Add package commands and run GREEN.**

```json
{
  "test:widget-redesign-catalog": "node --test scripts/widget-redesign-catalog-contracts.test.mjs scripts/qa-widget-redesign-catalog.test.mjs",
  "qa:widget-redesign-catalog": "node scripts/qa-widget-redesign-catalog.mjs"
}
```

Run the focused contract test and `git diff --check`.

- [ ] **Step 5: Commit the frozen contract.**

```powershell
git add package.json mockups/widget-redesign/catalog-model.mjs scripts/widget-redesign-catalog-contracts.mjs scripts/widget-redesign-catalog-contracts.test.mjs
git commit -m "test: define widget redesign catalog contract"
```

---

### Task 2: Build the standalone catalog shell and visual system

**Files:**

- Create: `mockups/widget-redesign/index.html`
- Create: `mockups/widget-redesign/styles.css`
- Create: `mockups/widget-redesign/catalog-app.mjs`
- Create: `mockups/widget-redesign/renderers/shared.mjs`
- Create: `scripts/widget-redesign-catalog-server.mjs`
- Create: `scripts/qa-widget-redesign-catalog.test.mjs`

**Interfaces:**

- Consumes: `TARGET_WIDGETS` and `expectedCatalogCaptures` from Task 1.
- Produces: `renderFrame({ tier, theme, label, state, body, actions })`, `renderDockLine(...)`, `renderStack(...)`, `renderStateSurface(...)`, `startCatalogServer({ repoRoot })`, and browser routes `?view=gallery`, `?capture=<key>`, and `?view=inventory`.

- [ ] **Step 1: Write the failing shell smoke test.** Start a temporary local server through an exported `startCatalogServer()` and assert:

```js
await page.goto(`${origin}/mockups/widget-redesign/?view=gallery`)
assert.equal(await page.locator('[data-catalog-app]').count(), 1)
assert.equal(await page.locator('[data-catalog-inventory="36-to-34"]').count(), 1)
assert.equal(await page.locator('[data-tier-frame="compact"]').first().evaluate((node) => getComputedStyle(node).width), '216px')
assert.equal(await page.locator('[data-tier-frame="compact"]').first().evaluate((node) => getComputedStyle(node).height), '132px')
```

- [ ] **Step 2: Run the browser smoke and observe RED.**

```powershell
node --test scripts/qa-widget-redesign-catalog.test.mjs
```

Expected: FAIL because the server, document, shared renderer, and styles do not exist.

- [ ] **Step 3: Implement the safe local server and catalog shell.** `startCatalogServer` binds only to `127.0.0.1` on an ephemeral port, serves only the validated mockup directory, rejects path traversal, and returns an async `close()` owner. The page provides a compact sticky filter bar, family navigation, widget search, tier/state/theme filters, side-by-side tier comparisons, and a focused single-capture route. It remains an inspection tool, not a fake Aurora dashboard.

Use local-only typography and explicit tokens:

```css
:root {
  --frame-compact-w: 216px;
  --frame-compact-h: 132px;
  --frame-standard-w: 320px;
  --frame-standard-h: 200px;
  --frame-full-w: 460px;
  --frame-full-h: 284px;
  --radius-frame: 24px;
  --font-ui: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

[data-tier-frame="compact"] { inline-size: var(--frame-compact-w); block-size: var(--frame-compact-h); }
[data-tier-frame="standard"] { inline-size: var(--frame-standard-w); block-size: var(--frame-standard-h); }
[data-tier-frame="full"] { inline-size: var(--frame-full-w); block-size: var(--frame-full-h); }
```

Themes must derive foregrounds from authored theme tokens rather than one low-opacity white. Provide dark, light, pink, electric blue, and acid green fixtures, with dark/light/pink mandatory in final capture expansion.

- [ ] **Step 4: Implement safe semantic primitives.** Escape every fixture string, keep buttons and links labelled, expose state with visible and programmatic text, and reject unsupported tier/state combinations rather than substituting another face.

- [ ] **Step 5: Run GREEN and inspect the shell at 1440x900 and 390x844.** Confirm the catalog page itself has one document scrollport, no horizontal overflow, and keyboard-reachable filters.

- [ ] **Step 6: Commit the standalone foundation.**

```powershell
git add mockups/widget-redesign/index.html mockups/widget-redesign/styles.css mockups/widget-redesign/catalog-app.mjs mockups/widget-redesign/renderers/shared.mjs scripts/widget-redesign-catalog-server.mjs scripts/qa-widget-redesign-catalog.test.mjs
git commit -m "feat: build standalone widget design catalog"
```

---

### Task 3: Author intrinsic, navigation, and productivity identities

**Files:**

- Create: `mockups/widget-redesign/fixtures.mjs`
- Create: `mockups/widget-redesign/renderers/core.mjs`
- Create: `mockups/widget-redesign/renderers/index.mjs`
- Modify: `mockups/widget-redesign/catalog-app.mjs`
- Modify: `mockups/widget-redesign/styles.css`
- Modify: `scripts/widget-redesign-catalog-contracts.test.mjs`

**Interfaces:**

- Produces: `renderCoreWidget(capture, fixture)` for Clock, Greeting, Search, Focus, Quote, Timer, Tasks, Notes, Bookmarks, Quick Links, World Clocks, Countdown, and Habits, plus strict `renderWidgetFace(capture, fixture)` dispatch.
- Fixtures expose `fixtureFor(id, scenario, overrides = {})` with `dense`, `sparse`, `longText`, and identity-specific ready data without remote assets.

- [ ] **Step 1: Add RED coverage assertions.** Require every core identity and declared tier to return a non-empty semantic face with identity-specific hooks. Examples:

```js
const render = (id, tier, options = {}) => renderWidgetFace(
  { id, tier, state: options.state ?? 'ready', theme: options.theme ?? 'dark', ...options },
  fixtureFor(id, options.fixture ?? 'dense', options),
)
const count = (html, attribute) => (html.match(new RegExp(attribute, 'g')) ?? []).length

assert.match(render('clock', 'compact'), /data-clock-time/)
assert.match(render('clock', 'full'), /data-clock-timezone/)
assert.match(render('bookmarks', 'compact'), /data-bookmark-mark="N"/)
assert.match(render('tasks', 'docked'), /data-task-progress/)
assert.doesNotMatch(render('quote', 'standard'), /data-generic-row/)
```

- [ ] **Step 2: Observe RED before adding renderers.** Run the catalog contract test and expect missing renderer coverage for all 13 identities.

- [ ] **Step 3: Implement identity-specific compositions.**

  - Clock: Compact time; Standard time/date; Full time/date/seconds and enabled timezone context; Docked time/date.
  - Greeting: content-tight free form and balanced stack face with useful briefing, never a mostly empty frame.
  - Search: content-tight free form and deliberate stack prompt; no fake provider picker.
  - Focus: clear action/progress; preserve an immersive Flow reference without simulating Flow inside the card.
  - Quote: balanced long-text typography with truthful clamp and attribution.
  - Timer, Tasks, Notes: shared foreground logic, dense Docked weight, useful Compact interaction, non-occluding controls.
  - Bookmarks: readable linear free form, one-letter Compact marks, dense stack face, masked overflow reference without a visible scrollbar.
  - Quick Links: recognizable destinations with bounded names.
  - World Clocks: materially richer tiers with timezone and day-offset context.
  - Countdown: dominant remaining-time value with exact target date context.
  - Habits: meaningful daily progress and lower-frame state, never a short row over empty space.

- [ ] **Step 4: Add loading/empty/long fixtures only where truthful.** Tasks and Notes use useful empty states; Quote uses long text; Bookmarks and Links use dense overflow; Timer uses running and idle; Habits uses zero, partial, and complete progress.

- [ ] **Step 5: Run the focused contracts and render every core capture route.** Fail on escaped fixture errors, missing essential hooks, duplicate ids, or unsupported tier substitution.

- [ ] **Step 6: Commit the core family.**

```powershell
git add mockups/widget-redesign/fixtures.mjs mockups/widget-redesign/renderers/core.mjs mockups/widget-redesign/renderers/index.mjs mockups/widget-redesign/catalog-app.mjs mockups/widget-redesign/styles.css scripts/widget-redesign-catalog-contracts.test.mjs
git commit -m "feat: redesign core widget mockups"
```

---

### Task 4: Author Calendar, Weather, and sky identities

**Files:**

- Create: `mockups/widget-redesign/renderers/calendar-sky.mjs`
- Modify: `mockups/widget-redesign/renderers/index.mjs`
- Modify: `mockups/widget-redesign/fixtures.mjs`
- Modify: `mockups/widget-redesign/catalog-app.mjs`
- Modify: `mockups/widget-redesign/styles.css`
- Modify: `scripts/widget-redesign-catalog-contracts.test.mjs`

**Interfaces:**

- Produces: `renderCalendarSkyWidget(capture, fixture)` for Calendar, Weather, Sun, Moon, On This Day, and Aurora & Kp.
- Produces: `renderCalendarConsolidation(fixture)` for the approved user-controlled migration prompt.

- [ ] **Step 1: Add RED signature and tier tests.**

```js
const render = (id, tier, options = {}) => renderWidgetFace(
  { id, tier, state: options.state ?? 'ready', theme: options.theme ?? 'dark', ...options },
  fixtureFor(id, options.fixture ?? 'dense', options),
)
const count = (html, attribute) => (html.match(new RegExp(attribute, 'g')) ?? []).length

assert.match(render('calendar', 'standard', { view: 'agenda' }), /data-calendar-view="agenda"/)
assert.match(render('calendar', 'standard', { view: 'month' }), /data-month-grid/)
assert.equal(count(render('calendar', 'standard', { view: 'month' }), 'data-month-day'), 42)
assert.match(render('calendar', 'full'), /data-calendar-view="combined"/)
assert.match(render('weather', 'full'), /data-hourly-forecast/)
assert.match(render('onThisDay', 'full'), /data-history-year/)
```

- [ ] **Step 2: Observe RED before authoring the family.** Expect all six identities and the consolidation prompt to be unhandled.

- [ ] **Step 3: Implement unified Calendar faces.**

  - Docked: next timed event first, with concise holiday context when useful.
  - Compact: local date, next item, and at most one supporting item; no month grid.
  - Standard Agenda: prominent next event, bounded chronological rows, visible source names, integrated all-day holidays, and a truthful Join affordance fixture.
  - Standard Month: complete seven-column grid, visible Agenda/Month switch, today ring, distinct event/holiday markers, and nearest holiday named visibly.
  - Full: complete month plus materially richer agenda with no repeated holiday label.
  - Deduplicate the public Labor Day row against an equivalent ICS all-day fixture at render time.

- [ ] **Step 4: Implement Calendar state compositions.** Cover no feeds with useful Month, no country with holidays requested, ICS loading while Month works, stale ICS with fresh holidays, fresh ICS with failed holidays, empty Agenda, long source names, dense multi-calendar agenda, and hard failure of both remote sources while Month remains available.

- [ ] **Step 5: Implement the consolidation prompt.** Show three existing placements, including one stack member, their tiers and positions, selectable previews, carried sources, and Save/Later actions. Do not imply a default winner.

- [ ] **Step 6: Implement Weather and sky signatures.**

  - Weather keeps large temperature, subordinate unit, clear location/condition, daily and hourly forecast, AQI, pollen, UV, precipitation timing, `3 mph NW`, distinct sunrise/sunset icons, and flat hierarchy.
  - Sun and Moon Docked faces are denser than Compact and retain useful times/phase.
  - On This Day shows its heading and date once, distinct years/events, and truthful Read more.
  - Aurora & Kp uses a dominant current value plus a real forecast plot/table rather than generic rows.

- [ ] **Step 7: Run focused contracts and manually inspect Calendar Standard/Full plus Weather Full at original size.** Confirm no clipped grid row, repeated holiday, dominant unit label, or empty lower half.

- [ ] **Step 8: Commit the family.**

```powershell
git add mockups/widget-redesign/renderers/calendar-sky.mjs mockups/widget-redesign/renderers/index.mjs mockups/widget-redesign/fixtures.mjs mockups/widget-redesign/catalog-app.mjs mockups/widget-redesign/styles.css scripts/widget-redesign-catalog-contracts.test.mjs
git commit -m "feat: redesign calendar and sky mockups"
```

---

### Task 5: Author developer, service, and work identities

**Files:**

- Create: `mockups/widget-redesign/renderers/work.mjs`
- Modify: `mockups/widget-redesign/renderers/index.mjs`
- Modify: `mockups/widget-redesign/fixtures.mjs`
- Modify: `mockups/widget-redesign/catalog-app.mjs`
- Modify: `mockups/widget-redesign/styles.css`
- Modify: `scripts/widget-redesign-catalog-contracts.test.mjs`

**Interfaces:**

- Produces: `renderWorkWidget(capture, fixture)` for GitHub, GitLab, Jira, Vercel, Service Status, Linear, Sentry, and Todoist.

- [ ] **Step 1: Add RED identity and signature assertions.** Require GitHub/GitLab contribution graphs at Compact, Standard, and Full; service names and explicit states; recognizable issue/deployment/task structures; and distinct Full content.

```js
const render = (id, tier, options = {}) => renderWidgetFace(
  { id, tier, state: options.state ?? 'ready', theme: options.theme ?? 'dark', ...options },
  fixtureFor(id, options.fixture ?? 'dense', options),
)
const count = (html, attribute) => (html.match(new RegExp(attribute, 'g')) ?? []).length

assert.ok(count(render('github', 'standard'), 'data-contribution-cell') >= 70)
assert.ok(count(render('github', 'full'), 'data-contribution-cell') > count(render('github', 'standard'), 'data-contribution-cell'))
assert.match(render('status', 'standard'), /Claude/)
assert.match(render('sentry', 'full'), /data-issue-fingerprint/)
```

- [ ] **Step 2: Observe RED before creating the renderer.** The contract test must name every unhandled identity.

- [ ] **Step 3: Implement GitHub and GitLab around their signature graphs.** Compact keeps graph, contribution count, and streak. Standard substantially enlarges the graph and adds priority context. Full expands graph and adds review/PR or MR/issue/notification context. Never place a small graph in the upper-left over unused space.

- [ ] **Step 4: Implement Jira, Vercel, Linear, Sentry, and Todoist as distinct work instruments.** Use status distribution, deployment timeline, cycle/team context, issue severity/age, and due/overdue task structure respectively. Bound rows by tier and avoid generic list-shell composition.

- [ ] **Step 5: Implement Service Status.** Show recognizable names including Claude with green, yellow, or red labelled states. Remove redundant aggregate copy and provide a clear Docked disclosure cue.

- [ ] **Step 6: Add realistic dense, sparse, long, loading, empty, stale, partial, permission, and error fixtures per applicable connector.** Never show raw tokens, origins, provider APIs, or capability URLs.

- [ ] **Step 7: Run focused contracts and inspect GitHub/GitLab comparisons at all tiers.** Reject the family if Standard or Full contains a majority-empty region or if the graph is visually subordinate to metadata.

- [ ] **Step 8: Commit the family.**

```powershell
git add mockups/widget-redesign/renderers/work.mjs mockups/widget-redesign/renderers/index.mjs mockups/widget-redesign/fixtures.mjs mockups/widget-redesign/catalog-app.mjs mockups/widget-redesign/styles.css scripts/widget-redesign-catalog-contracts.test.mjs
git commit -m "feat: redesign work widget mockups"
```

---

### Task 6: Author browser-native, home, feed, and market identities

**Files:**

- Create: `mockups/widget-redesign/renderers/resources.mjs`
- Modify: `mockups/widget-redesign/renderers/index.mjs`
- Modify: `mockups/widget-redesign/fixtures.mjs`
- Modify: `mockups/widget-redesign/catalog-app.mjs`
- Modify: `mockups/widget-redesign/styles.css`
- Modify: `scripts/widget-redesign-catalog-contracts.test.mjs`

**Interfaces:**

- Produces: `renderResourceWidget(capture, fixture)` for Reading List, Recently Closed, Downloads, Tab Groups, Home Assistant, RSS, and Crypto.

- [ ] **Step 1: Add RED structure tests.** Require browser-native identities to expose bounded distinct rows and permission states; Home Assistant to show recognizable entity states/actions; RSS to show headline hierarchy; Crypto to show every selected coin that fits.

```js
const render = (id, tier, options = {}) => renderWidgetFace(
  { id, tier, state: options.state ?? 'ready', theme: options.theme ?? 'dark', ...options },
  fixtureFor(id, options.fixture ?? 'dense', options),
)
const count = (html, attribute) => (html.match(new RegExp(attribute, 'g')) ?? []).length

assert.ok(count(render('readingList', 'full'), 'data-reading-row') >= 5)
assert.match(render('downloads', 'standard'), /data-download-progress/)
assert.match(render('tabGroups', 'full'), /data-browser-window/)
assert.equal(count(render('crypto', 'standard', { coins: 4 }), 'data-coin-row'), 4)
```

- [ ] **Step 2: Observe RED before creating the renderer.** Expect exact missing family ids.

- [ ] **Step 3: Implement browser-native faces individually.** Reading List prioritizes unread queue, Recently Closed distinguishes tab/window/group restoration, Downloads gives active progress and recent outcomes, and Tab Groups organizes recognizable workspaces. Do not render one row surrounded by unused space.

- [ ] **Step 4: Implement Home Assistant, RSS, and Crypto.** Home Assistant uses entity identity and actionable state without fake controls; RSS uses headline scale and feed attribution; Crypto uses a dense quote tape/market board with all fitting selected coins and a valid single-coin composition.

- [ ] **Step 5: Add applicable permission/setup, loading, empty, stale, partial, and hard-error fixtures.** Preserve useful retained data visually and make actions truthful but inert inside the mockup catalog.

- [ ] **Step 6: Run focused contracts and inspect dense Full browser faces plus single/multi-coin Crypto.** Reject unexplained status dots, hidden essential identity, or unused lower halves.

- [ ] **Step 7: Commit the family.**

```powershell
git add mockups/widget-redesign/renderers/resources.mjs mockups/widget-redesign/renderers/index.mjs mockups/widget-redesign/fixtures.mjs mockups/widget-redesign/catalog-app.mjs mockups/widget-redesign/styles.css scripts/widget-redesign-catalog-contracts.test.mjs
git commit -m "feat: redesign resource widget mockups"
```

---

### Task 7: Complete themes, states, stacks, and interaction comparisons

**Files:**

- Modify: `mockups/widget-redesign/catalog-app.mjs`
- Modify: `mockups/widget-redesign/styles.css`
- Modify: `mockups/widget-redesign/fixtures.mjs`
- Modify: `mockups/widget-redesign/renderers/shared.mjs`
- Modify: `scripts/widget-redesign-catalog-contracts.mjs`
- Modify: `scripts/widget-redesign-catalog-contracts.test.mjs`

**Interfaces:**

- Completes: every capture returned by `expectedCatalogCaptures(model)`.
- Produces: stable selectors `data-capture-key`, `data-tier-frame`, `data-widget-id`, `data-theme`, `data-state`, `data-stack`, `data-stack-member`, and `data-essential`.

- [ ] **Step 1: Add RED completeness tests.** Assert every expected capture key resolves to exactly one renderable route and every rendered face contains at least one essential hook. Assert filenames are lowercase safe slugs and cannot escape the output directory.

- [ ] **Step 2: Add all target theme witnesses.** Each widget receives dark, light, and saturated evidence at its primary tier. Use bright pink for the mandatory saturated case and keep electric blue/acid green as gallery-only stress cases unless a contrast failure requires capture.

- [ ] **Step 3: Add all applicable state witnesses.** Use state-specific content rather than one generic status message. Retained data stays visible in stale/partial cases. Permission/setup actions name the exact next step. Error states preserve unaffected source content.

- [ ] **Step 4: Implement stack boards.** Render same-tier members inside one exact outer frame, one active face, hover/focus-only navigation chrome, dots/arrows outside essential content, and fixed member geometry. Add the five required mixed stacks and representative unrelated pairings at each common tier.

- [ ] **Step 5: Add interaction comparison boards.** Show hover, keyboard focus, plain click, and swipe states. Plain click must not show edit selection. Swipe styling must include `user-select: none` only during the gesture state.

- [ ] **Step 6: Run completeness GREEN.** The contract must report 0 missing captures, 0 duplicates, 0 unsafe paths, 0 unsupported substitutions, and 0 unaccounted source identities.

- [ ] **Step 7: Commit complete catalog source.**

```powershell
git add mockups/widget-redesign scripts/widget-redesign-catalog-contracts.mjs scripts/widget-redesign-catalog-contracts.test.mjs
git commit -m "feat: complete widget redesign catalog source"
```

Record this commit as `sourceCommit` for every owner-facing capture. Do not edit catalog source after this point without creating the one permitted fix commit and regenerating all affected evidence.

---

### Task 8: Build the Playwright evidence and catalog writer

**Files:**

- Create: `scripts/qa-widget-redesign-catalog.mjs`
- Modify: `scripts/widget-redesign-catalog-server.mjs` only if the complete harness needs an additional read-only route.
- Modify: `scripts/qa-widget-redesign-catalog.test.mjs`
- Create: `docs/superpowers/catalog/widget-redesign/v1/CATALOG.md`
- Create: `docs/superpowers/reports/WIDGET-REDESIGN-MOCKUP-QA.md`
- Create during exact run: `docs/superpowers/catalog/widget-redesign/v1/*.png`
- Create during exact run: `docs/superpowers/catalog/widget-redesign/v1/evidence.json`

**Interfaces:**

- Consumes: `expectedCatalogCaptures`, `startCatalogServer`, stable catalog selectors, and the committed design-only source.
- Produces: `runWidgetRedesignCatalog({ repoRoot, outputDir, captureKeys, exact })` and machine-readable `evidence.json`.

- [ ] **Step 1: Add failing pure harness tests.** Cover output containment, source hashing, viewport selection, exact geometry expectations, capture-key uniqueness, required selector checks, and Markdown escaping.

```js
assert.deepEqual(expectedFrame('compact'), { width: 216, height: 132 })
assert.throws(() => resolveOutput(root, '../escape.png'), /outside catalog output/i)
assert.equal(markdownCell('A | B\nC'), 'A \\| B C')
```

- [ ] **Step 2: Observe RED before creating the harness.**

```powershell
node --test scripts/qa-widget-redesign-catalog.test.mjs
```

- [ ] **Step 3: Implement the Chromium run around the safe server owner.** Reuse `startCatalogServer`, close server/context/browser in `finally`, and write first to a validated temporary output directory. Any new server route must remain read-only, loopback-only, and covered by the traversal test.

- [ ] **Step 4: Measure every face.** For each capture assert:

  - exact frame width/height within 0.5 CSS px;
  - no visible descendant outside the frame except declared external stack navigation;
  - no internal element with scrollable overflow;
  - no page horizontal overflow;
  - at least one visible `data-essential` element;
  - routine text at least 14px and metadata at least 11px except documented signature marks;
  - one active stack member and identical member frame dimensions;
  - zero page errors, console errors, failed requests, or non-local requests.

- [ ] **Step 5: Capture screenshots and evidence.** Capture focused frames for tier/state/theme cells and full comparison boards for side-by-side tiers, mixed stacks, and consolidation. Record source commit, dirty status, source file hashes, viewport, device scale factor, geometry, text floors, overflow owners, missing hooks, console/page/request evidence, and PNG dimensions.

- [ ] **Step 6: Generate the catalog and report.** `CATALOG.md` must include source-to-target inventory, all supported presentations, per-tier information budgets, every screenshot link, state/theme coverage, mixed-stack results, and a visible unresolved-owner-decisions section that reads `None` when empty. The QA report must distinguish automated evidence from manual inspection and native/live-service ceilings.

- [ ] **Step 7: Run harness unit tests and a three-capture smoke.**

```powershell
npm run test:widget-redesign-catalog
node scripts/qa-widget-redesign-catalog.mjs --capture=github-standard-dark,calendar-standard-month-dark,weather-full-pink --scratch
```

Expected: PASS with three PNGs in a scratch directory, 0 overflow, 0 missing essentials, and 0 runtime/network failures.

- [ ] **Step 8: Commit the harness and empty generated-document skeletons.** Do not commit scratch PNGs.

```powershell
git add scripts/qa-widget-redesign-catalog.mjs scripts/qa-widget-redesign-catalog.test.mjs docs/superpowers/catalog/widget-redesign/v1/CATALOG.md docs/superpowers/reports/WIDGET-REDESIGN-MOCKUP-QA.md package.json
git commit -m "test: add widget redesign visual harness"
```

---

### Task 9: Run one bounded visual review and the exact-source catalog gate

**Files:**

- Modify only if review finds a Critical or Important issue: `mockups/widget-redesign/**`
- Modify only with matching contract change: `scripts/widget-redesign-catalog-contracts*.mjs`
- Regenerate: `docs/superpowers/catalog/widget-redesign/v1/**`
- Update: `docs/superpowers/reports/WIDGET-REDESIGN-MOCKUP-QA.md`

**Interfaces:**

- Produces: the final exact-source owner candidate and one review verdict per capture.

- [ ] **Step 1: Run the complete preliminary catalog to scratch.**

```powershell
npm run test:widget-redesign-catalog
npm run qa:widget-redesign-catalog -- --scratch
```

- [ ] **Step 2: Inspect every PNG manually at original resolution.** Record Pass, Critical, Important, or Minor against whitespace, clipping, hierarchy, contrast, repeated content, essential hover-only content, generic composition, signature size, tier differentiation, dock weight, stack consistency, and state truthfulness. A mechanically green screenshot is not a visual pass.

- [ ] **Step 3: Perform one bounded whole-catalog review.** Compare every identity against the takeover requirements and the unified Calendar spec. Review inventory/matrix correctness, renderer isolation, fixture realism, accessibility, output safety, and evidence integrity.

- [ ] **Step 4: If Critical or Important findings exist, apply one fix round with focused RED/GREEN evidence.** Fix only blocking defects, rerun affected unit/browser cells, regenerate affected scratch images, and perform one focused rereview. Do not churn already accepted cells or run a second independent review cycle.

- [ ] **Step 5: Commit the final reviewed mockup source.**

```powershell
git add mockups/widget-redesign scripts/widget-redesign-catalog-contracts.mjs scripts/widget-redesign-catalog-contracts.test.mjs
git commit -m "fix: refine widget redesign owner candidate"
```

Omit this commit when the first review has no blocking findings. Record the resulting clean `HEAD` as the exact `sourceCommit`.

- [ ] **Step 6: Run the complete exact-source gate from the clean reviewed commit.**

```powershell
npm run test:widget-redesign-catalog
npm run qa:widget-redesign-catalog -- --exact
git diff --check
```

Expected: complete capture count, 0 capture failures, 0 geometry failures, 0 internal scroll owners, 0 missing essential hooks, 0 console/page errors, 0 failed/unapproved requests, and a clean source tree before generated evidence is staged.

- [ ] **Step 7: Inspect every final owner-facing PNG again.** Confirm hashes and pixels correspond to the exact reviewed source commit. Update `CATALOG.md` and QA report with final verdicts and truthful manual ceilings.

- [ ] **Step 8: Commit the final catalog evidence.**

```powershell
git add docs/superpowers/catalog/widget-redesign/v1 docs/superpowers/reports/WIDGET-REDESIGN-MOCKUP-QA.md
git commit -m "docs: publish complete widget redesign mockups"
```

- [ ] **Step 9: Verify repository boundaries.** Active worktree must be clean and ahead only by intentional commits. Protected `D:\DEV\Chrome plugin` must remain clean on `main` at its pre-task commit. Do not push, package, or touch Store state as part of this step.

---

### Task 10: Stop at the complete owner visual gate

**Files:**

- Update only after evidence commit: `docs/superpowers/reports/WIDGET-REDESIGN-MOCKUP-QA.md`

- [ ] **Step 1: Present the complete owner-review package.** Link the inventory, matrix, information budgets, all original screenshots, mixed-stack boards, Calendar comparison, consolidation prompt, and QA report.

- [ ] **Step 2: State the gate precisely.** Production widget implementation, storage migration, registry consolidation, and Store work remain blocked until the owner approves the complete catalog widget by widget.

- [ ] **Step 3: Stop.** Do not write a production implementation plan or modify production code until explicit catalog approval arrives.
