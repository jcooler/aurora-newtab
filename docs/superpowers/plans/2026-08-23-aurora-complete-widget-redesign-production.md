# Aurora Complete Widget Redesign Production Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the owner-approved 34-target widget catalog in Aurora production while preserving all 36 legacy source identities through the explicit Calendar consolidation window.

**Architecture:** Keep each widget as the sole owner of its existing hooks, data, actions, and persistence. Add an explicit free, stack, or docked presentation signal at the renderer boundary, then replace each identity's presentation layer in bounded family packets using the approved catalog as pixel authority. Calendar composes the existing ICS, local month, and Public Holidays authorities behind canonical `ics`; legacy placements remain readable until the user saves an atomic per-layout consolidation.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, Testing Library, Tailwind utilities, authored CSS in `src/newtab/index.css`, Chrome MV3 APIs, Playwright Chromium QA.

**Spec:** `docs/superpowers/specs/2026-08-23-aurora-unified-calendar-widget-design.md`, `docs/superpowers/specs/2026-08-22-aurora-shared-widget-frames-and-stack-composition-design.md`, and `docs/superpowers/catalog/widget-redesign/v1/CATALOG.md`

## Global Constraints

- Work only in `D:\DEV\Chrome plugin-aurora-2` on `feat/aurora-2-observatory`; `D:\DEV\Chrome plugin` remains read-only.
- Compact, Standard, and Full painted frames remain exactly 216x132, 320x200, and 460x284 CSS px.
- Free intrinsic widgets remain content-tight and photo-first; their stack presentations remain exact framed faces.
- Docked widgets remain one dense line and keep independent X/Y placement, 5px outer dock bounds, masked overflow, and no visible scrollbar.
- Preserve one mounted data owner per widget identity in free, stack, and docked presentations.
- Plain clicks never select widgets; edit chrome remains edit-only and cannot cover content.
- No new dependencies, broad permissions, capability URL exposure, credential persistence, provider branding, or Chrome Web Store action.
- Use strict RED then GREEN TDD for every production behavior change.
- Run one bounded review and at most one fix and rereview cycle per packet.
- Rebuild `dist` from the exact reviewed commit before every owner-facing production screenshot.
- Use literal `&` in plain-text titles and do not introduce em or en dashes in project copy.

---

### Task 1: Presentation context and production composition contract

**Files:**
- Modify: `src/newtab/widgetRenderers.tsx`
- Modify: `src/newtab/App.tsx`
- Modify: `src/newtab/canvas/CanvasSurface.tsx`
- Modify: `src/newtab/canvas/CanvasSurface.test.tsx`
- Modify: `src/newtab/widgetRenderers.test.tsx`
- Modify: `src/newtab/widgets/shared/TierFrame.tsx`
- Modify: `src/newtab/widgets/shared/TierFrame.test.tsx`
- Modify: `src/newtab/index.css`
- Modify: `docs/superpowers/aurora-2/STATUS.md`
- Modify: `docs/superpowers/aurora-2/ROADMAP.md`
- Modify: `docs/superpowers/aurora-2/DECISIONS.md`

**Interfaces:**
- Produces: `WidgetPresentationMode = 'free' | 'stack' | 'docked'` and `WidgetRendererProps.presentation`.
- Produces: `TierFrame` support for `surface="card" | "none"` without changing exact tier geometry.
- Consumes: Existing `renderWidget(entry, size, docked)` call boundary and `WidgetPresentationContract` data.

- [ ] **Step 1: Write failing presentation-routing tests**

```tsx
it('passes stack presentation only to mounted stack owners', () => {
  const calls: Array<[string, string]> = []
  renderSurfaceWithRenderer((entry, _size, presentation) => {
    calls.push([entry.id, presentation])
    return <div>{entry.id}</div>
  })
  expect(calls).toContainEqual(['weather', 'stack'])
  expect(calls).toContainEqual(['clock', 'free'])
})

it('keeps a surface-none frame geometrically exact', () => {
  render(<TierFrame label="Greeting" tier="standard" state="ready" surface="none">Hello</TierFrame>)
  expect(screen.getByLabelText('Greeting')).toHaveAttribute('data-tier-surface', 'none')
  expect(screen.getByLabelText('Greeting')).toHaveAttribute('data-tier-frame', 'standard')
})
```

