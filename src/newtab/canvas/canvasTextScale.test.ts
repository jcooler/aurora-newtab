import { describe, expect, it } from 'vitest'
import { projectTextScale } from './canvasTextScale'

describe('projectTextScale', () => {
  const viewports = {
    ordinary: { width: 1920, height: 1080, profile: 'standard' as const },
    large: { width: 2560, height: 1440, profile: 'display' as const },
    wide: { width: 3440, height: 1440, profile: 'ultrawide' as const },
    fourK: { width: 3840, height: 2160, profile: 'display' as const },
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

  it.each([
    ['ordinary', 'standard'],
    ['large', 'large'],
    ['wide', 'large'],
    ['fourK', 'large'],
  ] as const)('projects Automatic to the readable %s default', (name, expected) => {
    expect(projectTextScale('auto', viewports[name])).toBe(expected)
  })
})
