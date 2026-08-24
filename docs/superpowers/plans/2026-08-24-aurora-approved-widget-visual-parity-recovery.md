# Aurora Approved Widget Visual Parity Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the production extension match the owner-approved widget gallery and canvas reference while preserving the owner's text-only exceptions, existing data authorities, and user-owned layout geometry.

**Architecture:** Keep the existing renderer, connector, storage, and exact-frame boundaries. Correct only presentation authority and authored composition: pass true free versus stack context to Focus and Service Status, give Service Status a content-tight free surface, center and scale the shared contribution graph with tier-specific rectangular geometry, and vertically balance Calendar. Extend the exact-build Playwright gates so visual dominance, centering, content fit, intrinsic surfaces, collisions, and provenance are measured instead of inferred from aggregate PASS counts.

**Tech Stack:** React 19, TypeScript 5.9, Tailwind CSS 4, Vitest, Testing Library, Node test runner, Playwright 1.62, Vite 6, Chrome Extension Manifest V3.

**Spec:** `docs/superpowers/specs/2026-08-24-aurora-approved-widget-visual-parity-recovery-design.md`

## Global Constraints

- Work only in `D:\DEV\Chrome plugin-aurora-2` on `feat/aurora-2-observatory`.
- Keep `D:\DEV\Chrome plugin` clean and unchanged at `eb1354b6a5b041fb6d494655c3dae1862572bc51`.
- Preserve the user-owned untracked file `docs/superpowers/TAKEOVER-2026-08-24-WIDGET-UI-RECOVERY.md`.
- Treat `mockups/widget-redesign/index.html?view=gallery` as the composition reference, never as production proof.
- Clock, Greeting, Quote, Focus, and Service Status are text-only when free-floating.
- Bookmarks remains the existing readable free bar with unchanged folder behavior.
- Search, Countdown, Quick Links, and the remaining instruments keep their approved panel compositions.
- Compact, Standard, and Full framed geometry remains exactly 216x132, 320x200, and 460x284 CSS px.
- Do not move, resize, reorder, consolidate, dock, stack, or otherwise rewrite a named layout automatically.
- Do not change connector, request, credential, permission, cache, backup, privacy, CSP, dependency, or storage authority.
- Calendar consolidation remains in Settings and retains its atomic revision and preference protections.
- No framed widget may introduce an internal scrollbar.
- Use focused TDD. Observe the intended failing assertion before each production edit.
- Use one bounded implementation review and at most one fix and rereview cycle.
- Do not rerun already-green broad suites between packets. Run one stabilized full gate after focused packets and review are complete.
- Do not push, merge, upload, submit, publish, roll out, or change Chrome Web Store state.

## File Structure

### Presentation authority

- Modify `src/newtab/widgetSizeContracts.ts` to classify free Service Status as intrinsic while retaining its exact stack sizes and state budgets.
- Modify `src/newtab/widgetSizeContracts.test.ts` to pin the owner-approved presentation classes.
- Modify `src/newtab/widgetRenderers.tsx` to pass real `free`, `stack`, or `docked` context to Focus and Service Status instead of forcing the approved stack face on free Focus.
- Modify `src/newtab/widgetRenderers.test.tsx` to pin renderer context propagation.
- Modify `src/newtab/widgets/status/StatusWidget.tsx` to share one data owner across authored free, stack, and dock presentations.
- Modify `src/newtab/widgets/status/StatusWidget.test.tsx` to prove content-tight free Status, exact stack Status, truthful states, and unchanged details behavior.
- Modify `src/newtab/components/FocusLine.test.tsx` to pin the already-authored free Focus surface through the renderer boundary.

### Contribution graphs

- Modify `src/newtab/widgets/shared/ContributionGraph.tsx` to own one centered tier geometry contract with independent cell width and row height.
- Modify `src/newtab/widgets/shared/ContributionGraph.test.tsx` to pin centering, tier geometry, month ticks, summary ownership, and accessibility.
- Modify `src/newtab/widgets/github/GithubWidget.tsx` and `src/newtab/widgets/github/GithubWidget.test.tsx` to consume shared geometry and preserve tier-specific supporting information.
- Modify `src/newtab/widgets/gitlab/GitlabWidget.tsx` and `src/newtab/widgets/gitlab/GitlabWidget.test.tsx` to consume the same geometry independently without changing GitLab view or yield rules.

### Calendar balance

- Modify `src/newtab/widgets/calendar/CalendarWidget.tsx` to center Standard content and vertically balance the Full Month and Agenda regions.
- Modify `src/newtab/widgets/calendar/CalendarWidget.test.tsx` to pin the balance hooks while preserving the complete month, row budgets, Settings preference writes, and no-layout-write rules.

### Browser evidence and ledgers

- Modify `scripts/qa-github-tiers.mjs` to capture both GitHub and GitLab, measure graph width coverage and centering, and assert material tier differentiation.
- Modify `scripts/qa-widget-redesign-production.mjs` and `scripts/qa-widget-redesign-production.test.mjs` to classify Focus and Service Status as intrinsic in the owner-visible free Canvas.
- Modify `scripts/qa-ui-recovery.mjs` to assert all five text-only identities where present and retain pairwise collision checks.
- Refresh generated evidence under `docs/superpowers/qa/ui-recovery/` and `docs/superpowers/catalog/widget-redesign/production/` only from an exact clean tracked commit.
- Create `docs/superpowers/reports/WIDGET-VISUAL-PARITY-RECOVERY-QA.md` after final evidence exists.
- Modify `docs/superpowers/aurora-2/STATUS.md`, `docs/superpowers/aurora-2/ROADMAP.md`, and `docs/superpowers/aurora-2/DECISIONS.md` only after owner visual approval.

---

### Task 1: Restore Free Focus and Service Status Presentation Authority

**Files:**
- Modify: `src/newtab/widgetSizeContracts.ts:157-181`
- Modify: `src/newtab/widgetSizeContracts.test.ts:103-192`
- Modify: `src/newtab/widgetRenderers.tsx:73-100`
- Modify: `src/newtab/widgetRenderers.test.tsx:1-70`
- Modify: `src/newtab/components/FocusLine.test.tsx:191-233`
- Modify: `src/newtab/widgets/status/StatusWidget.tsx:15-224`
- Modify: `src/newtab/widgets/status/StatusWidget.test.tsx:95-250`