- [ ] **Step 2: Run the focused tests and observe RED**

Run: `npx vitest run src/newtab/canvas/CanvasSurface.test.tsx src/newtab/widgetRenderers.test.tsx src/newtab/widgets/shared/TierFrame.test.tsx`

Expected: FAIL because the renderer boundary has only a `docked` boolean and `TierFrame` has no surface contract.

- [ ] **Step 3: Implement the explicit presentation boundary**

```ts
export type WidgetPresentationMode = 'free' | 'stack' | 'docked'

export interface WidgetRendererProps {
  presentation?: WidgetPresentationMode
  docked?: boolean
  canvasSize?: CanvasSize
}
```

Change `CanvasSurface` to request `stack` for every mounted stack member, `docked` for dock members, and `free` for anchored members. Keep `docked` derived for current widget branches during the migration:

```tsx
return <Renderer
  {...rendererProps}
  canvasSize={size}
  presentation={presentation}
  docked={presentation === 'docked'}
/>
```

- [ ] **Step 4: Add surface and typography primitives without a generic content layout**

Add `surface?: 'card' | 'none'` to `TierFrame`. Emit `data-tier-surface`; use CSS only for exact frame paint, foreground hierarchy, focus, and reduced motion. Do not add a generic title, rows, footer, fact grid, or internal scroll container.

- [ ] **Step 5: Run the focused packet gate**

Run: `npx vitest run src/newtab/canvas/CanvasSurface.test.tsx src/newtab/canvas/StackCard.test.tsx src/newtab/widgetRenderers.test.tsx src/newtab/widgets/shared/TierFrame.test.tsx src/newtab/widgetRegistry.test.ts src/newtab/widgetSizeContracts.test.ts`

Run: `npx tsc -b --pretty false`

Expected: all tests and TypeScript pass.

- [ ] **Step 6: Record and commit the packet**

Update the three Aurora ledgers with exact test counts and the presentation-boundary decision.

```powershell
git add src/newtab/widgetRenderers.tsx src/newtab/App.tsx src/newtab/canvas/CanvasSurface.tsx src/newtab/canvas/CanvasSurface.test.tsx src/newtab/widgetRenderers.test.tsx src/newtab/widgets/shared/TierFrame.tsx src/newtab/widgets/shared/TierFrame.test.tsx src/newtab/index.css docs/superpowers/aurora-2
git commit -m "feat: add widget presentation context"
```

---

### Task 2: Core intrinsic and personal-action compositions

**Files:**
- Modify: `src/newtab/components/Clock.tsx`
- Modify: `src/newtab/components/Clock.test.tsx`
- Modify: `src/newtab/components/Greeting.tsx`
- Modify: `src/newtab/components/Greeting.test.tsx`
- Modify: `src/newtab/components/SearchBar.tsx`
- Modify: `src/newtab/components/SearchBar.test.tsx`
- Modify: `src/newtab/components/FocusLine.tsx`
- Modify: `src/newtab/components/FocusLine.test.tsx`
- Modify: `src/newtab/widgets/links/LinksWidget.tsx`
- Modify: `src/newtab/widgets/links/LinksWidget.test.tsx`
- Modify: `src/newtab/widgets/links/LinkTile.tsx`
- Modify: `src/newtab/widgets/links/LinkTile.test.tsx`
- Modify: `src/newtab/widgets/quote/QuoteWidget.tsx`
- Modify: `src/newtab/widgets/quote/QuoteWidget.test.tsx`
- Modify: `src/newtab/widgets/clocks/WorldClocks.tsx`
- Modify: `src/newtab/widgets/clocks/WorldClocks.test.tsx`
- Modify: `src/newtab/widgets/countdown/CountdownLine.tsx`
- Modify: `src/newtab/widgets/countdown/CountdownLine.test.tsx`
- Modify: `src/newtab/index.css`

**Interfaces:**
- Consumes: `WidgetRendererProps.presentation`, `canvasSize`, and exact `TierFrame` geometry from Task 1.
- Produces: Content-tight free faces and purpose-built framed stack faces for Clock, Greeting, Search, Focus, Quick Links, Quote, World Clocks, and Countdown.

- [ ] **Step 1: Write failing tier and presentation tests**

