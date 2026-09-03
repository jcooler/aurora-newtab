export const TAB_TWO_PREVIEW_METRICS_FIXTURE = 'TAB_TWO_PREVIEW_METRICS_FIXTURE'

export type PreviewMetricsState = 'normal' | 'loading' | 'error'

export function parsePreviewMetricsState(search: string): PreviewMetricsState {
  if (search === TAB_TWO_PREVIEW_METRICS_FIXTURE) return 'normal'
  const state = new URLSearchParams(search).get('metricsState')
  return state === 'loading' || state === 'error' ? state : 'normal'
}
