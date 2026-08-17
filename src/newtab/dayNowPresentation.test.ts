import { describe, expect, it } from 'vitest'
import appSource from './App.tsx?raw'
import clockSource from './components/Clock.tsx?raw'
import briefingSource from './components/AuroraBriefing.tsx?raw'
import greetingSource from './components/Greeting.tsx?raw'
import indexCss from './index.css?raw'
import registrySource from './widgetRegistry.ts?raw'

describe('W4-P1 Day and Now presentation boundary', () => {
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

  it('keeps Aurora Briefing local, render-only, and profile-budgeted inside Greeting', () => {
    expect(greetingSource).toContain('<AuroraBriefing />')
    expect(briefingSource).not.toMatch(/\bfetch\s*\(/)
    expect(briefingSource).not.toContain("storage.set")
    expect(registrySource).not.toContain("id: 'briefing'")
    expect(indexCss).toMatch(/\.aurora-greeting\s*\{[\s\S]*?width: 100%;/)
    expect(indexCss).toMatch(/data-stage-variant="compact"[^}]+data-block-id="greeting"[^}]+\.aurora-greeting > p\s*\{[^}]+font-size: 1\.375rem;/)
    expect(indexCss).toMatch(/\.aurora-briefing \[data-briefing-standard\],[\s\S]*?display: none;/)
    expect(indexCss).toMatch(/data-stage-profile="standard"[\s\S]*?data-briefing-standard[^}]+display: block;/)
    expect(indexCss).toMatch(/data-stage-profile="display"[\s\S]*?data-briefing-display[^}]+display: block;/)
  })
})