```tsx
it.each([
  ['compact', false, true],
  ['standard', true, true],
  ['full', true, true],
] as const)('authors Clock %s content', (size, showsDate, showsZone) => {
  render(<Clock canvasSize={size} presentation="stack" />)
  expect(screen.queryByTestId('clock-date') !== null).toBe(showsDate)
  expect(screen.queryByTestId('clock-zone') !== null).toBe(showsZone)
})

it('keeps free Greeting frameless and stack Greeting framed', () => {
  const { rerender } = render(<Greeting canvasSize="standard" presentation="free" />)
  expect(screen.getByTestId('greeting-face')).toHaveAttribute('data-tier-surface', 'none')
  rerender(<Greeting canvasSize="standard" presentation="stack" />)
  expect(screen.getByLabelText('Greeting')).toHaveAttribute('data-tier-surface', 'card')
})

it('renders six Standard Quick Links in two readable columns', () => {
  render(<LinksWidget canvasSize="standard" presentation="stack" />)
  expect(screen.getByLabelText('Quick links')).toHaveAttribute('data-links-layout', '2x3')
  expect(screen.getAllByTestId('quick-link-copy')).toHaveLength(6)
})
```

- [ ] **Step 2: Run the eight component test files and observe RED**

Run: `npx vitest run src/newtab/components/Clock.test.tsx src/newtab/components/Greeting.test.tsx src/newtab/components/SearchBar.test.tsx src/newtab/components/FocusLine.test.tsx src/newtab/widgets/links/LinksWidget.test.tsx src/newtab/widgets/quote/QuoteWidget.test.tsx src/newtab/widgets/clocks/WorldClocks.test.tsx src/newtab/widgets/countdown/CountdownLine.test.tsx`

Expected: FAIL on missing size and presentation branches.

- [ ] **Step 3: Implement the approved identity-specific faces**

Keep free Greeting, Clock, Quote, Search, Focus, and Quick Links photo-first. Use `TierFrame` only for stack presentation. Quick Links Standard uses two columns by three rows with a fixed mark column and name plus destination copy; Compact uses marks only. Clock uses time only at Compact, time and date at Standard, and time, seconds, date, and timezone at Full. Quote uses line clamping only when its real text exceeds the tier budget.

- [ ] **Step 4: Verify user actions and accessibility remain owned by the existing components**

Run: `npx vitest run src/newtab/components src/newtab/widgets/links src/newtab/widgets/quote src/newtab/widgets/clocks src/newtab/widgets/countdown`

Expected: link add, remove, drag, keyboard reorder, search submission, focus editing, and existing clock timers remain green.

- [ ] **Step 5: Build and capture the packet in Chromium**

Run: `npm run build`

Run the production preview harness for free and stack Compact, Standard, and Full faces on dark, white, and bright-pink panels. Assert no clipped Quick Link names, no Greeting card in free mode, exact stack frames, visible focus, no ordinary-click selection, and no runtime or request errors.

- [ ] **Step 6: Commit**

```powershell
git add src/newtab/components src/newtab/widgets/links src/newtab/widgets/quote src/newtab/widgets/clocks src/newtab/widgets/countdown src/newtab/index.css docs/superpowers/aurora-2
git commit -m "feat: redesign core widget presentations"
```

---

### Task 3: Tasks, Notes, Timer, Habits, and Bookmarks

**Files:**
- Modify: `src/newtab/widgets/todo/TodoWidget.tsx`
- Modify: `src/newtab/widgets/todo/TodoWidget.test.tsx`
- Modify: `src/newtab/widgets/notes/NotesWidget.tsx`
- Modify: `src/newtab/widgets/notes/NotesWidget.test.tsx`
- Modify: `src/newtab/widgets/timer/TimerWidget.tsx`
- Modify: `src/newtab/widgets/timer/TimerWidget.test.tsx`
- Modify: `src/newtab/widgets/habits/HabitsWidget.tsx`
- Modify: `src/newtab/widgets/habits/HabitsWidget.test.tsx`
- Modify: `src/newtab/widgets/bookmarks/BookmarksBar.tsx`
- Modify: `src/newtab/widgets/bookmarks/BookmarksBar.test.tsx`
- Modify: `src/newtab/index.css`

**Interfaces:**
- Consumes: Existing reducers, persistence hooks, panels, dock lines, and Task 1 presentation context.
- Produces: Approved dense faces without changing task, note, timer, habit, or bookmark ownership.

