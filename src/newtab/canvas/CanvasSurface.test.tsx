// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { NamedLayout } from '../../lib/layout/namedLayouts'
import { WIDGET_REGISTRY } from '../widgetRegistry'
import CanvasSurface from './CanvasSurface'
import indexCss from '../index.css?raw'

const ENTRIES = WIDGET_REGISTRY.filter(({ id }) => ['bookmarks', 'clock', 'focus', 'weather', 'timer'].includes(id))

const LAYOUT: NamedLayout = {
  id: 'my-layout',
  name: 'My layout',
  widgets: {
    clock: { kind: 'free', anchor: 'center', offsetX: 0, offsetY: -30, tier: 'full', layer: 2 },
    weather: { kind: 'free', anchor: 'top-right', offsetX: -7, offsetY: 13, tier: 'standard', layer: 1 },
    focus: { kind: 'free', anchor: 'center', offsetX: 0, offsetY: 12, tier: 'standard', layer: 0 },
    bookmarks: { kind: 'docked', dock: 'bottom', order: 0 },
    timer: { kind: 'free', anchor: 'bottom-left', offsetX: 7, offsetY: -9, tier: 'full', layer: 3 },
  },
}

function renderSurface(
  layout: NamedLayout = LAYOUT,
  viewport: { width: number; height: number } = { width: 1408, height: 445 },
  entries = ENTRIES,
) {
  return render(
    <CanvasSurface
      activeLayout={layout}
      entries={entries}
      viewport={viewport}
      renderWidget={(entry, size) => <span>{entry.label}:{size}</span>}
    />,
  )
}