**Interfaces:**
- Consumes: `WidgetRendererProps.presentation: 'free' | 'stack' | 'docked'` and the existing `TierFrame` `surface` contract.
- Produces: `StatusWidget({ canvasSize, presentation, docked })`, where free is content-tight, stack is exact framed geometry, and docked retains `StatusDock`.
- Preserves: one `useConnectorSnapshot` owner, the existing Status details dialog, state algebra, and Focus persistence actions.

- [ ] **Step 1: Write failing presentation-authority tests**

Add these assertions to `src/newtab/widgetSizeContracts.test.ts`:

```ts
expect(WIDGET_PRESENTATION_CONTRACTS.clock.presentationClass).toBe('intrinsic')
expect(WIDGET_PRESENTATION_CONTRACTS.greeting.presentationClass).toBe('intrinsic')
expect(WIDGET_PRESENTATION_CONTRACTS.quote.presentationClass).toBe('intrinsic')
expect(WIDGET_PRESENTATION_CONTRACTS.focus.presentationClass).toBe('intrinsic')
expect(WIDGET_PRESENTATION_CONTRACTS.status.presentationClass).toBe('intrinsic')
expect(WIDGET_PRESENTATION_CONTRACTS.bookmarks.presentationClass).toBe('bar')
```

Add renderer assertions to `src/newtab/widgetRenderers.test.tsx`:

```tsx
it.each(['focus', 'status'] as const)('passes the real free presentation to %s', (id) => {
  const element = WIDGET_RENDERERS[id]({ canvasSize: 'standard', presentation: 'free' }) as ReactElement<{
    presentation?: WidgetPresentationMode
  }>
  expect(element.props.presentation).toBe('free')
})

it.each(['focus', 'status'] as const)('passes stack presentation to %s', (id) => {
  const element = WIDGET_RENDERERS[id]({ canvasSize: 'standard', presentation: 'stack' }) as ReactElement<{
    presentation?: WidgetPresentationMode
  }>
  expect(element.props.presentation).toBe('stack')
})
```

Import `WidgetPresentationMode` in the renderer test. Import `within` from Testing Library plus `CanvasSize` and `WidgetPresentationMode` in the Status test.

- [ ] **Step 2: Write failing free and stack component tests**

Add a Focus renderer-boundary test to `src/newtab/components/FocusLine.test.tsx`:

```tsx
it('keeps free Focus content-tight and cardless while stack Focus retains its exact face', async () => {
  const free = setup(null)
  expect((await screen.findByText(/main focus today/i)).closest('[data-tier-frame]')).toBeNull()
  free.view.unmount()

  setupStack({ text: 'Ship the redesign', date: '2026-07-26', done: false })
  expect(await screen.findByRole('region', { name: 'Focus' })).toHaveProperty('dataset.tierFrame', 'standard')
})
```

Add Status tests to `src/newtab/widgets/status/StatusWidget.test.tsx`:

```tsx
function mount(
  storage: AuroraStorage,
  canvasSize: CanvasSize = 'standard',
  presentation: WidgetPresentationMode = 'stack',
) {
  return render(
    <StorageProvider storage={storage}>
      <StatusWidget canvasSize={canvasSize} presentation={presentation} />
    </StorageProvider>,
  )
}

it('renders free Service status as intrinsic text without a tier card', async () => {
  mount(await seededStorage(CONNECTED, ALL_GREEN), 'standard', 'free')
  const status = await screen.findByRole('region', { name: 'Service status' })
  expect(status.getAttribute('data-service-status-surface')).toBe('intrinsic')
  expect(status.closest('[data-tier-frame]')).toBeNull()
  expect(within(status).getByText('GitHub')).toBeTruthy()
  expect(within(status).getByText('Cloudflare')).toBeTruthy()
  expect(within(status).getByRole('button', { name: 'Service status details' })).toBeTruthy()
})

it('keeps Service status in an exact frame when it is a stack member', async () => {
  mount(await seededStorage(CONNECTED, ALL_GREEN), 'standard', 'stack')
  const status = await screen.findByRole('region', { name: 'Service status' })
  expect(status.getAttribute('data-tier-frame')).toBe('standard')
  expect(status.getAttribute('data-tier-surface')).toBe('card')
})

it('keeps free loading and empty states cardless', async () => {
  const loadingView = mount(await seededStorage(CONNECTED, null), 'standard', 'free')
  const loading = await screen.findByRole('region', { name: 'Service status' })
  expect(loading.getAttribute('data-service-status-surface')).toBe('intrinsic')
  expect(loading.closest('[data-tier-frame]')).toBeNull()
  loadingView.unmount()

  mount(await seededStorage(CONNECTED, { services: [] }), 'standard', 'free')
  const empty = await screen.findByRole('region', { name: 'Service status' })
  expect(empty.getAttribute('data-service-status-surface')).toBe('intrinsic')
  expect(empty.closest('[data-tier-frame]')).toBeNull()
})
```

Add `presentation="stack"` to the two existing direct `StatusWidget` rerenders for Standard and Full. The shared `mount` helper already keeps all other existing board-frame tests on stack presentation; the dock test remains unchanged.

- [ ] **Step 3: Run the focused tests and confirm the expected RED state**

Run:

```powershell
npm test -- src/newtab/widgetSizeContracts.test.ts src/newtab/widgetRenderers.test.tsx src/newtab/components/FocusLine.test.tsx src/newtab/widgets/status/StatusWidget.test.tsx
```

Expected: FAIL because Status is still classified as framed, Focus free is forced through `approvedCanvasFace`, Status receives no presentation prop, and free Status still returns `TierFrame`.

- [ ] **Step 4: Change only the presentation authority**

In `src/newtab/widgetSizeContracts.ts`, retain the existing sizes, states, budgets, and stack sizes but change the Status constructor from `framedContract` to `contract('intrinsic', ...)`:

```ts
status: contract('intrinsic', ['compact', 'standard'], NON_REJECTING_RESOURCE_STATES,
  'Service health', 'Service dots and active issues', undefined, 'Service health', {
    compact: tier('Service health at a glance', ['service names', 'service states'], ['named status dots'], [], ['tighten spacing', 'bound service names'], { kind: 'details', label: 'Service status details' }),
    standard: tier('Service health and active issues', ['service names', 'service states'], ['named status dots'], ['active issue context'], ['tighten spacing', 'bound issue rows'], { kind: 'details', label: 'Service status details' }),
  }, ['compact', 'standard']),
```

In `src/newtab/widgetRenderers.tsx`, pass the real context:

```tsx
focus: (props) => <FocusLine canvasSize={props.canvasSize} presentation={props.presentation} />,
status: (props) => <StatusWidget canvasSize={props.canvasSize} presentation={props.presentation} docked={props.docked} />,
```