- [ ] **Step 1: Write failing information-budget tests**

```tsx
it('shows two actionable tasks in Compact without opening the panel', () => {
  renderTodo({ canvasSize: 'compact', tasks: denseTasks })
  expect(screen.getAllByRole('checkbox')).toHaveLength(2)
  expect(screen.queryByText(denseTasks[2]!.text)).not.toBeInTheDocument()
})

it('keeps Docked Notes to one readable line', () => {
  renderNotes({ docked: true, note: longNote })
  expect(screen.getByTestId('notes-dock')).toHaveTextContent('Keep the month view complete')
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
})

it('keeps the free Bookmark bar linear and its stack face framed', () => {
  const { rerender } = renderBookmarks({ presentation: 'free', canvasSize: 'standard' })
  expect(screen.getByRole('navigation')).toHaveAttribute('data-bookmarks-presentation', 'bar')
  rerenderBookmarks({ presentation: 'stack', canvasSize: 'standard' })
  expect(screen.getByLabelText('Bookmarks')).toHaveAttribute('data-tier-frame', 'standard')
})
```

- [ ] **Step 2: Observe RED**

Run: `npx vitest run src/newtab/widgets/todo/TodoWidget.test.tsx src/newtab/widgets/notes/NotesWidget.test.tsx src/newtab/widgets/timer/TimerWidget.test.tsx src/newtab/widgets/habits/HabitsWidget.test.tsx src/newtab/widgets/bookmarks/BookmarksBar.test.tsx`

- [ ] **Step 3: Implement the approved compositions**

Tasks Compact shows two bounded actions and progress; Notes shows readable content and edited age; Timer makes the remaining time dominant; Habits uses completion plus useful per-habit state; Bookmarks keeps the free bar and uses purpose-built framed mark/name faces in stacks. Docked forms remain one line and match the shared 44px visual weight.

- [ ] **Step 4: Run ownership and interaction regressions**

Run: `npx vitest run src/newtab/widgets/todo src/newtab/widgets/notes src/newtab/widgets/timer src/newtab/widgets/habits src/newtab/widgets/bookmarks src/newtab/canvas/CanvasSurface.test.tsx`

Expected: one persistence owner, exact panels, keyboard actions, dock behavior, and stack mounting remain green.

- [ ] **Step 5: Build, inspect Tasks + Notes mixed stack, then commit**

```powershell
npm run build
git add src/newtab/widgets/todo src/newtab/widgets/notes src/newtab/widgets/timer src/newtab/widgets/habits src/newtab/widgets/bookmarks src/newtab/index.css docs/superpowers/aurora-2
git commit -m "feat: redesign personal action widgets"
```

---

### Task 4: Unified Calendar production identity and explicit consolidation

**Files:**
- Create: `src/newtab/widgets/calendar/calendarComposition.ts`
- Create: `src/newtab/widgets/calendar/calendarComposition.test.ts`
- Create: `src/lib/layout/calendarConsolidation.ts`
- Create: `src/lib/layout/calendarConsolidation.test.ts`
- Modify: `src/newtab/widgets/calendar/CalendarWidget.tsx`
- Modify: `src/newtab/widgets/calendar/CalendarWidget.test.tsx`
- Modify: `src/newtab/widgets/monthcal/MonthCalWidget.tsx`
- Modify: `src/newtab/widgets/monthcal/MonthCalWidget.test.tsx`
- Modify: `src/newtab/widgets/glance/PublicHolidaysWidget.tsx`
- Modify: `src/newtab/widgets/glance/PublicHolidaysWidget.test.tsx`
- Modify: `src/newtab/widgetRegistry.ts`
- Modify: `src/newtab/widgetRegistry.test.ts`
- Modify: `src/newtab/widgetSizeContracts.ts`
- Modify: `src/newtab/widgetSizeContracts.test.ts`
- Modify: `src/newtab/edit/WidgetInspector.tsx`
- Modify: `src/newtab/edit/WidgetInspector.test.tsx`
- Modify: `src/settings/sections/Widgets.tsx`
- Modify: `src/settings/SettingsPanel.test.tsx`
- Modify: `src/lib/layout/namedLayouts.ts`
- Modify: `src/lib/layout/namedLayouts.test.ts`
- Modify: `src/newtab/index.css`

