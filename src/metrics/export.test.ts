import { describe, expect, it } from 'vitest'
import { serializeMetricsExport } from './export'
import type { MetricsHistoryV1 } from './types'

const history: MetricsHistoryV1 = {
  version: 1,
  installationId: '11111111-1111-4111-8111-111111111111',
  buckets: [{
    schemaVersion: 1,
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    date: '2026-09-02',
    source: 'development',
    sourceInstanceId: 'github',
    installationId: '11111111-1111-4111-8111-111111111111',
    sequence: 1,
    values: { kind: 'development', commits: 4, reviews: 2, issues: 1, deployments: 3, failures: 1 },
  }],
}

describe('metrics export', () => {
  it('serializes one explicit, stable aggregate-only envelope', () => {
    expect(JSON.parse(serializeMetricsExport(history, '2026-09-02T21:00:00.000Z'))).toEqual({
      product: 'Tab Two',
      kind: 'metrics-history',
      version: 1,
      exportedAt: '2026-09-02T21:00:00.000Z',
      history,
    })
  })

  it('rejects an invalid export timestamp and malformed history', () => {
    expect(() => serializeMetricsExport(history, 'today')).toThrow('metrics_export_invalid')
    expect(() => serializeMetricsExport({ ...history, installationId: 'Desktop' }, '2026-09-02T21:00:00.000Z')).toThrow('metric_history_invalid')
  })
})
