// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, expectTypeOf, it } from 'vitest'
import indexCss from '../../index.css?raw'
import TierFrame, { type TierFrameProps } from './TierFrame'
import type { WidgetPresentationState } from '../../widgetSizeContracts'

function declarationBlock(selector: string): string {
  const start = indexCss.indexOf(`${selector} {`)
  expect(start, `missing selector ${selector}`).toBeGreaterThanOrEqual(0)
  const open = indexCss.indexOf('{', start)
  const close = indexCss.indexOf('}', open)
  expect(open).toBeGreaterThan(start)
  expect(close).toBeGreaterThan(open)
  return indexCss.slice(open + 1, close)
}

describe('TierFrame', () => {
  it('accepts only the shared WidgetPresentationState contract', () => {
    expectTypeOf<TierFrameProps['state']>().toEqualTypeOf<WidgetPresentationState>()
  })

  it('renders one named presentation-only panel frame with its declared tier and state', () => {
    render(
      <TierFrame label="Weather" tier="standard" state="ready">
        <p>Forecast</p>
      </TierFrame>,
    )

    const frame = screen.getByRole('region', { name: 'Weather' })
    expect(screen.getAllByRole('region')).toHaveLength(1)
    expect(frame.dataset.tierFrame).toBe('standard')
    expect(frame.dataset.tierFrameState).toBe('ready')
    expect(frame.className).toContain('tier-frame')
    expect(frame.className).toContain('tier-frame--standard')
    expect(frame.className).toContain('bg-panel-solid')
    expect(frame.className).toContain('border-panel-border')
    expect(frame.textContent).toBe('Forecast')
  })

  it('pins exact desktop frames, proportional narrow safety, adaptive panel tokens, focus, and motion safety', () => {
    const frame = declarationBlock('.tier-frame')
    expect(frame).toMatch(/box-sizing:\s*border-box\s*;/)
    expect(frame).toMatch(/width:\s*min\(var\(--tier-frame-width\),\s*calc\(100vw - 24px\)\)\s*;/)
    expect(frame).toMatch(/height:\s*auto\s*;/)
    expect(frame).toMatch(/aspect-ratio:\s*var\(--tier-frame-ratio\)\s*;/)
    expect(frame).toMatch(/overflow:\s*hidden\s*;/)
    expect(frame).toMatch(/border-radius:\s*var\(--radius\)\s*;/)
    expect(frame).toMatch(/border:\s*1px solid var\(--panel-border\)\s*;/)
    expect(frame).toMatch(/background:\s*var\(--panel-solid\)\s*;/)
    expect(frame).toMatch(/color:\s*var\(--fg\)\s*;/)
    expect(frame).toMatch(/--tier-frame-muted:\s*var\(--fg-muted\)\s*;/)
    expect(frame).toMatch(/--tier-frame-accent:\s*var\(--panel-accent\)\s*;/)
    expect(frame).toMatch(/--accent:\s*var\(--tier-frame-accent\)\s*;/)
    expect(frame).toMatch(/box-shadow:\s*0 10px 15px -3px rgb\(0 0 0 \/ 0\.25\), 0 4px 6px -4px rgb\(0 0 0 \/ 0\.25\)\s*;/)
    expect(frame).not.toMatch(/overflow-y:\s*(auto|scroll)\s*;/)

    expect(declarationBlock('.tier-frame--compact')).toMatch(/--tier-frame-width:\s*216px\s*;\s*--tier-frame-ratio:\s*216 \/ 132\s*;/)
    expect(declarationBlock('.tier-frame--standard')).toMatch(/--tier-frame-width:\s*320px\s*;\s*--tier-frame-ratio:\s*320 \/ 200\s*;/)
    expect(declarationBlock('.tier-frame--full')).toMatch(/--tier-frame-width:\s*460px\s*;\s*--tier-frame-ratio:\s*460 \/ 284\s*;/)
    expect(declarationBlock('.tier-frame:focus-within')).toMatch(/outline:\s*2px solid var\(--tier-frame-accent\)\s*;/)
    expect(indexCss).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.tier-frame\s*\{\s*transition:\s*none\s*;/)
  })

  it('keeps legacy Weather width guards from overriding the shared frame contract', () => {
    expect(indexCss).toMatch(/\[data-block-id="weather"\]:not\(\.z-30\) > section:not\(\.tier-frame\)\s*\{\s*width:\s*100%/)
    expect(indexCss).toMatch(/\[data-block-id="weather"\]:not\(\.z-30\) > section:not\(\.tier-frame\),/)
    expect(indexCss).toMatch(/\[data-block-id="weather"\] > section:not\(\.tier-frame\):has\(input\[aria-label="Search for a city"\]\),/)
  })
})