**Interfaces:**
- Produces: `CalendarAgendaItem`, `composeCalendarItems`, `calendarMonthCells`, `detectLegacyCalendarPlacements`, and `consolidateCalendarLayout`.
- Keeps: canonical production identity `ics`; compatibility renderers for `monthCal` and `publicHolidays` until per-layout Save.
- Consumes: Existing ICS hooks, month calculations, public-holiday connector snapshots, and queued layouts updater.

- [ ] **Step 1: Write failing pure composition tests**

```ts
it('keeps a timed appointment primary while including a same-day holiday', () => {
  const items = composeCalendarItems({ events, holidays, includeHolidays: true, now })
  expect(items[0]).toMatchObject({ kind: 'event', title: 'Design sync' })
  expect(items).toContainEqual(expect.objectContaining({ kind: 'holiday', title: 'Labor Day' }))
})

it('deduplicates an ICS holiday and public holiday without mutating either source', () => {
  const eventCopy = structuredClone(events)
  const holidayCopy = structuredClone(holidays)
  expect(composeCalendarItems({ events, holidays, includeHolidays: true, now })
    .filter((item) => item.title === 'Labor Day')).toHaveLength(1)
  expect(events).toEqual(eventCopy)
  expect(holidays).toEqual(holidayCopy)
})

it.each(['locale', 'sunday', 'monday'] as const)('returns a complete %s month grid', (weekStart) => {
  expect(calendarMonthCells(new Date(2026, 7, 1), weekStart, 'en-US')).toHaveLength(42)
})
```

- [ ] **Step 2: Write failing atomic consolidation tests**

```ts
it('keeps the chosen placement and removes only other date placements', () => {
  const next = consolidateCalendarLayout(layout, {
    expectedRevision: layout.revision,
    keep: 'monthCal',
    defaultView: 'month',
    includePublicHolidays: true,
  })
  expect(next.widgets.ics).toMatchObject(layout.widgets.monthCal)
  expect(next.widgets.monthCal).toEqual({ kind: 'hidden' })
  expect(next.widgets.publicHolidays).toEqual({ kind: 'hidden' })
  expect(next.widgets.github).toEqual(layout.widgets.github)
})

it('Later and stale ownership perform zero writes', async () => {
  await controller.later()
  await expect(controller.save({ expectedRevision: 'stale' })).rejects.toThrow(/changed in another tab/i)
  expect(storage.set).not.toHaveBeenCalled()
})
```

- [ ] **Step 3: Observe RED in the Calendar and layout families**

Run: `npx vitest run src/newtab/widgets/calendar src/newtab/widgets/monthcal src/newtab/widgets/glance/PublicHolidaysWidget.test.tsx src/lib/layout/calendarConsolidation.test.ts src/lib/layout/namedLayouts.test.ts src/newtab/widgetRegistry.test.ts src/newtab/widgetSizeContracts.test.ts`

- [ ] **Step 4: Implement source adapters and tier faces**

Docked and Compact are agenda-led. Standard exposes a labelled 36px Agenda/Month switch and complete 42-cell Month grid. Full renders Month and Agenda together. Public Holidays remains a separate source adapter and never exposes Nager.Date or country copy in the widget. Missing or failed sources degrade independently.

- [ ] **Step 5: Implement explicit per-layout consolidation**

Detect legacy placements read-only. Render placement choices with Save and Later. Inside the queued updater, re-read the layout revision, preserve the selected anchor, layer, dock, stack position, and compatible tier, then atomically hide the other legacy identities for that layout. Later, Cancel, stale revision, and reload perform zero writes.

- [ ] **Step 6: Implement Settings and inspector authority**

Settings retains Calendars, Month week start, and Public Holidays country sections. Widget Inspector owns per-layout Default view and Include public holidays. Turning inclusion off preserves country and cache. The ordinary Standard switch writes only the active layout's companion preference and never its geometry.

- [ ] **Step 7: Run the focused Calendar gate and Chromium proof**

Run: `npx vitest run src/newtab/widgets/calendar src/newtab/widgets/monthcal src/newtab/widgets/glance/PublicHolidaysWidget.test.tsx src/lib/layout src/newtab/widgetRegistry.test.ts src/newtab/widgetSizeContracts.test.ts src/newtab/edit/WidgetInspector.test.tsx src/settings/SettingsPanel.test.tsx`

