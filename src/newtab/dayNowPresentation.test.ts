import { describe, expect, it } from 'vitest'
import appSource from './App.tsx?raw'
import clockSource from './components/Clock.tsx?raw'
import briefingSource from './components/AuroraBriefing.tsx?raw'
import greetingSource from './components/Greeting.tsx?raw'
import indexCss from './index.css?raw'
import registrySource from './widgetRegistry.ts?raw'

describe('W4-P1 Day and Now presentation boundary', () => {
  it('reveals Clock date detail only for the Full tier', () => {
    // The stage-zone wash died with the retired stage machinery (NL-P2); the
    // Clock's tier-gated long date is a live contract and now keys on the
    // canvas tier emission.
    expect(clockSource).toContain('data-clock-date=""')
    expect(indexCss).toMatch(/\.clock-face \[data-clock-date\]\s*\{[\s\S]*?display: none;/)
    expect(indexCss).toMatch(/\[data-canvas-size="full"\]\[data-block-id="clock"\][^{]+\{\s*display: block;/)
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
    expect(indexCss).not.toMatch(/data-canvas-size="compact"[^}]+data-block-id="greeting"[^}]+\.aurora-greeting > p\s*\{[^}]+font-size:/)
    expect(indexCss).toMatch(/\[data-canvas-type-role="greeting"\][^{]*\{[^}]+font-size: var\(--canvas-type-greeting\);/)
    expect(briefingSource).toContain('<AttentionContextPanel')
    expect(briefingSource).not.toContain('data-briefing-compact')
    expect(indexCss).toMatch(/\.aurora-briefing__trigger\s*\{[\s\S]*?background:\s*transparent;/)
    expect(indexCss).not.toMatch(/\.aurora-briefing__trigger\s*\{[^}]*box-shadow:/)
    expect(indexCss).not.toContain('data-stage-profile')
  })

  it('keeps the attention trigger pointer-active inside the otherwise pointer-transparent Greeting', () => {
    const transparentGreeting = indexCss.indexOf('[data-block-id="greeting"] > :not(.canvas-item-chrome)')
    const interactiveTrigger = indexCss.indexOf('[data-block-id="greeting"] .aurora-briefing__trigger')
    expect(transparentGreeting).toBeGreaterThan(-1)
    expect(interactiveTrigger).toBeGreaterThan(transparentGreeting)
    expect(indexCss.slice(interactiveTrigger, interactiveTrigger + 220)).toMatch(/pointer-events:\s*auto/)
  })
})
