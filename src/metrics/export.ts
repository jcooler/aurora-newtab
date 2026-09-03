import { assertMetricsHistory } from './history'
import type { MetricsHistoryV1 } from './types'

const PRODUCT = 'Tab Two' as const
const KIND = 'metrics-history' as const

function canonicalIso(value: string): boolean {
  try {
    return new Date(value).toISOString() === value
  } catch {
    return false
  }
}

export function serializeMetricsExport(history: MetricsHistoryV1, exportedAt: string): string {
  assertMetricsHistory(history)
  if (!canonicalIso(exportedAt)) throw new Error('metrics_export_invalid')
  return JSON.stringify({
    product: PRODUCT,
    kind: KIND,
    version: 1,
    exportedAt,
    history,
  }, null, 2)
}
