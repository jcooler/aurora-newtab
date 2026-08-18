import { describe, expect, it } from 'vitest'
import { projectTextScale } from './canvasTextScale'

describe('projectTextScale', () => {
  const viewports = {
    ordinary: { width: 1920, height: 1080 },
    shortDesktop: { width: 1408, height: 445 },
    desktop: { width: 1600, height: 900 },
    large: { width: 2560, height: 1440 },
    wide: { width: 3440, height: 1440 },
    shortWide: { width: 1920, height: 500 },
    fourK: { width: 3840, height: 2160 },
  }

  it.each([
    ['compact', 'standard'],
    ['balanced', 'standard'],
    ['spacious', 'large'],
  ] as const)('projects stored %s to %s at every viewport without mutating the input', (stored, expected) => {
    for (const viewport of Object.values(viewports)) {
      const before = { ...viewport }
      expect(projectTextScale(stored, viewport)).toBe(expected)
      expect(viewport).toEqual(before)
    }
  })

  // Automatic keeps its exact pre-NL-P2 outcomes without the retired profile
  // abstraction: large on exactly the viewports that were display/ultrawide.
  it.each([
    ['ordinary', 'standard'],
    ['shortDesktop', 'standard'],
    ['desktop', 'standard'],
    ['large', 'large'],
    ['wide', 'large'],
    ['shortWide', 'large'],
    ['fourK', 'large'],
  ] as const)('projects Automatic to the readable %s default', (name, expected) => {
    expect(projectTextScale('auto', viewports[name])).toBe(expected)
  })
})
