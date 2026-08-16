// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { StageAllocation } from '../../lib/layout/adaptiveStage'
import LauncherShelf, { resolveLauncherShelf } from './LauncherShelf'

function allocation(
  id: StageAllocation['id'],
  colStart: number,
  rowStart: number,
  colSpan = 1,
  rowSpan = 1,
  zone: StageAllocation['zone'] = 'now',
): StageAllocation {
  return {
    id,
    zone,
    order: id === 'links' ? 6 : 8,
    variant: 'standard',
    priority: 'automatic',
    colSpan,
    rowSpan,
    rect: zone === 'dock' ? null : { colStart, rowStart, colSpan, rowSpan },
  }
}

describe('LauncherShelf', () => {
  it('groups edge-adjacent launchers and rebases their exact planner rectangles', () => {
    const result = resolveLauncherShelf([
      allocation('links', 1, 3, 2),
      allocation('bookmarks', 3, 3, 2),
    ])

    expect(result?.zone).toBe('now')
    expect(result?.rect).toEqual({ colStart: 1, rowStart: 3, colSpan: 4, rowSpan: 1 })
    expect(result?.allocations.map(({ id, rect }) => ({ id, rect }))).toEqual([
      { id: 'links', rect: { colStart: 1, rowStart: 1, colSpan: 2, rowSpan: 1 } },
      { id: 'bookmarks', rect: { colStart: 3, rowStart: 1, colSpan: 2, rowSpan: 1 } },
    ])

    render(
      <LauncherShelf layout={result!}>
        <button type="button">Quick link</button>
        <button type="button">Bookmark</button>
      </LauncherShelf>,
    )
    const shelf = screen.getByRole('group', { name: 'Launchers' })
    expect(shelf.getAttribute('data-launcher-shelf')).toBe('')
    expect(shelf.style.gridColumn).toBe('1 / span 4')
    expect(shelf.style.gridRow).toBe('3 / span 1')
    expect(screen.getByRole('button', { name: 'Quick link' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Bookmark' })).toBeTruthy()
  })

  it('does not consolidate separated, split-zone, or Dock launchers', () => {
    expect(resolveLauncherShelf([
      allocation('links', 1, 3, 1),
      allocation('bookmarks', 3, 3, 1),
    ])).toBeNull()
    expect(resolveLauncherShelf([
      allocation('links', 1, 3),
      allocation('bookmarks', 2, 3, 1, 1, 'day'),
    ])).toBeNull()
    expect(resolveLauncherShelf([
      allocation('links', 1, 1, 1, 1, 'dock'),
      allocation('bookmarks', 1, 1, 1, 1, 'dock'),
    ])).toBeNull()
  })
})