Do not change `approvedCanvasFace` for World Clocks, Countdown, Search, or Quick Links. Those are intentional panels in the owner reference.

- [ ] **Step 5: Author one shared Status body with free and stack shells**

Import `WidgetPresentationMode` as a type and thread `presentation` through `StatusWidget` and `StatusInner`:

```tsx
export default function StatusWidget({
  canvasSize,
  presentation = 'free',
  docked,
}: {
  canvasSize?: CanvasSize
  presentation?: WidgetPresentationMode
  docked?: boolean
} = {}) {
  const [connectors] = useStoredKey('connectors')
  const status = connectors?.status as StatusConfig | undefined
  const services = statusServicesOf(status)
  if (!status?.enabled || services.length === 0) return null
  return (
    <StatusInner
      key={services.map((service) => service.url).join('\n')}
      config={status}
      services={services}
      canvasSize={canvasSize}
      presentation={presentation}
      docked={docked}
    />
  )
}
```

Split non-ready shells before building the ready body:

```tsx
const tier = canvasSize ?? 'standard'
if (!data) {
  if (docked) return null
  const frameState = resourceFrameState(state)
  if (presentation === 'stack') {
    return (
      <ResourceFrameStatus
        label="Service status"
        tier={tier}
        state={frameState === 'hard-error' ? 'hard-error' : 'loading'}
      />
    )
  }
  return (
    <StatusIntrinsicState
      state={frameState === 'hard-error' ? 'hard-error' : 'loading'}
      copy={frameState === 'hard-error' ? 'Service status unavailable.' : 'Checking service status...'}
    />
  )
}

const rows = data.services
if (rows.length === 0) {
  if (docked) return null
  if (presentation === 'stack') {
    return <ResourceFrameStatus label="Service status" tier={tier} state="empty" message="No service results right now." />
  }
  return <StatusIntrinsicState state="empty" copy="No service results right now." />
}
```

Build the ready body once, then choose its shell. The existing `trouble`, `dotClass`, and `dotTitle` authorities remain unchanged:

```tsx
const framed = presentation === 'stack'
const visibleRows = framed && tier === 'compact' ? rows.slice(0, 4) : rows
const body = (
  <>
    <div className="flex items-center justify-between gap-2">
      <h2 className="text-sm font-semibold">Service status</h2>
      <StatusDetailsTrigger rows={rows} tone={tone} label="Service status details" />
    </div>
    <span data-status-summary className="sr-only">{summaryValue}, {rows.length} services</span>
    <div data-work-pulse-detail data-work-pulse-status-dots data-testid="status-dots" className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
      {visibleRows.map((service, index) => (
        <span key={index} title={dotTitle(service)} className="flex min-w-0 items-center gap-1.5">
          <span className={`size-2 rounded-full ${dotClass(service.indicator)}`} aria-hidden />
          <span className={`max-w-24 truncate text-[11px] leading-4 ${presentation === 'free' ? 'text-canvas-fg-muted' : 'text-fg-muted'}`}>
            {service.name}
          </span>
        </span>
      ))}
    </div>
    {tier !== 'compact' ? trouble.map((service, index) => (
      <p
        key={index}
        data-work-pulse-rows
        className="text-photo mt-1 truncate text-sm text-red-400"
      >
        {service.name}{' \u2014 '}{service.description}
      </p>
    )) : null}
  </>
)

if (presentation === 'stack') {
  return (
    <TierFrame label="Service status" tier={tier} state={resourceFrameState(state)} data-status-tone={tone} className={`${tier === 'compact' ? 'p-2' : 'p-3'} text-left`}>
      {body}
    </TierFrame>
  )
}

return (
  <section
    aria-label="Service status"
    data-service-status-surface="intrinsic"
    data-status-tone={tone}
    className="text-photo grid w-fit max-w-[320px] gap-1 text-left text-canvas-fg"
  >
    {body}
  </section>
)
```

Add one exact intrinsic state shell:

```tsx
function StatusIntrinsicState({
  state,
  copy,
}: {
  state: 'loading' | 'empty' | 'hard-error'
  copy: string
}) {
  return (
    <section
      aria-label="Service status"
      data-service-status-surface="intrinsic"
      className="text-photo w-fit text-sm text-canvas-fg-muted"
    >
      <p role={state === 'hard-error' ? 'alert' : 'status'}>{copy}</p>
    </section>
  )
}
```

Use `StatusIntrinsicState` for free loading, empty, and hard-error states. Keep `ResourceFrameStatus` only for stack states. Keep the existing dock branch first and unchanged.

Update the existing trouble-line test to call `mount(storage, 'standard', 'free')` and assert the free presentation remains visible at the owner witness size: keep `text-photo` and `text-red-400`, and assert the line no longer carries `hidden` or `tallest:block`.

- [ ] **Step 6: Run focused tests and TypeScript**

Run:

```powershell
npm test -- src/newtab/widgetSizeContracts.test.ts src/newtab/widgetRenderers.test.tsx src/newtab/components/FocusLine.test.tsx src/newtab/widgets/status/StatusWidget.test.tsx src/newtab/workPulsePresentation.test.ts
npx tsc --noEmit
```

Expected: PASS. Confirm the Status details dialog still opens, Escape still restores focus, and the storage-owner assertions remain green.

- [ ] **Step 7: Commit the intrinsic presentation packet**

```powershell
git add -- src/newtab/widgetSizeContracts.ts src/newtab/widgetSizeContracts.test.ts src/newtab/widgetRenderers.tsx src/newtab/widgetRenderers.test.tsx src/newtab/components/FocusLine.test.tsx src/newtab/widgets/status/StatusWidget.tsx src/newtab/widgets/status/StatusWidget.test.tsx
git diff --cached --check
git commit -m "fix: restore intrinsic focus and service status"
```

---

### Task 2: Center and Scale GitHub & GitLab Contribution Graphs

**Files:**
- Modify: `src/newtab/widgets/shared/ContributionGraph.tsx:26-112`
- Modify: `src/newtab/widgets/shared/ContributionGraph.test.tsx:21-50`
- Modify: `src/newtab/widgets/github/GithubWidget.tsx:250-352`
- Modify: `src/newtab/widgets/github/GithubWidget.test.tsx:1-230`
- Modify: `src/newtab/widgets/gitlab/GitlabWidget.tsx:384-488`
- Modify: `src/newtab/widgets/gitlab/GitlabWidget.test.tsx:299-354`

