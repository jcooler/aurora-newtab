import { describe, expect, it } from 'vitest'

import { TAB_TWO_PREVIEW_METRICS_FIXTURE, parsePreviewMetricsState } from './previewMetricsState'

describe('preview Metrics state fixture', () => {
  it.each([
    ['', 'normal'],
    ['?metricsState=loading', 'loading'],
    ['?accountState=active&metricsState=error', 'error'],
    ['?metricsState=unknown', 'normal'],
  ] as const)('maps %s to %s', (search, expected) => {
    expect(parsePreviewMetricsState(search)).toBe(expected)
  })

  it('keeps its preview-only marker observable for artifact isolation', () => {
    expect(parsePreviewMetricsState(TAB_TWO_PREVIEW_METRICS_FIXTURE)).toBe('normal')
  })
})
