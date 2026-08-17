// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { StoredLayout } from '../../lib/layout/canvasTypes'
import type { LayoutV2 } from '../../lib/layout/types'
import { WIDGET_REGISTRY } from '../widgetRegistry'
import CanvasSurface from './CanvasSurface'
import indexCss from '../index.css?raw'

const ENTRIES = WIDGET_REGISTRY.filter(({ id }) => ['bookmarks', 'clock', 'focus', 'weather', 'timer'].includes(id))

function renderSurface(layout: StoredLayout, profileKey: 'compact' | 'standard' | 'display' | 'ultrawide' = 'standard') {
  return render(
    <CanvasSurface
      layout={layout}
      profileKey={profileKey}
      entries={ENTRIES}
      viewport={{ width: profileKey === 'compact' ? 375 : 1600, height: profileKey === 'compact' ? 812 : 900 }}
      renderWidget={(entry, size) => <span>{entry.label}:{size}</span>}
    />,
  )
}

describe('CanvasSurface', () => {
  afterEach(cleanup)

  it.each([
    ['V1', { clock: { x: 44, y: 33 } }],
    ['V2', { version: 2, profiles: { standard: { clock: { zone: 'now', order: 0, colSpan: 2, rowSpan: 2, variant: 'expanded', priority: 'pinned' } } } } as LayoutV2],
    ['V3', { version: 3, profiles: { standard: { mode: 'custom', placements: { clock: { kind: 'canvas', x: 46, y: 35, size: 'full', layer: 0 } } } } }],
  ] as const)('renders normalized %s input through one Canvas with each enabled identity exactly once', (_label, layout) => {
    renderSurface(layout as StoredLayout)

    const canvas = screen.getByRole('region', { name: 'Canvas' })
    for (const entry of ENTRIES) {
      expect(within(canvas).getAllByTestId(`canvas-item-${entry.id}`)).toHaveLength(1)
    }
    expect(screen.queryByRole('region', { name: /^(Day|Now|Work Pulse|Signal Dock)$/ })).toBeNull()
  })

  it('uses independent saved profiles and materially different Small and Desktop geometry', () => {
    const layout = {
      version: 3 as const,
      profiles: {
        compact: { mode: 'custom' as const, placements: { clock: { kind: 'canvas' as const, x: 50, y: 12, size: 'compact' as const, layer: 0 } } },
        standard: { mode: 'custom' as const, placements: { clock: { kind: 'canvas' as const, x: 61, y: 44, size: 'full' as const, layer: 0 } } },
      },
    }
    const { rerender } = renderSurface(layout, 'compact')
    const smallClock = screen.getByTestId('canvas-item-clock')
    expect(smallClock.dataset.canvasSize).toBe('compact')
    expect(screen.getByRole('region', { name: 'Canvas' }).dataset.canvasLayout).toBe('Small')

    rerender(
      <CanvasSurface
        layout={layout}
        profileKey="standard"
        entries={ENTRIES}
        viewport={{ width: 1600, height: 900 }}
        renderWidget={(entry, size) => <span>{entry.label}:{size}</span>}
      />,
    )
    expect(screen.getByTestId('canvas-item-clock').dataset.canvasSize).toBe('full')
    expect(screen.getByRole('region', { name: 'Canvas' }).dataset.canvasLayout).toBe('Desktop')
  })

  it('previews a fitted Desktop source on Small without changing the target profile or stored value', () => {
    const layout = {
      version: 3 as const,
      profiles: {
        compact: { mode: 'custom' as const, placements: { clock: { kind: 'canvas' as const, x: 50, y: 12, size: 'compact' as const, layer: 0 } } },
        standard: { mode: 'custom' as const, placements: { clock: { kind: 'canvas' as const, x: 61, y: 44, size: 'full' as const, layer: 0 } } },
      },
    }
    const before = JSON.stringify(layout)
    render(
      <CanvasSurface
        layout={layout}
        profileKey="compact"
        sourceProfileKey="standard"
        entries={ENTRIES}
        viewport={{ width: 375, height: 812 }}
        renderWidget={(entry, size) => <span>{entry.label}:{size}</span>}
      />,
    )

    expect(screen.getByRole('region', { name: 'Canvas' }).dataset.canvasLayout).toBe('Small')
    expect(screen.getByRole('region', { name: 'Canvas' }).dataset.canvasSourceProfile).toBe('standard')
    expect(screen.getByTestId('canvas-item-clock').dataset.canvasX).toBe('61')
    expect(screen.getByTestId('canvas-item-clock').dataset.canvasSize).toBe('full')
    expect(JSON.stringify(layout)).toBe(before)
  })

  it('keeps Bottom bar optional and unpainted until a launcher is explicitly placed there', () => {
    const empty = renderSurface({ version: 3, profiles: {} })
    expect(screen.queryByRole('navigation', { name: 'Bottom bar' })).toBeNull()
    empty.unmount()

    renderSurface({
      version: 3,
      profiles: {
        standard: {
          mode: 'custom',
          placements: { timer: { kind: 'bottom-bar', order: 0, size: 'compact' } },
        },
      },
    })
    expect(within(screen.getByRole('navigation', { name: 'Bottom bar' })).getByTestId('canvas-item-timer')).toBeTruthy()
    expect(screen.getAllByTestId('canvas-item-timer')).toHaveLength(1)
  })

  it('preserves intrinsic Bottom bar item widths so sibling launchers cannot paint over each other', () => {
    expect(indexCss).toMatch(/\.canvas-bottom-bar \.canvas-item\s*\{[^}]*container-type:\s*normal;[^}]*width:\s*max-content;/)
  })

  it('falls back only a corrupt block and does not render disabled identities', () => {
    const corrupt = {
      version: 3 as const,
      profiles: {
        standard: {
          mode: 'custom' as const,
          placements: {
            clock: { kind: 'canvas' as const, x: Number.NaN, y: 40, size: 'full' as const, layer: 0 },
            focus: { kind: 'canvas' as const, x: 42, y: 62, size: 'standard' as const, layer: 1 },
          },
        },
      },
    }
    const entries = ENTRIES.filter(({ id }) => id !== 'weather')
    render(
      <CanvasSurface
        layout={corrupt}
        profileKey="standard"
        entries={entries}
        viewport={{ width: 1600, height: 900 }}
        renderWidget={(entry) => <span>{entry.label}</span>}
      />,
    )

    expect(screen.getByTestId('canvas-item-clock')).toBeTruthy()
    expect(screen.getByTestId('canvas-item-focus')).toBeTruthy()
    expect(screen.queryByTestId('canvas-item-weather')).toBeNull()
  })

  it('keeps a taller Small information path without transforming the production Canvas root', () => {
    render(
      <CanvasSurface
        layout={{ version: 3, profiles: {} }}
        profileKey="compact"
        entries={WIDGET_REGISTRY}
        viewport={{ width: 390, height: 844 }}
        renderWidget={(entry) => <span>{entry.label}</span>}
      />,
    )

    const canvas = screen.getByRole('region', { name: 'Canvas' })
    const root = document.querySelector<HTMLElement>('[data-canvas-root]')!
    expect(canvas.dataset.canvasViewportWidth).toBe('390')
    expect(Number(canvas.dataset.canvasViewportHeight)).toBeGreaterThan(844)
    expect(Number.parseFloat(canvas.style.height)).toBeGreaterThan(844)
    expect(root.style.transform).toBe('')
  })

  it('keeps legacy custom Small coordinates dynamic until an explicit fixed-plane Save', () => {
    const legacyCustom = {
      version: 3 as const,
      profiles: {
        compact: {
          mode: 'custom' as const,
          placements: { clock: { kind: 'canvas' as const, x: 50, y: 30, size: 'compact' as const, layer: 0 } },
        },
      },
    }
    const view = renderSurface(legacyCustom, 'compact')
    expect(screen.getByRole('region', { name: 'Canvas' }).dataset.canvasCoordinateHeight).toBe('812')
    view.unmount()

    renderSurface({
      version: 3,
      profiles: {
        compact: {
          ...legacyCustom.profiles.compact,
          coordinateHeight: 3200,
        },
      },
    }, 'compact')
    expect(screen.getByRole('region', { name: 'Canvas' }).dataset.canvasCoordinateHeight).toBe('3200')
  })
})
