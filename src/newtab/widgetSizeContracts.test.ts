import { describe, expect, it } from 'vitest'
import { contentConflictFor, WIDGET_SIZE_CONTRACTS, type SelectedCanvasContent } from './widgetSizeContracts'

describe('Canvas widget size contracts', () => {
  it('offers only useful, ordered sizes for connector cards and their primary values', () => {
    expect(WIDGET_SIZE_CONTRACTS.github.sizes).toEqual(['compact', 'standard', 'full'])
    expect(WIDGET_SIZE_CONTRACTS.jira.sizes).toEqual(['compact', 'standard', 'full'])
    expect(WIDGET_SIZE_CONTRACTS.crypto.sizes).toEqual(['compact', 'standard'])
    expect(WIDGET_SIZE_CONTRACTS.timer.sizes).toEqual(['compact'])
  })

  it('names selected content that needs a larger size instead of inventing a fitting choice', () => {
    const graph: SelectedCanvasContent = { label: 'Contribution graph', minimumSize: 'standard' }
    const pulls: SelectedCanvasContent = { label: 'Pull requests', minimumSize: 'standard' }
    const action: SelectedCanvasContent = { label: 'Actions', minimumSize: 'standard' }
    expect(contentConflictFor('github', 'compact', [graph, pulls])).toBe(
      'Contribution graph and Pull requests need Standard or Full.',
    )
    expect(contentConflictFor('github', 'compact', [pulls])).toBe('Pull requests need Standard or Full.')
    expect(contentConflictFor('jira', 'standard', [graph])).toBeNull()
    expect(contentConflictFor('homeassistant', 'compact', [action])).toBe('Actions need Standard or Full.')
  })
})

describe('Docked tier contracts (NL-P5 batch 1)', () => {
  it('declares the batch-1 Docked contracts and no others yet', () => {
    const docked = Object.entries(WIDGET_SIZE_CONTRACTS)
      .filter(([, contract]) => contract.docked !== undefined)
      .map(([id]) => id)
      .sort()
    expect(docked).toEqual(['bookmarks', 'clock', 'focus', 'notes', 'tasks', 'timer', 'weather'])
    expect(WIDGET_SIZE_CONTRACTS.weather.docked).toBe('Temperature · location · condition')
    expect(WIDGET_SIZE_CONTRACTS.clock.docked).toBe('Time · date')
    expect(WIDGET_SIZE_CONTRACTS.bookmarks.docked).toBe('Full readable bookmark bar')
  })
})