**Interfaces:**
- Produces: `CONTRIBUTION_GRAPH_GEOMETRY: Readonly<Record<CanvasSize, { columnWidth: number; rowHeight: number; gap: number }>>`.
- Produces: `ContributionGraph({ contributions, tier, showMonthTicks, showSummary })` with a centered `data-contribution-composition` root.
- Consumes: the existing `buildContributionGrid()` column-major cells, month ticks, and streak.
- Preserves: GitHub and GitLab data, view gates, rows, links, state handling, GitLab yield rules, and one snapshot owner.

- [ ] **Step 1: Write failing shared-geometry tests**

Replace pixel tests that only assert one square dimension with tier tests in `ContributionGraph.test.tsx`:

```tsx
const CONTRIBUTIONS_112_DAYS: Contributions = {
  total: 224,
  days: Array.from({ length: 112 }, (_, index) => {
    const date = new Date(2026, 0, 1)
    date.setDate(date.getDate() + index)
    return {
      date: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
      count: index % 5,
    }
  }),
}

it.each([
  ['compact', '10px', '7px', '1px'],
  ['standard', '16px', '10px', '1px'],
  ['full', '23px', '17px', '2px'],
] as const)('centers the %s contribution composition with authored rectangular cells', (tier, width, height, gap) => {
  const { container } = render(
    <ContributionGraph contributions={CONTRIBUTIONS_112_DAYS} tier={tier} showMonthTicks={tier === 'full'} />,
  )
  const shell = container.querySelector('[data-contribution-composition]')!
  const graph = screen.getByRole('img', { name: /contribution activity/i })
  expect(shell.className).toContain('mx-auto')
  expect(shell.className).toContain('w-fit')
  expect(graph.style.gridAutoColumns).toBe(width)
  expect(graph.style.gridTemplateRows).toBe(`repeat(7, ${height})`)
  expect(graph.style.gap).toBe(gap)
})
```

Retain tests proving month labels stay at 11px, the summary can move to the parent, empty pad cells remain transparent, and every real cell has a truthful contribution/date title.

Pass `tier="standard"` in every remaining direct `ContributionGraph` render in this test file so the required tier prop is explicit.

- [ ] **Step 2: Write failing GitHub and GitLab tier tests**

In the GitHub connector test, replace the current tier geometry case with:

```tsx
it.each([
  ['compact', '10px', '7px', false],
  ['standard', '16px', '10px', false],
  ['full', '23px', '17px', true],
] as const)('uses the centered %s contribution geometry', async (tier, width, height, showsMonths) => {
  const config = {
    ...CONNECTED,
    views: { commitGraph: true, pulls: true, issues: true, notifications: true },
  }
  mount(await seededStorage(config, DATA_WITH_GRAPH), tier)
  const graph = await screen.findByRole('img', { name: /contribution activity/i })
  expect(graph.style.gridAutoColumns).toBe(width)
  expect(graph.style.gridTemplateRows).toBe(`repeat(7, ${height})`)
  expect(graph.closest('[data-contribution-composition]')?.className).toContain('mx-auto')
  expect(document.querySelector('[data-contribution-months]') !== null).toBe(showsMonths)
})
```

In the GitLab connector test, use its existing multi-connector fixture:

```tsx
it.each([
  ['compact', '10px', '7px', false],
  ['standard', '16px', '10px', false],
  ['full', '23px', '17px', true],
] as const)('uses the centered %s contribution geometry', async (tier, width, height, showsMonths) => {
  mount(await seededMulti(ALL_ON, FULL_DATA), tier)
  const graph = await screen.findByRole('img', { name: /contribution activity/i })
  expect(graph.style.gridAutoColumns).toBe(width)
  expect(graph.style.gridTemplateRows).toBe(`repeat(7, ${height})`)
  expect(graph.closest('[data-contribution-composition]')?.className).toContain('mx-auto')
  expect(document.querySelector('[data-contribution-months]') !== null).toBe(showsMonths)
})
```

Keep GitHub's Compact zero-row, Standard one-row, and Full two-family assertions. Keep GitLab's existing independent merge request, review ask, to-do, and GitHub-yield tests.

- [ ] **Step 3: Run focused tests and confirm the expected RED state**

Run:

```powershell
npm test -- src/newtab/widgets/shared/ContributionGraph.test.tsx src/newtab/widgets/github/GithubWidget.test.tsx src/newtab/widgets/gitlab/GitlabWidget.test.tsx
```

Expected: FAIL because the graph accepts one square `cell`, its root is not centered, and GitHub and GitLab use different Full geometry.

- [ ] **Step 4: Implement the shared tier geometry**

In `ContributionGraph.tsx`, import `CanvasSize` and define:

```ts
export const CONTRIBUTION_GRAPH_GEOMETRY = Object.freeze({
  compact: Object.freeze({ columnWidth: 10, rowHeight: 7, gap: 1 }),
  standard: Object.freeze({ columnWidth: 16, rowHeight: 10, gap: 1 }),
  full: Object.freeze({ columnWidth: 23, rowHeight: 17, gap: 2 }),
}) satisfies Readonly<Record<CanvasSize, Readonly<{
  columnWidth: number
  rowHeight: number
  gap: number
}>>>
```

Replace `cell` and `gap` props with required `tier`. Calculate width from `columnWidth`, keep month tick pitch aligned to `columnWidth + gap`, and use a centered root:

```tsx
const { columnWidth, rowHeight, gap } = CONTRIBUTION_GRAPH_GEOMETRY[tier]
const width = columns * columnWidth + (columns - 1) * gap
const pitch = columnWidth + gap

return (
  <div data-contribution-composition data-contribution-tier={tier} className="mx-auto w-fit max-w-full">
    <div
      role="img"
      aria-label={`Contribution activity over the last ${dayCount} days`}
      className="grid grid-flow-col"
      style={{
        width,
        gridTemplateRows: `repeat(7, ${rowHeight}px)`,
        gridAutoColumns: `${columnWidth}px`,
        gap: `${gap}px`,
      }}
    >
      {cells.map((cell, index) => (
        <div
          key={index}
          title={cell ? `${cell.count} contribution${cell.count === 1 ? '' : 's'} · ${cell.date}` : undefined}
          className="rounded-[3px]"
          style={{
            width: columnWidth,
            height: rowHeight,
            background: cell ? LEVEL_BG[cell.level] : 'transparent',
            boxShadow: cell ? 'inset 0 0 0 1px rgba(245,245,244,0.04)' : undefined,
          }}
        />
      ))}
    </div>
    {showMonthTicks && (
      <div data-contribution-months className="relative mt-1.5" style={{ width, height: 12 }} aria-hidden>
        {monthTicks.map((month) => (
          <span
            key={month.col}
            className="absolute font-mono text-[11px] uppercase tracking-wide text-fg-muted/55"
            style={{ left: month.col * pitch }}
          >
            {month.text}
          </span>
        ))}
      </div>
    )}
    {showSummary ? (
      <p data-contribution-summary className="mt-2 text-xs text-fg-muted">
        <span className="font-semibold tabular-nums text-fg">{contributions.total}</span> contributions
        <span aria-hidden className="mx-1.5 text-fg-muted/40"> · </span>
        <span className="font-semibold tabular-nums text-accent">{streak}</span>
        <span> day streak</span>
      </p>
    ) : null}
  </div>
)
```

