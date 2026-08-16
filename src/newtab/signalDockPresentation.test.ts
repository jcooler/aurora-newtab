import { describe, expect, it } from 'vitest'
import css from './index.css?raw'
import source from './components/SignalDockEntry.tsx?raw'

describe('W4-P4 Signal Dock presentation boundary', () => {
  it('keeps the closed entry compact, legible, and operable', () => {
    expect(css).toMatch(/\[data-signal-dock-entry\]\s*\{[\s\S]*?inline-size:\s*14rem;[\s\S]*?font-size:\s*14px;/)
    expect(css).toMatch(/\[data-signal-dock-header\]\s+button\s*\{[\s\S]*?min-width:\s*36px;[\s\S]*?min-height:\s*36px;/)
    expect(source).toContain("inert={open ? undefined : true}")
    expect(source).toContain('aria-expanded={open}')
    expect(css).toContain('.board-item[data-block-id="status"] > section {')
    expect(css).not.toContain('.board-item[data-block-id="status"] > * {')
  })

  it('uses one bounded active-work surface without changing Stage geometry authority', () => {
    expect(css).toMatch(/data-signal-dock-open="true"[^}]+data-signal-dock-content[^}]+\{[\s\S]*?position:\s*fixed;[\s\S]*?max-height:/)
    expect(css).toMatch(/data-signal-dock-open="false"[^}]+data-work-pulse-summary[^}]+\{[\s\S]*?display:\s*flex;/)
    expect(css).toMatch(/data-signal-dock-open="false"[^}]+aria-label="Headlines"[^}]+li:first-child[^}]+> a[^}]+\{[\s\S]*?display:\s*block;/)
    expect(css).not.toMatch(/\[data-signal-dock-entry\][^{]*\{[^}]*(?:transform:\s*scale|\bvh\b|\bvw\b)/)
    expect(source.match(/\{children\}/g)).toHaveLength(1)
  })
})