Run: `npx tsc -b --pretty false`

Build and inspect Docked, Compact, Standard Agenda, Standard Month, Full, GitHub + Calendar stack, migration Save, Later, Cancel, and stale two-tab rejection. Verify exact frames, 42 cells, no internal scrollbar, no capability URL, and no presentation-only layout write.

- [ ] **Step 8: Commit**

```powershell
git add src/newtab/widgets/calendar src/newtab/widgets/monthcal src/newtab/widgets/glance/PublicHolidaysWidget.tsx src/newtab/widgets/glance/PublicHolidaysWidget.test.tsx src/lib/layout src/newtab/widgetRegistry.ts src/newtab/widgetRegistry.test.ts src/newtab/widgetSizeContracts.ts src/newtab/widgetSizeContracts.test.ts src/newtab/edit/WidgetInspector.tsx src/newtab/edit/WidgetInspector.test.tsx src/settings src/newtab/index.css docs/superpowers/aurora-2
git commit -m "feat: unify Calendar presentations"
```

---

### Task 5: Weather, Sun, Moon, On This Day, and Aurora & Kp

**Files:**
- Modify: `src/newtab/widgets/weather/WeatherWidget.tsx`
- Modify: `src/newtab/widgets/weather/WeatherWidget.test.tsx`
- Modify: `src/newtab/widgets/sun/SunWidget.tsx`
- Modify: `src/newtab/widgets/sun/SunWidget.test.tsx`
- Modify: `src/newtab/widgets/moon/MoonWidget.tsx`
- Modify: `src/newtab/widgets/moon/MoonWidget.test.tsx`
- Modify: `src/newtab/widgets/glance/OnThisDayWidget.tsx`
- Modify: `src/newtab/widgets/glance/OnThisDayWidget.test.tsx`
- Modify: `src/newtab/widgets/glance/AuroraKpWidget.tsx`
- Modify: `src/newtab/widgets/glance/AuroraKpWidget.test.tsx`
- Modify: `src/newtab/index.css`

**Interfaces:**
- Consumes: Existing caches, retry ownership, weather details panel, and Task 1 presentation context.
- Produces: Approved visualization-led sky and glance faces.

- [ ] **Step 1: Add RED tests for signature scale and row budgets**

Assert Full Weather contains hourly forecast, daily forecast, AQI, pollen, UV, precipitation timing, sun, and wind; Standard contains current plus daily context; Compact contains current conditions; Docked retains the full temperature scale in one 44px line. Assert On This Day renders its heading once, date once, bounded distinct years, and a truthful Read more action.

- [ ] **Step 2: Run the five focused test files and observe RED**

Run: `npx vitest run src/newtab/widgets/weather/WeatherWidget.test.tsx src/newtab/widgets/sun/SunWidget.test.tsx src/newtab/widgets/moon/MoonWidget.test.tsx src/newtab/widgets/glance/OnThisDayWidget.test.tsx src/newtab/widgets/glance/AuroraKpWidget.test.tsx`

- [ ] **Step 3: Implement identity-specific faces without touching data owners**

Keep Weather movable to every corner and contain only its details expansion. Preserve cache retry, alert, civil-time, and unit behavior. Make Sun and Moon icons distinct; keep Docked smaller than Compact. Make Aurora & Kp's forecast visualization dominant and keep its stale state explicit.

- [ ] **Step 4: Verify and commit**

Run the five widget families, weather hooks, weather anchor tests, TypeScript, production build, and Weather + On This Day mixed-stack Chromium capture.

```powershell
git add src/newtab/widgets/weather src/newtab/widgets/sun src/newtab/widgets/moon src/newtab/widgets/glance src/newtab/index.css docs/superpowers/aurora-2
git commit -m "feat: redesign sky and glance widgets"
```

---

### Task 6: Work and service connector compositions

