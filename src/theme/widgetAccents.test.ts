import { describe, expect, it } from 'vitest'
import { contrastRatio } from '../lib/color'
import { panelAccent, WIDGET_ACCENTS } from './widgetAccents'

describe('widget accent contrast without changing panel color', () => {
  it.each(['#ffffff', '#000000', '#ff69b4', '#0057b8', '#713f83', '#99aa22'])('keeps accent text readable on custom panel %s', panel => {
    for (const accent of Object.values(WIDGET_ACCENTS)) expect(contrastRatio(panelAccent(accent, panel), panel)).toBeGreaterThanOrEqual(4.5)
  })
  it('retains an already readable blue on a dark panel', () => {
    expect(panelAccent('#7dc9ff', '#202b28')).toBe('#7dc9ff')
  })
})
