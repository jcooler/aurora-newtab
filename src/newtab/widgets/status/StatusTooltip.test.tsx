// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { statusContext } from './StatusTooltip'

describe('statusContext', () => {
  it('normalizes healthy, partial, severe, and unreachable context', () => {
    expect(statusContext({ name: 'GitHub', indicator: 'none', description: 'All Systems Operational' })).toBe('GitHub: Operational')
    expect(statusContext({ name: 'Vercel', indicator: 'minor', description: 'Elevated build latency' })).toBe('Vercel: Partial outage. Elevated build latency')
    expect(statusContext({ name: 'Cloudflare', indicator: 'critical', description: 'Major Outage' })).toBe('Cloudflare: Critical outage. Major Outage')
    expect(statusContext({ name: 'Example', indicator: 'unknown', description: '' })).toBe('Example: Unreachable')
  })
})
