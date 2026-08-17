// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { CanvasProfileKey } from '../../lib/layout/canvasTypes'
import ArrangeArtboard from './ArrangeArtboard'

describe('ArrangeArtboard', () => {
  afterEach(cleanup)

  it.each([
    ['compact', 390, 844],
    ['standard', 1440, 900],
    ['display', 2560, 1440],
    ['ultrawide', 3440, 1440],
  ] as const)('renders the exact %s logical artboard and keeps the live Canvas root untransformed', (profile, width, height) => {
    render(
      <ArrangeArtboard profile={profile} physicalViewport={{ width: 1920, height: 1080 }} inspectorOpen>
        <div data-canvas-root=""><span>Selected Canvas content</span></div>
      </ArrangeArtboard>,
    )

    const frame = screen.getByTestId('arrange-artboard')
    const logical = screen.getByTestId('arrange-artboard-logical')
    const canvasRoot = document.querySelector<HTMLElement>('[data-canvas-root]')!
    expect(frame.dataset.arrangeProfile).toBe(profile)
    expect(logical.style.width).toBe(`${width}px`)
    expect(logical.style.height).toBe(`${height}px`)
    expect(logical.style.transform).toMatch(/^scale\(/)
    expect(logical.hasAttribute('inert')).toBe(true)
    expect(canvasRoot.style.transform).toBe('')
    expect(screen.getByText('Selected Canvas content')).toBeTruthy()
  })

  it.each([
    [1099, 'sheet'],
    [1100, 'side'],
  ] as const)('uses physical width %ipx for %s modality for every logical profile', (width, expected) => {
    const { rerender } = render(
      <ArrangeArtboard profile="compact" physicalViewport={{ width, height: 900 }} inspectorOpen><div /></ArrangeArtboard>,
    )
    expect(screen.getByTestId('arrange-artboard').dataset.arrangeViewportMode).toBe(expected)
    for (const profile of ['standard', 'display', 'ultrawide'] as readonly CanvasProfileKey[]) {
      rerender(<ArrangeArtboard profile={profile} physicalViewport={{ width, height: 900 }} inspectorOpen><div /></ArrangeArtboard>)
      expect(screen.getByTestId('arrange-artboard').dataset.arrangeViewportMode).toBe(expected)
    }
  })

  it('keeps a visible preview workspace while the sheet inspector is open', () => {
    render(
      <ArrangeArtboard profile="compact" physicalViewport={{ width: 375, height: 812 }} inspectorOpen>
        <div>Visible Canvas preview</div>
      </ArrangeArtboard>,
    )
    const frame = screen.getByTestId('arrange-artboard')
    expect(frame.dataset.arrangeViewportMode).toBe('sheet')
    expect(frame.dataset.arrangeInspectorOpen).toBe('true')
    expect(screen.getByText('Visible Canvas preview')).toBeTruthy()
  })
})
