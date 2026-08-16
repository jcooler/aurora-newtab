import { describe, expect, it } from 'vitest'
import appSource from './App.tsx?raw'
import clockSource from './components/Clock.tsx?raw'
import dayContextSource from './components/DayContext.tsx?raw'
import indexCss from './index.css?raw'
import registrySource from './widgetRegistry.ts?raw'

describe('W4-P1 Day and Now presentation boundary', () => {
  it('adds empty-Day context as render-only zone chrome, never a registry identity', () => {
    expect(appSource).toContain("zone === 'day' && allocations.length === 0 ? <DayContext /> : null")
    expect(dayContextSource).toContain('data-day-context=""')
    expect(dayContextSource).not.toContain('useStoredKey')
    expect(registrySource).not.toContain("id: 'day-context'")
  })

  it('keeps Now photo-forward and reveals Clock date detail only for Expanded', () => {
    expect(indexCss).toMatch(/\.stage-zone--now\s*\{[\s\S]*?border-color: transparent;[\s\S]*?box-shadow: none;/)
    expect(clockSource).toContain('data-clock-date=""')
    expect(indexCss).toMatch(/\.clock-face \[data-clock-date\]\s*\{[\s\S]*?display: none;/)
    expect(indexCss).toMatch(/\[data-stage-variant="expanded"\]\[data-block-id="clock"\][^{]+\{\s*display: block;/)
  })

  it('does not introduce a second layout authority or whole-widget hide tier', () => {
    expect(indexCss).not.toMatch(/\.adaptive-stage\s*\{[^}]*transform:/)
    expect(indexCss).not.toMatch(/\[data-block-id="(?:clock|greeting|search|focus)"\][^{]*\{[^}]*display:\s*none/)
    expect(appSource).not.toMatch(/(?:left|top):\s*[^,}]*%/)
  })
})