- [ ] **Step 5: Consume the same geometry in both connectors**

Replace both call sites with:

```tsx
<ContributionGraph
  contributions={graph}
  tier={tier}
  showMonthTicks={tier === 'full'}
  showSummary={tier !== 'full'}
/>
```

Do not change connector row selection, details links, view settings, or GitLab's rule that yields its graph when GitHub owns the shared forge graph slot outside framed mode.

- [ ] **Step 6: Run the focused graph tests and TypeScript**

Run:

```powershell
npm test -- src/newtab/widgets/shared/contributionGrid.test.ts src/newtab/widgets/shared/ContributionGraph.test.tsx src/newtab/widgets/github/GithubWidget.test.tsx src/newtab/widgets/gitlab/GitlabWidget.test.tsx
npx tsc --noEmit
```

Expected: PASS. Standard and Full remain materially different through month context, row families, and graph geometry. GitLab's independent view and yield suites remain green.

- [ ] **Step 7: Commit the contribution graph packet**

```powershell
git add -- src/newtab/widgets/shared/ContributionGraph.tsx src/newtab/widgets/shared/ContributionGraph.test.tsx src/newtab/widgets/github/GithubWidget.tsx src/newtab/widgets/github/GithubWidget.test.tsx src/newtab/widgets/gitlab/GitlabWidget.tsx src/newtab/widgets/gitlab/GitlabWidget.test.tsx
git diff --cached --check
git commit -m "fix: center and scale contribution graphs"
```

---

### Task 3: Vertically Balance Calendar Without Changing Its Authorities

**Files:**
- Modify: `src/newtab/widgets/calendar/CalendarWidget.tsx:211-250`
- Modify: `src/newtab/widgets/calendar/CalendarWidget.test.tsx:430-580`

**Interfaces:**
- Consumes: the existing `CalendarMonth`, `CalendarAgenda`, `CalendarViewTabs`, `calendarPreferenceFor`, and `updateCalendarLayoutPreference` boundaries.
- Produces: `data-calendar-standard-composition` and `data-calendar-full-composition` measurement hooks.
- Preserves: complete 42-cell month grids, Standard Agenda or Month choice, Full combined view, public holiday inclusion, Calendar Settings consolidation, and zero layout writes from view changes.

- [ ] **Step 1: Write failing Calendar balance tests**

Add focused structural tests:

```tsx
it('centers the Standard selected view inside the exact frame', async () => {
  const storage = await seededStorage(CONNECTED, { events: [EVENT_NEXT, EVENT_B] })
  await storage.set('calendarPreferences', {
    work: { defaultView: 'month', includePublicHolidays: false },
  })
  mountUnified(storage, 'standard')
  await act(async () => {})
  const frame = await screen.findByRole('region', { name: 'Calendar' })
  const composition = frame.querySelector('[data-calendar-standard-composition]')!
  expect(frame.className).toContain('justify-center')
  expect(composition).toBeTruthy()
  expect(within(frame).getByRole('table').querySelectorAll('[data-calendar-cell]')).toHaveLength(42)
})

it('vertically balances the Full month and agenda regions', async () => {
  const storage = await seededStorage(CONNECTED, { events: [EVENT_NEXT, EVENT_B] })
  await storage.set('calendarPreferences', {
    work: { defaultView: 'agenda', includePublicHolidays: false },
  })
  mountUnified(storage, 'full')
  await act(async () => {})
  const frame = await screen.findByRole('region', { name: 'Calendar' })
  const composition = frame.querySelector('[data-calendar-full-composition]')!
  expect(composition.className).toContain('items-center')
  expect(within(frame).getByTestId('calendar-full-month')).toBeTruthy()
  expect(within(frame).getByTestId('calendar-full-agenda')).toBeTruthy()
  expect(within(frame).getByRole('table').querySelectorAll('[data-calendar-cell]')).toHaveLength(42)
})
```

Import `within` alongside the existing Testing Library imports.

Retain the existing test that toggling Agenda and Month updates only `calendarPreferences`, never `layouts`.

- [ ] **Step 2: Run Calendar tests and confirm the expected RED state**

Run:

```powershell
npm test -- src/newtab/widgets/calendar/CalendarWidget.test.tsx src/lib/layout/calendarPreferences.test.ts src/settings/sections/CalendarConsolidationSettings.test.tsx
```

Expected: FAIL because the new composition hooks and centering classes are absent. Existing preference and consolidation tests remain green.

- [ ] **Step 3: Implement the minimal balance classes**

Wrap Standard content without changing its branch logic:

```tsx
<TierFrame
  label="Calendar"
  tier="standard"
  state={items.length > 0 ? 'ready' : 'empty'}
  className="justify-center gap-1.5 px-3 py-2.5"
>
  <div data-calendar-standard-composition className="min-h-0 w-full">
    {preference.defaultView === 'month' ? (
      <CalendarMonth
        items={items}
        todayKey={localDay.key}
        weekStart={weekStart ?? 'locale'}
        viewControl={viewTabs}
      />
    ) : (
      <>
        <div className="flex min-h-7 items-center justify-between gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-fg-muted">Calendar</span>
          {viewTabs}
        </div>
        <CalendarAgenda
          items={items}
          limit={4}
          timeZone={localDay.timeZone}
          emptyLabel="Nothing coming up."
        />
      </>
    )}
  </div>
</TierFrame>
```

Balance the Full regions inside the existing exact frame:

```tsx
<TierFrame label="Calendar" tier="full" state={items.length > 0 ? 'ready' : 'empty'} className="p-4">
  <div
    data-calendar-full-composition
    className="grid min-h-0 flex-1 grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] items-center gap-5"
  >
    <div data-testid="calendar-full-month" className="min-w-0">
      <CalendarMonth items={items} todayKey={localDay.key} weekStart={weekStart ?? 'locale'} roomy />
    </div>
    <section data-testid="calendar-full-agenda" aria-label="Agenda" className="min-w-0 border-l border-panel-border pl-4">
      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-fg-muted">Agenda</p>
      <CalendarAgenda items={items} limit={8} timeZone={localDay.timeZone} emptyLabel="Nothing coming up." />
    </section>
  </div>
</TierFrame>
```

Do not change Calendar item composition, row limits, event ordering, month navigation, preference keys, or consolidation code.

- [ ] **Step 4: Run focused Calendar tests and TypeScript**

Run:

```powershell
npm test -- src/newtab/widgets/calendar/CalendarWidget.test.tsx src/newtab/widgets/calendar/calendarComposition.test.ts src/lib/layout/calendarPreferences.test.ts src/settings/sections/CalendarConsolidationSettings.test.tsx
npx tsc --noEmit
```

Expected: PASS with 42 visible month cells, bounded agenda rows, correct public holiday behavior, and no layout write from ordinary view switching.

- [ ] **Step 5: Commit the Calendar balance packet**

```powershell
git add -- src/newtab/widgets/calendar/CalendarWidget.tsx src/newtab/widgets/calendar/CalendarWidget.test.tsx
git diff --cached --check
git commit -m "fix: balance calendar tier compositions"
```

---

### Task 4: Strengthen Exact Browser Evidence for the Approved Visual Contract

**Files:**
- Modify: `scripts/qa-github-tiers.mjs:17-150`
- Modify: `scripts/qa-widget-redesign-production.mjs:16-315`
- Modify: `scripts/qa-widget-redesign-production.test.mjs:14-56`
- Modify: `scripts/qa-ui-recovery.mjs:20-233`
- Refresh: `docs/superpowers/qa/ui-recovery/github-tiers/*.png`
- Refresh: `docs/superpowers/qa/ui-recovery/github-tiers/evidence.json`
- Refresh: `docs/superpowers/qa/ui-recovery/acceptance/*.png`
- Refresh: `docs/superpowers/qa/ui-recovery/acceptance/evidence.json`
- Refresh: `docs/superpowers/catalog/widget-redesign/production/*`

**Interfaces:**
- Produces: exact card-level evidence for both `github` and `gitlab` at all three tiers.
- Produces: measurements `{ widthCoverage, areaCoverage, centerDelta, rowCount, hasMonthTicks, hasParallelRows }` for every contribution capture.
- Produces: an owner-visible Canvas where `bookmarks`, `clock`, `greeting`, `quote`, `focus`, and `status` are explicitly inspected as non-card free surfaces, with Bookmarks separately pinned as a bar.
- Preserves: exact HEAD provenance, zero unexpected network requests, pairwise collision checks, internal-scroll checks, and the existing Calendar Settings transaction evidence.

- [ ] **Step 1: Write failing Node contract assertions for the owner-visible inventory**

Update `scripts/qa-widget-redesign-production.test.mjs`:

```js
assert.deepEqual(
  OWNER_VISIBLE_CANVAS_CASE.intrinsic,
  ['bookmarks', 'clock', 'focus', 'greeting', 'quote', 'status'],
)
```

Retain assertions for the same free layout, Standard Quick Links, Standard Calendar, Compact Tasks, and no stacks.

- [ ] **Step 2: Run the Node contract test and confirm RED**

Run:

```powershell
node --test scripts/qa-widget-redesign-production.test.mjs
```

Expected: FAIL because Focus and Service Status are missing from the intrinsic authority list.

- [ ] **Step 3: Update production catalog intrinsic checks**

In `OWNER_VISIBLE_CANVAS_CASE`, use the sorted intrinsic authority:

```js
intrinsic: Object.freeze(['bookmarks', 'clock', 'focus', 'greeting', 'quote', 'status']),
```

Remove `focus` and `status` from the `framed` map in `inspectOwnerVisibleCanvas`. Add them to the intrinsic selector map:

```js
for (const [id, selector] of Object.entries({
  clock: '[data-clock-face]',
  focus: '[data-focus-footprint]',
  quote: 'figure',
  status: '[data-service-status-surface="intrinsic"]',
})) {
  // existing tier frame count and non-empty content assertions
}
```

Keep the separate Greeting and Bookmarks assertions because they also verify full-text fallback and the Chrome folder bar.

- [ ] **Step 4: Generalize the close contribution-card harness to GitHub and GitLab**

In `scripts/qa-github-tiers.mjs`, replace `githubLayout` with:

```js
const CONNECTORS = Object.freeze(['github', 'gitlab'])

function contributionLayout(authorityIds, connector, tier) {
  const widgets = Object.fromEntries(authorityIds.map((id) => [id, { kind: 'hidden' }]))
  widgets[connector] = { kind: 'free', anchor: 'center', offsetX: 0, offsetY: 0, tier, layer: 1 }
  const layout = { id: `${connector}-${tier}`, name: `${connector} ${tier}`, widgets, stacks: [] }
  return { version: 1, activeLayoutId: layout.id, layouts: [layout] }
}
```

Loop `connector` and `tier`. Measure the graph relative to the frame:

```js
const leftInset = graphRect.left - frameRect.left
const rightInset = frameRect.right - graphRect.right
return {
  connector,
  tier,
  graph: {
    width: graphRect.width,
    height: graphRect.height,
    widthCoverage: graphRect.width / frameRect.width,
    areaCoverage: graphRect.width * graphRect.height / (frameRect.width * frameRect.height),
    centerDelta: Math.abs(leftInset - rightInset),
  },
  hasParallelRows: connector === 'github'
    ? node.querySelector('[data-github-row-families="parallel"]') !== null
    : node.querySelector('[aria-label="GitLab merge request queues"].grid-cols-2') !== null,
  // retain overflow, text fallback, row, month, and summary measurements
}
```

Use these exact minimums:

```js
const MIN_GRAPH_WIDTH = Object.freeze({ compact: 0.80, standard: 0.85, full: 0.85 })
const MIN_GRAPH_AREA = Object.freeze({ compact: 0.28, standard: 0.30, full: 0.38 })
```

Assert `centerDelta <= 2`, graph width and height both grow Compact < Standard < Full, Full width and height are each at least twice Compact, Full adds month context, and Full reports `hasParallelRows === true`. Apply those assertions independently to GitHub and GitLab. Save `github-*.png` and `gitlab-*.png` close card captures plus one combined `evidence.json`.

