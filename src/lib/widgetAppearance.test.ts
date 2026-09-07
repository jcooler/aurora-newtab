import { describe, expect, it } from 'vitest'
import { defaults } from './storage/schema'
import { migrate } from './storage/migrations'
import { validateBackupShape } from './backup'
import { DEFAULT_GRAPH_COLORS, isGraphColors } from './widgetAppearance'

describe('independent widget graph colors', () => {
  it('upgrades existing settings without touching colors, connectors, or placements', () => {
    const data = defaults()
    data.settings.panelColor = '#713f83'
    data.settings.widgetTextColor = '#f2e7cc'
    data.settings.photoClockColor = '#86cafa'
    const oldSettings = { ...data.settings } as Record<string, unknown>
    delete oldSettings.graphColors
    const upgraded = migrate({ ...data, settings: oldSettings }, 24)
    expect(upgraded.settings).toEqual({ ...oldSettings, graphColors: DEFAULT_GRAPH_COLORS })
    expect(upgraded.connectors).toEqual(data.connectors)
    expect(upgraded.layouts).toEqual(data.layouts)
    expect(upgraded.layout).toEqual(data.layout)
  })
  it('preserves independent preferences in backup validation', () => {
    const data = defaults()
    data.settings.graphColors = { github: 'green', gitlab: 'blue' }
    const result = validateBackupShape(data)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data.settings.graphColors).toEqual({ github: 'green', gitlab: 'blue' })
  })
  it.each([null, 'blue', { github: 'red', gitlab: 'blue' }, { github: 'blue', gitlab: 'orange', token: 'unexpected' }])('rejects invalid graph settings %j', graphColors => {
    expect(isGraphColors(graphColors)).toBe(false)
    const invalid = { ...defaults(), settings: { ...defaults().settings, graphColors } }
    expect(validateBackupShape(invalid as ReturnType<typeof defaults>).ok).toBe(false)
  })
})