describe('CanvasSurface (anchored named layout)', () => {
  afterEach(cleanup)

  it('positions anchored items by percent with layer z-index and no imposed box', () => {
    renderSurface()
    const clock = screen.getByTestId('canvas-item-clock')
    expect(clock.style.left).toBe('50%')
    expect(clock.style.top).toBe('20%')
    expect(clock.style.zIndex).toBe('2')
    expect(clock.style.width).toBe('')
    expect(clock.style.minHeight).toBe('')
    expect(clock.dataset.stageVariant).toBeUndefined()
    expect(clock.className).not.toMatch(/board-item/)
    expect(clock.dataset.canvasMode).toBe('anchored')
    const weather = screen.getByTestId('canvas-item-weather')
    expect(weather.style.left).toBe('93%')
    expect(weather.style.top).toBe('13%')
  })

  it('renders every enabled identity exactly once and never a disabled one', () => {
    renderSurface()
    const canvas = screen.getByRole('region', { name: 'Canvas' })
    for (const entry of ENTRIES.filter(({ id }) => id !== 'bookmarks')) {
      expect(within(canvas).getAllByTestId(`canvas-item-${entry.id}`)).toHaveLength(1)
    }
    expect(screen.queryByTestId('canvas-item-notes')).toBeNull()
  })

  it('renders each docked member at its OWN exact strip position in one free lane (owner-refined 2026-08-18)', () => {
    const positioned: NamedLayout = {
      ...LAYOUT,
      widgets: {
        ...LAYOUT.widgets,
        bookmarks: { kind: 'docked', dock: 'bottom', order: 1 },
        timer: { kind: 'docked', dock: 'bottom', order: 0, x: 7.25 },
      },
    }
    renderSurface(positioned)
    const nav = screen.getByRole('navigation', { name: 'Bottom bar' })
    expect(nav.querySelector('.dock-lane')).toBeTruthy()
    const timer = screen.getByTestId('canvas-item-timer')
    expect(timer.style.marginLeft).toBe('7.25%')
    expect(timer.style.transform).toBe('translateX(-50%)')
    // A legacy placement without x renders centered.
    expect(screen.getByTestId('canvas-item-bookmarks').style.marginLeft).toBe('50%')
  })

  it('renders docked items in the bottom strip in order, not in the surface', () => {
    renderSurface()
    const nav = screen.getByRole('navigation', { name: 'Bottom bar' })
    expect(within(nav).getByTestId('canvas-item-bookmarks')).toBeTruthy()
    const canvas = screen.getByRole('region', { name: 'Canvas' })
    expect(within(canvas).queryByTestId('canvas-item-bookmarks')).toBeNull()
    expect(screen.getAllByTestId('canvas-item-bookmarks')).toHaveLength(1)
  })

  it('keeps both strips unpainted until a widget is explicitly docked there', () => {
    const undocked: NamedLayout = {
      ...LAYOUT,
      widgets: { clock: LAYOUT.widgets.clock },
    }
    renderSurface(undocked)
    expect(screen.queryByRole('navigation', { name: 'Bottom bar' })).toBeNull()
    expect(screen.queryByRole('navigation', { name: 'Top bar' })).toBeNull()
  })

  it('renders a top-docked item in the top strip', () => {
    const topDocked: NamedLayout = {
      ...LAYOUT,
      widgets: {
        ...LAYOUT.widgets,
        timer: { kind: 'docked', dock: 'top', order: 0 },
      },
    }
    renderSurface(topDocked)
    expect(within(screen.getByRole('navigation', { name: 'Top bar' })).getByTestId('canvas-item-timer')).toBeTruthy()
  })

  it('renders the mechanical stack below the narrow floor: docks first, then free in layer order', () => {
    renderSurface(LAYOUT, { width: 599, height: 800 })
    const surface = screen.getByRole('region', { name: 'Canvas' })
    expect(surface.dataset.canvasNarrow).toBe('true')
    const ids = [...surface.querySelectorAll('[data-block-id]')].map((el) => el.getAttribute('data-block-id'))
    expect(ids).toEqual(['bookmarks', 'focus', 'weather', 'clock', 'timer'])
    expect(screen.queryByRole('navigation', { name: 'Bottom bar' })).toBeNull()
  })

  it('gives an enabled widget missing from the layout its designed static default slot without writing anything', () => {
    const before = JSON.stringify(LAYOUT)
    renderSurface(LAYOUT, { width: 1408, height: 445 }, WIDGET_REGISTRY.filter(({ id }) => ['clock', 'notes'].includes(id)))
    const notes = screen.getByTestId('canvas-item-notes')
    expect(notes.style.left).toBe('7%')
    expect(notes.style.top).toBe('91%')
    expect(JSON.stringify(LAYOUT)).toBe(before)
  })

  it('resolves an unsupported stored tier to the nearest declared size', () => {
    renderSurface()
    // timer declares canvasSizes ['compact']; the layout stores tier 'full'.
    expect(screen.getByTestId('canvas-item-timer').dataset.canvasSize).toBe('compact')
    expect(screen.getByTestId('canvas-item-timer').textContent).toContain('compact')
  })

  it('preserves intrinsic strip item widths so sibling launchers cannot paint over each other', () => {
    expect(indexCss).toMatch(/\.dock-lane \.canvas-item\s*\{[^}]*container-type:\s*normal;[^}]*width:\s*max-content;/)
  })

  it('the full-width strips are pointer-transparent: only members catch events', () => {
    // Witness-caught: the full-width fixed lane intercepted hovers/clicks
    // across the whole band, blocking the Tasks launcher and settings gear
    // beneath its empty stretches.
    expect(indexCss).toMatch(/\.canvas-bottom-bar,\s*\.canvas-top-bar\s*\{[^}]*pointer-events:\s*none/)
    expect(indexCss).toMatch(/\.dock-lane \.canvas-item\s*\{[^}]*pointer-events:\s*auto/)
  })

  it('the ordered-row scroller machinery is retired, not merely unreachable (free-x docks, owner-refined 2026-08-18)', () => {
    // Free positioning replaced the flowing row: nothing scrolls or clips,
    // so no scroller, nub, or overflow-fade rule may survive to squeeze a
    // member into truncation (the reported top-dock weather clipping).
    expect(indexCss).not.toContain('.dock-scroller')
    expect(indexCss).not.toContain('.dock-nub')
    expect(indexCss).not.toContain('data-dock-overflow')
  })

  it('docked members render at their stored size; Bookmarks defaults to the full readable bar (spec 2.3 exemption)', () => {
    const sized: NamedLayout = {
      ...LAYOUT,
      widgets: {
        ...LAYOUT.widgets,
        bookmarks: { kind: 'docked', dock: 'bottom', order: 0 },
        weather: { kind: 'docked', dock: 'bottom', order: 1 },
      },
    }
    renderSurface(sized)
    expect(screen.getByTestId('canvas-item-bookmarks').dataset.canvasSize).toBe('standard')
    expect(screen.getByTestId('canvas-item-weather').dataset.canvasSize).toBe('compact')
    cleanup()
    const compactBar: NamedLayout = {
      ...LAYOUT,
      widgets: { ...LAYOUT.widgets, bookmarks: { kind: 'docked', dock: 'bottom', order: 0, tier: 'compact' } },
    }
    renderSurface(compactBar)
    expect(screen.getByTestId('canvas-item-bookmarks').dataset.canvasSize).toBe('compact')
  })

  it('the one-letter mark form follows the compact SIZE everywhere, including the dock (owner-confirmed 2026-08-18)', () => {
    // The old exemption guard fenced the mark rules out of the dock wholesale;
    // now the docked DEFAULT is the standard full bar and an explicit compact
    // size wears the marks in the strip too.
    expect(indexCss).not.toMatch(/:not\(\[data-canvas-mode="docked"\]\)\[data-block-id="bookmarks"\] \[data-bookmark-mark/)
    expect(indexCss).toMatch(/\.canvas-item\[data-canvas-size="compact"\]\[data-block-id="bookmarks"\] \[data-bookmark-mark="monogram"\]\s*\{[^}]*display:\s*inline/)
  })

  it('the photo legibility wash never follows the widget color (owner-reported 2026-08-18)', () => {
    // The wash dims the photograph; settings.panelColor re-tints
    // --panel-solid. A red widget pick used to flood the whole image with
    // red because the layer borrowed that token.
    const washBlock = indexCss.match(/\.canvas-legibility-layer\s*\{[^}]*\}/)?.[0] ?? ''
    expect(washBlock).toContain('var(--canvas-wash)')
    expect(washBlock).not.toContain('var(--panel-solid)')
  })

  it('dock-line typography is pinned to the chip metrics AND actually wins the cascade against the type roles', () => {
    expect(indexCss).toMatch(/\.aurora-canvas \.dock-line \[data-canvas-type-role\]\s*\{[^}]*font-size:\s*14px/)
    expect(indexCss).toMatch(/\.aurora-canvas \.dock-line \[data-canvas-type-role="metadata"\]\s*\{[^}]*font-size:\s*11px/)
    // Specificity proof, not just presence: the role rules the pin must beat
    // are `.aurora-canvas [data-canvas-type-role=...]` (0,2,0) LATER in the
    // file; the pin's extra ancestor makes it (0,3,0). A bare `.dock-line
    // [data-canvas-type-role]` pin silently loses — the exact bug the owner
    // hit on the second report.
    expect(indexCss).not.toMatch(/^\.dock-line \[data-canvas-type-role\]/m)
  })

  it('the Bookmarks wrapper is grabbable during a session despite its normal-mode pointer-events none', () => {
    // Legacy rule: the closed bar's wrapper is pointer-events none so its
    // allocation cannot intercept other controls. In a session the interiors
    // are inert and the wrapper is the drag target — without the editing
    // override the bar could not be grabbed at all (owner-reported
    // 2026-08-18, witness stage 9c).
    expect(indexCss).toMatch(/\.canvas-item--editing\[data-block-id="bookmarks"\]\s*\{[^}]*pointer-events:\s*auto\s*;/)
  })

  it('never paints a container focus ring: no focus-within rule declares an outline', () => {
    expect(indexCss).not.toMatch(/board-item[^{]*:focus-within/)
    // The hover-chrome reveal keys on :focus-within (opacity only, spec 2.5
    // grips/gears); a RING would be an outline declaration in such a rule.
    expect(indexCss).not.toMatch(/:focus-within[^{]*\{[^}]*outline/)
  })
})

describe('Docked item chrome and safety (owner-reported 2026-08-18)', () => {
  afterEach(cleanup)

  it('docked items get the same hover grip and gear as anchored items in normal chrome', () => {
    // Spec 2.5 says "hovering a widget fades in two small controls" — it
    // never restricts the grip/gear to anchored items. Without them a docked
    // widget has no visible way out of the dock and no settings entry.
    render(
      <CanvasSurface
        activeLayout={LAYOUT}
        entries={ENTRIES}
        viewport={{ width: 1408, height: 445 }}
        chrome="normal"
        renderWidget={(entry) => <span>{entry.label}</span>}
      />,
    )
    const docked = screen.getByTestId('canvas-item-bookmarks')
    expect(within(docked).getByRole('button', { name: 'Move Bookmarks' })).toBeTruthy()
    expect(within(docked).getByRole('button', { name: 'Bookmarks settings' })).toBeTruthy()
    const anchored = screen.getByTestId('canvas-item-clock')
    expect(within(anchored).getByRole('button', { name: 'Move Clock' })).toBeTruthy()
  })

  it('the narrow stack stays chrome-free', () => {
    render(
      <CanvasSurface
        activeLayout={LAYOUT}
        entries={ENTRIES}
        viewport={{ width: 599, height: 800 }}
        chrome="normal"
        renderWidget={(entry) => <span>{entry.label}</span>}
      />,
    )
    expect(screen.queryByRole('button', { name: 'Move Clock' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Move Bookmarks' })).toBeNull()
  })

  it('a stored docked placement for a widget with no Docked tier renders free at its default slot, never in the strip', () => {
    const badDock: NamedLayout = {
      ...LAYOUT,
      widgets: { ...LAYOUT.widgets, monthCal: { kind: 'docked', dock: 'bottom', order: 1 } },
    }
    render(
      <CanvasSurface
        activeLayout={badDock}
        entries={WIDGET_REGISTRY.filter(({ id }) => ['bookmarks', 'clock', 'monthCal'].includes(id))}
        viewport={{ width: 1408, height: 445 }}
        renderWidget={(entry, size) => <span>{entry.label}:{size}</span>}
      />,
    )
    const month = screen.getByTestId('canvas-item-monthCal')
    expect(month.dataset.canvasMode).toBe('anchored')
    const nav = screen.getByRole('navigation', { name: 'Bottom bar' })
    expect(within(nav).queryByTestId('canvas-item-monthCal')).toBeNull()
    expect(within(nav).getByTestId('canvas-item-bookmarks')).toBeTruthy()
  })
})

describe('Geometry freshness (owner-reported 2026-08-18: bouncing drags, stale overlap notes)', () => {
  afterEach(cleanup)

  it('re-publishes an item\'s rect when its PLACEMENT changes, not only when its size changes', () => {
    // ResizeObserver never fires for position-only moves, so without an
    // item-keyed publish the rect map goes stale the moment a widget moves:
    // the next grab computes a garbage pointer offset (the "bouncing"), and
    // the inspector warns about overlaps at positions widgets left long ago.
    const calls: string[] = []
    const onGeometry = (id: string) => calls.push(id)
    const moved: NamedLayout = {
      ...LAYOUT,
      widgets: { ...LAYOUT.widgets, clock: { kind: 'free', anchor: 'top-left', offsetX: 5, offsetY: 5, tier: 'full', layer: 2 } },
    }
    const { rerender } = render(
      <CanvasSurface
        activeLayout={LAYOUT}
        entries={ENTRIES}
        viewport={{ width: 1408, height: 445 }}
        onItemGeometryChange={(id) => onGeometry(id)}
        renderWidget={(entry) => <span>{entry.label}</span>}
      />,
    )
    const before = calls.filter((id) => id === 'clock').length
    expect(before).toBeGreaterThan(0)
    rerender(
      <CanvasSurface
        activeLayout={moved}
        entries={ENTRIES}
        viewport={{ width: 1408, height: 445 }}
        onItemGeometryChange={(id) => onGeometry(id)}
        renderWidget={(entry) => <span>{entry.label}</span>}
      />,
    )
    expect(calls.filter((id) => id === 'clock').length).toBeGreaterThan(before)
  })
})

describe('Docked render flag (NL-P5 batch 1)', () => {
  it('passes docked=true to the renderer only for strip members', () => {
    const seen = new Map<string, boolean>()
    render(
      <CanvasSurface
        activeLayout={LAYOUT}
        entries={ENTRIES}
        viewport={{ width: 1408, height: 445 }}
        renderWidget={(entry, _size, docked) => { seen.set(entry.id, docked); return <span>{entry.label}</span> }}
      />,
    )
    expect(seen.get('bookmarks')).toBe(true)
    expect(seen.get('clock')).toBe(false)
    expect(seen.get('weather')).toBe(false)
  })
})