- [ ] **Step 5: Extend the recovery Canvas intrinsic assertions**

Where `scripts/qa-ui-recovery.mjs` asserts cardless identities, use:

```js
for (const id of ['clock', 'focus', 'greeting', 'quote', 'status']) {
  const item = page.locator(`[data-testid="canvas-item-${id}"]`)
  if (await item.count() === 0) continue
  assert.equal(await item.locator('[data-tier-frame]').count(), 0, `${id} was forced into a card`)
}
```

Keep exact provenance mandatory, the Settings Calendar atomic write check, 1600x900 and 1408x445 bounds, and the pairwise collision loop.

- [ ] **Step 6: Run harness contract tests and TypeScript**

Run:

```powershell
node --test scripts/qa-widget-redesign-production.test.mjs scripts/widget-redesign-catalog-contracts.test.mjs scripts/qa-widget-redesign-catalog.test.mjs
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 7: Commit the browser-harness changes before building**

```powershell
git add -- scripts/qa-github-tiers.mjs scripts/qa-widget-redesign-production.mjs scripts/qa-widget-redesign-production.test.mjs scripts/qa-ui-recovery.mjs
git diff --cached --check
git commit -m "test: measure approved widget visual parity"
```

- [ ] **Step 8: Build the exact committed source**

Run:

```powershell
npm run build
```

Expected: PASS. Confirm `dist/build-provenance.json` names the current `git rev-parse HEAD` commit before any browser script runs.

- [ ] **Step 9: Run focused real Chromium evidence**

Run once each:

```powershell
node scripts/qa-github-tiers.mjs
node scripts/qa-ui-recovery.mjs
npm run qa:widget-redesign-production
```

Expected:

- Six close contribution captures, three GitHub and three GitLab.
- Center delta at most 2 CSS px in every tier.
- Width and area coverage above the declared thresholds.
- No frame clipping, internal scrolling, unexplained text clipping, collision, console error, page error, failed request, unexpected request, or unapproved storage write.
- Owner-visible free Focus and Service Status have zero tier frames.
- Calendar Settings still performs one atomic `layouts` plus `calendarPreferences` write.

- [ ] **Step 10: Inspect the generated images at original resolution**

Inspect at minimum:

```text
docs/superpowers/qa/ui-recovery/github-tiers/github-compact.png
docs/superpowers/qa/ui-recovery/github-tiers/github-standard.png
docs/superpowers/qa/ui-recovery/github-tiers/github-full.png
docs/superpowers/qa/ui-recovery/github-tiers/gitlab-compact.png
docs/superpowers/qa/ui-recovery/github-tiers/gitlab-standard.png
docs/superpowers/qa/ui-recovery/github-tiers/gitlab-full.png
docs/superpowers/qa/ui-recovery/acceptance/canvas-1600x900.png
docs/superpowers/qa/ui-recovery/acceptance/canvas-1408x445.png
docs/superpowers/catalog/widget-redesign/production/owner-visible-canvas.png
docs/superpowers/catalog/widget-redesign/production/github-calendar-dark-github.png
docs/superpowers/catalog/widget-redesign/production/github-calendar-dark-calendar.png
```

Reject the packet if a graph is technically inside its card but visually stranded, Calendar still crowds the top edge, intrinsic text carries a card, card data clips, or the full Canvas contains collisions.

- [ ] **Step 11: Commit exact evidence**

```powershell
git add -- docs/superpowers/qa/ui-recovery docs/superpowers/catalog/widget-redesign/production docs/superpowers/reports/WIDGET-REDESIGN-PRODUCTION-QA.md
git diff --cached --check
git commit -m "docs: capture approved widget visual parity evidence"
```

---

### Task 5: Run One Bounded Review and the Stabilized Product Gate

**Files:**
- Review: all files changed since `af947e5`
- Create: `docs/superpowers/reports/WIDGET-VISUAL-PARITY-RECOVERY-QA.md`
- Modify after owner approval: `docs/superpowers/aurora-2/STATUS.md`
- Modify after owner approval: `docs/superpowers/aurora-2/ROADMAP.md`
- Modify after owner approval: `docs/superpowers/aurora-2/DECISIONS.md`

**Interfaces:**
- Consumes: all focused packet commits and exact browser evidence.
- Produces: one reviewed, exact-build acceptance record and owner-visible screenshot handoff.
- Preserves: the protected checkout and Chrome Web Store gate.

- [ ] **Step 1: Run one bounded read-only implementation review**

Review the range:

```powershell
git diff --stat af947e5..HEAD
git diff --check af947e5..HEAD
git diff af947e5..HEAD -- src/newtab scripts
```

Review only for Critical or Important defects in:

- free versus stack presentation authority;
- duplicate data owners or storage writes;
- Status loading, empty, details, and focus restoration;
- contribution graph overflow, centering, tier differentiation, and long text fallback;
- GitLab independent view and yield behavior;
- Calendar preference and consolidation authority;
- false PASS paths in provenance, collision, clipping, and visual dominance checks.

- [ ] **Step 2: Apply at most one focused fix and rereview cycle**

If the review finds a Critical or Important defect, first add or tighten the smallest failing test, confirm RED, apply the focused fix, rerun only the affected tests, and commit:

```powershell
git add -- src/newtab/widgetSizeContracts.ts src/newtab/widgetSizeContracts.test.ts src/newtab/widgetRenderers.tsx src/newtab/widgetRenderers.test.tsx src/newtab/components/FocusLine.test.tsx src/newtab/widgets/status/StatusWidget.tsx src/newtab/widgets/status/StatusWidget.test.tsx src/newtab/widgets/shared/ContributionGraph.tsx src/newtab/widgets/shared/ContributionGraph.test.tsx src/newtab/widgets/github/GithubWidget.tsx src/newtab/widgets/github/GithubWidget.test.tsx src/newtab/widgets/gitlab/GitlabWidget.tsx src/newtab/widgets/gitlab/GitlabWidget.test.tsx src/newtab/widgets/calendar/CalendarWidget.tsx src/newtab/widgets/calendar/CalendarWidget.test.tsx scripts/qa-github-tiers.mjs scripts/qa-widget-redesign-production.mjs scripts/qa-widget-redesign-production.test.mjs scripts/qa-ui-recovery.mjs
git diff --cached --check
git commit -m "fix: close widget visual parity review findings"
```

Then rereview only the fix diff and original finding. Do not start a second broad review cycle.

- [ ] **Step 3: Run the stabilized code gate once**

Run:

```powershell
npm test
npx tsc --noEmit
node --test scripts/widget-redesign-catalog-contracts.test.mjs scripts/qa-widget-redesign-catalog.test.mjs scripts/qa-widget-redesign-production.test.mjs
```

Expected: all tests PASS with no new skipped coverage attributed to this packet.

- [ ] **Step 4: Commit any final reviewed code before rebuilding**

If Step 2 changed production or harness code, confirm those changes are committed and `git status --short` contains only the preserved user-owned takeover file before building.

- [ ] **Step 5: Rebuild once from the exact reviewed commit**

Run:

```powershell
npm run build
```

Assert:

```powershell
$head = git rev-parse HEAD
$built = (Get-Content -Raw 'dist/build-provenance.json' | ConvertFrom-Json).commit
if ($head -ne $built) { throw "dist provenance mismatch: HEAD=$head dist=$built" }
```

- [ ] **Step 6: Run the stabilized browser gate once**

Run:

```powershell
node scripts/qa-github-tiers.mjs
node scripts/qa-ui-recovery.mjs
npm run qa:widget-redesign-production
```

Expected: every exact-provenance browser gate PASS, all required close captures exist, and the production catalog covers all approved target identities and mixed stacks.

- [ ] **Step 7: Write the QA report from observed evidence**

Create `docs/superpowers/reports/WIDGET-VISUAL-PARITY-RECOVERY-QA.md` with these sections and only measured values from the final run:

```markdown
# Widget Visual Parity Recovery QA