**Files:**
- Modify: `src/newtab/widgets/github/GithubWidget.tsx`
- Modify: `src/newtab/widgets/gitlab/GitlabWidget.tsx`
- Modify: `src/newtab/widgets/jira/JiraWidget.tsx`
- Modify: `src/newtab/widgets/linear/LinearWidget.tsx`
- Modify: `src/newtab/widgets/sentry/SentryWidget.tsx`
- Modify: `src/newtab/widgets/todoist/TodoistWidget.tsx`
- Modify: `src/newtab/widgets/vercel/VercelWidget.tsx`
- Modify: `src/newtab/widgets/status/StatusWidget.tsx`
- Modify: `src/newtab/widgets/homeassistant/HomeAssistantWidget.tsx`
- Modify: `src/newtab/widgets/rss/RssWidget.tsx`
- Modify: `src/newtab/widgets/crypto/CryptoWidget.tsx`
- Modify: Corresponding `*.test.tsx` files in each widget directory
- Modify: `src/newtab/widgets/shared/ContributionGraph.tsx`
- Modify: `src/newtab/widgets/shared/ContributionGraph.test.tsx`
- Modify: `src/newtab/index.css`

**Interfaces:**
- Consumes: Existing connector hooks, snapshots, direct-provider links, mutations, settings selections, and request contracts.
- Produces: Eleven provider-specific composition families with no shared generic list shell.

- [ ] **Step 1: Write RED tests for each approved signature**

GitHub and GitLab require visible graphs at every tier, with Full graph cells larger than Standard. Jira and Linear require prioritized issue rows. Sentry requires unresolved issue severity. Todoist requires due-task hierarchy and unchanged explicit completion confirmation. Vercel requires deployment status. Status requires named services including Claude. Home Assistant requires entity state and action separation. RSS requires bounded headlines. Crypto requires every selected coin that fits and valid single-coin state.

- [ ] **Step 2: Run all eleven component test files and observe RED**

Run: `npx vitest run src/newtab/widgets/github src/newtab/widgets/gitlab src/newtab/widgets/jira src/newtab/widgets/linear src/newtab/widgets/sentry src/newtab/widgets/todoist src/newtab/widgets/vercel src/newtab/widgets/status src/newtab/widgets/homeassistant src/newtab/widgets/rss src/newtab/widgets/crypto`

- [ ] **Step 3: Implement approved tier budgets using existing normalized data**

Do not change request URLs, scopes, credentials, cache writes, reconnect semantics, or provider mutations. Use bounded visible rows and trusted provider overflow actions. Remove redundant provider implementation copy and unexplained dots.

- [ ] **Step 4: Verify connector security and interaction boundaries**

Run connector component tests, connector service tests, backup redaction, request allowlists, ownership race tests, TypeScript, and production build. Capture GitHub + Calendar and Jira + Sentry mixed stacks plus all color modes.

- [ ] **Step 5: Commit**

```powershell
git add src/newtab/widgets src/newtab/index.css docs/superpowers/aurora-2
git commit -m "feat: redesign work and service widgets"
```

---

### Task 7: Browser-native resource compositions

**Files:**
- Modify: `src/newtab/widgets/readingList/ReadingListWidget.tsx`
- Modify: `src/newtab/widgets/readingList/ReadingListWidget.test.tsx`
- Modify: `src/newtab/widgets/recentlyClosed/RecentlyClosedWidget.tsx`
- Modify: `src/newtab/widgets/recentlyClosed/RecentlyClosedWidget.test.tsx`
- Modify: `src/newtab/widgets/downloads/DownloadsWidget.tsx`
- Modify: `src/newtab/widgets/downloads/DownloadsWidget.test.tsx`
- Modify: `src/newtab/widgets/tabGroups/TabGroupsWidget.tsx`
- Modify: `src/newtab/widgets/tabGroups/TabGroupsWidget.test.tsx`
- Modify: `src/newtab/widgets/browser/BrowserWidgetShell.tsx`
- Modify: `src/newtab/widgets/browser/BrowserWidgetShell.test.tsx`
- Modify: `src/newtab/index.css`

**Interfaces:**
- Consumes: Existing optional-permission prompts, ephemeral Chrome API adapters, restore/open actions, and no-storage contract.
- Produces: Bounded useful resource lists and one-line dock rails.

- [ ] **Step 1: Write RED maximum-data and dock tests**

For each identity, seed 25 normalized records. Assert Compact, Standard, and Full expose their exact bounded counts without internal framed-card scrollbars. Assert Docked exposes one readable primary item plus count/state. Assert every action keeps a unique accessible name.

