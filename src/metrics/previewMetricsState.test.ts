import { describe, expect, it } from 'vitest'

import { parsePreviewMetricsState } from './previewMetricsState'

describe('preview Metrics state fixture', () => {
  it.each([
    ['', 'normal'],
    ['?metricsState=loading', 'loading'],
    ['?accountState=active&metricsState=error', 'error'],
    ['?metricsState=unknown', 'normal'],
  ] as const)('maps %s to %s', (search, expected) => {
    expect(parsePreviewMetricsState(search)).toBe(expected)
  })
})