Source commit: recorded in `docs/superpowers/qa/ui-recovery/github-tiers/evidence.json`
Build provenance: exact match to the source commit required by every browser script

## Focused packets

- Intrinsic Focus and Service Status
- GitHub and GitLab graph centering and scale
- Calendar vertical balance
- Exact-browser acceptance strengthening

## Automated evidence

- Focused Vitest results
- Full Vitest result
- TypeScript result
- Node catalog contract result
- Exact production build result
- GitHub and GitLab tier measurements
- UI recovery result
- Production catalog result

## Original-resolution inspection

- Free text surfaces
- Bookmark bar preservation
- Contribution graph hierarchy
- Calendar balance
- Whole-canvas collisions and control coverage
- Dark, light, and saturated themes

## Manual ceilings

- Native Chrome permission prompts
- Live private connectors
- Real screen-reader speech
- Physical touch
- OS timezone transitions
- Chrome Web Store state

## Result

`READY FOR OWNER VISUAL REVIEW`
```

Do not write `PASS` for owner visual acceptance before the owner reviews the production screenshots.

- [ ] **Step 8: Commit the stabilized evidence report**

```powershell
git add -- docs/superpowers/qa/ui-recovery docs/superpowers/catalog/widget-redesign/production docs/superpowers/reports/WIDGET-REDESIGN-PRODUCTION-QA.md docs/superpowers/reports/WIDGET-VISUAL-PARITY-RECOVERY-QA.md
git diff --cached --check
git commit -m "docs: record widget visual parity recovery QA"
```

- [ ] **Step 9: Stop at the owner visual gate**

Present the six close contribution cards, the close Calendar capture, and the owner-visible 1600x900 production Canvas. State the exact reviewed commit and any truthful manual ceilings. Ask the owner whether production now matches the intended gallery and screenshot.

Do not update A2-D081, mark the recovery Verified, or declare the visual work complete until the owner explicitly approves these production captures.

---

### Task 6: Record Owner Acceptance and Close the Recovery Packet

**Files:**
- Modify: `docs/superpowers/aurora-2/STATUS.md`
- Modify: `docs/superpowers/aurora-2/ROADMAP.md`
- Modify: `docs/superpowers/aurora-2/DECISIONS.md`
- Modify: `docs/superpowers/reports/WIDGET-VISUAL-PARITY-RECOVERY-QA.md`

**Interfaces:**
- Consumes: explicit owner approval of the final production screenshots from Task 5.
- Produces: durable project authority that supersedes the rejected visual conclusion while retaining verified functional boundaries.

- [ ] **Step 1: Record the owner's exact visual disposition**

If approved, append a new decision after A2-D081 that states:

```markdown
## A2-D082 - Accept the corrected production widget visual parity

- **Decision:** Accept the exact-build production captures as matching the approved gallery and owner canvas reference, with free Clock, Greeting, Quote, Focus, and Service Status text, the unchanged Bookmarks bar, dominant centered GitHub and GitLab graphs, and vertically balanced Calendar tiers.
- **Reason:** The owner reviewed the actual built extension rather than mockup-only or aggregate evidence and confirmed the intended hierarchy, density, and content fit.
- **Rejected:** The superseded A2-D081 visual conclusion, tiny upper-left contribution graphs, card surfaces around the five intrinsic identities, top-crowded Calendar composition, automatic layout movement, and Store action.
- **Consequence:** The recovery packet is visually accepted. Functional storage, connector, permission, recovery, and Store boundaries remain unchanged.
- **Verification:** Record the exact source commit, dist provenance, focused and full test totals, browser scenarios, graph coverage and centering measurements, inspected screenshots, protected-checkout proof, and truthful manual ceilings.
```

If the owner rejects any capture, do not write A2-D082. Record the specific rejected widget and return only to its focused task.

- [ ] **Step 2: Update Status, Roadmap, and QA result**

Update the three ledgers with the same exact commit and evidence totals. Change the QA report result from `READY FOR OWNER VISUAL REVIEW` to `OWNER APPROVED` only after explicit approval.

- [ ] **Step 3: Commit the acceptance checkpoint**

```powershell
git add -- docs/superpowers/aurora-2/STATUS.md docs/superpowers/aurora-2/ROADMAP.md docs/superpowers/aurora-2/DECISIONS.md docs/superpowers/reports/WIDGET-VISUAL-PARITY-RECOVERY-QA.md
git diff --cached --check
git commit -m "docs: accept corrected widget visual parity"
```

- [ ] **Step 4: Verify final repository boundaries**

Run:

```powershell
git status --short
git log -8 --oneline --decorate
git -C 'D:\DEV\Chrome plugin' status --short
git -C 'D:\DEV\Chrome plugin' rev-parse HEAD
```

Expected: the isolated worktree contains only the preserved user-owned untracked takeover file, the protected checkout is clean at `eb1354b6a5b041fb6d494655c3dae1862572bc51`, and no push, merge, or Store action occurred.
