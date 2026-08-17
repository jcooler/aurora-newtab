import { describe, expect, it } from 'vitest'
import { contentConflictFor, WIDGET_SIZE_CONTRACTS } from './widgetSizeContracts'

describe('Canvas widget size contracts', () => {
  it('offers only useful, ordered sizes for connector cards and their primary values', () => {
    expect(WIDGET_SIZE_CONTRACTS.github.sizes).toEqual(['compact', 'standard', 'full'])
    expect(WIDGET_SIZE_CONTRACTS.jira.sizes).toEqual(['compact', 'standard', 'full'])
    expect(WIDGET_SIZE_CONTRACTS.crypto.sizes).toEqual(['compact', 'standard'])
    expect(WIDGET_SIZE_CONTRACTS.timer.sizes).toEqual(['compact'])
  })

  it('names selected content that needs a larger size instead of inventing a fitting choice', () => {
    expect(contentConflictFor('github', 'compact', ['Contribution graph', 'Pull requests'])).toBe(
      'Contribution graph and Pull requests need Standard or Full.',
    )
    expect(contentConflictFor('jira', 'standard', ['Assigned', 'Due soon'])).toBe(
      'Assigned and Due soon need Full.',
    )
    expect(contentConflictFor('status', 'compact', ['Service issues'])).toBeNull()
  })
})