- [ ] **Step 2: Run browser-native tests and observe RED**

Run: `npx vitest run src/newtab/widgets/readingList src/newtab/widgets/recentlyClosed src/newtab/widgets/downloads src/newtab/widgets/tabGroups src/newtab/widgets/browser`

- [ ] **Step 3: Implement the approved resource-specific faces**

Reading List leads with unread count and title/domain; Recently Closed shows type, title, age, and truthful restore identity; Downloads shows active file progress; Tab Groups shows window and group hierarchy. Keep results ephemeral and permissions feature-specific.

- [ ] **Step 4: Verify no storage writes, exact Chrome call allowlists, and build**

Run the browser-native widget families, storage equality tests, optional permission tests, TypeScript, and production build. Capture maximum data, permission required, empty, stale, partial, and hard-error states.

- [ ] **Step 5: Commit**

```powershell
git add src/newtab/widgets/readingList src/newtab/widgets/recentlyClosed src/newtab/widgets/downloads src/newtab/widgets/tabGroups src/newtab/widgets/browser src/newtab/index.css docs/superpowers/aurora-2
git commit -m "feat: redesign browser resource widgets"
```

---

### Task 8: Stabilized production catalog, mixed stacks, and final gate

**Files:**
- Create: `scripts/qa-widget-redesign-production.mjs`
- Create: `scripts/qa-widget-redesign-production.test.mjs`
- Create: `docs/superpowers/reports/WIDGET-REDESIGN-PRODUCTION-QA.md`
- Modify: `package.json`
- Modify: `docs/superpowers/aurora-2/STATUS.md`
- Modify: `docs/superpowers/aurora-2/ROADMAP.md`
- Modify: `docs/superpowers/aurora-2/DECISIONS.md`

**Interfaces:**
- Consumes: Exact production build, all runtime widget identities, approved catalog keys, named layouts, docks, stacks, themes, and state fixtures.
- Produces: Hash-bound production screenshots and one final QA verdict without Store mutation.

- [ ] **Step 1: Write RED harness contracts**

```js
test('requires exact reviewed dist provenance', () => {
  assert.equal(resolveBuildCommit(repoRoot), git(repoRoot, ['rev-parse', 'HEAD']))
})

test('pins every approved target and required mixed stack', () => {
  assert.deepEqual(new Set(productionCases.map((item) => item.target)), new Set(APPROVED_TARGET_IDS))
  assert.deepEqual(productionCases.filter((item) => item.kind === 'mixed-stack').map((item) => item.key).sort(), [
    'clock-quote', 'github-calendar', 'jira-sentry', 'tasks-notes', 'weather-on-this-day',
  ])
})
```

- [ ] **Step 2: Run harness tests and observe RED**

Run: `node --test scripts/qa-widget-redesign-production.test.mjs`

- [ ] **Step 3: Implement exact-build production QA**

Build from clean HEAD, verify `dist` provenance, seed existing-layout-shaped storage, load the unpacked extension in Chromium, and capture every free, stack, docked, state, and color case. Record exact geometry, clipping, overflow, minimum text size, focus, runtime errors, failed requests, unexpected requests, and storage writes.

- [ ] **Step 4: Run one stabilized gate**

Run: `npm test`

Run: `npx tsc -b --pretty false`

Run: `npm run build`

Run: `node scripts/qa-widget-redesign-production.mjs --exact`

Run: `git diff --check`

Expected: all automated checks pass; every capture is individually useful; exact 1408x445 headed witness has no collision, clipping, scrollbar, ordinary-click selection, or layout write.

- [ ] **Step 5: Record manual ceilings**

State explicitly that native Chrome permission prompts, live Home Assistant actions, private calendar availability, real screen-reader speech, physical touch, OS timezone changes, and genuine sleep/wake remain manual ceilings.

- [ ] **Step 6: Commit the verified program checkpoint**

```powershell
git add scripts/qa-widget-redesign-production.mjs scripts/qa-widget-redesign-production.test.mjs package.json docs/superpowers/reports/WIDGET-REDESIGN-PRODUCTION-QA.md docs/superpowers/aurora-2
git commit -m "docs: checkpoint production widget redesign"
```

Do not package, upload, save, submit, publish, distribute, or roll out through the Chrome Web Store. Those actions remain behind a new W6-P5 approval.
