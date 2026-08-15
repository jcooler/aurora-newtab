export type OperationState = 'idle' | 'pending' | 'success' | 'error'

export type FreshnessState = 'unknown' | 'fresh' | 'stale'

export interface OperationFeedbackState {
  operation: OperationState
  retainedError: boolean
}

export interface AsyncResourceState {
  operation: OperationState
  freshness: FreshnessState
  hasData: boolean
}

function finite(value: number, name: string): void {
  if (!Number.isFinite(value)) throw new RangeError(`${name} must be finite`)
}

export function freshnessAt(
  fetchedAt: number | null,
  ttlMs: number,
  now: number,
): FreshnessState {
  finite(ttlMs, 'ttlMs')
  if (ttlMs < 0) throw new RangeError('ttlMs must not be negative')
  finite(now, 'now')
  if (fetchedAt === null) return 'unknown'
  finite(fetchedAt, 'fetchedAt')
  return now - fetchedAt < ttlMs ? 'fresh' : 'stale'
}

export function resourceStateOf(input: {
  hasData: boolean
  fetchedAt: number | null
  ttlMs: number
  pending: boolean
  error: string | null
  now: number
}): AsyncResourceState {
  const freshness = freshnessAt(input.fetchedAt, input.ttlMs, input.now)
  let operation: OperationState
  if (input.pending) {
    operation = 'pending'
  } else if (input.error !== null) {
    operation = 'error'
  } else if (input.hasData) {
    operation = 'success'
  } else {
    operation = 'idle'
  }
  return { operation, freshness, hasData: input.hasData }
}
