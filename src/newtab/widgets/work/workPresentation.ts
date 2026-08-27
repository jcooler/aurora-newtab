import type { AsyncResourceState } from '../../../lib/asyncState'

export type WorkPresentationState =
  | 'setup'
  | 'loading'
  | 'empty'
  | 'hard-error'
  | 'retained-error'
  | 'stale'
  | 'ready'

export function workPresentationState(
  configured: boolean,
  state: AsyncResourceState,
  empty: boolean,
): WorkPresentationState {
  if (!configured) return 'setup'
  if (state.operation === 'pending' && !state.hasData) return 'loading'
  if (state.operation === 'error' && !state.hasData) return 'hard-error'
  if (state.operation === 'error') return 'retained-error'
  if (state.hasData && state.freshness === 'stale') return 'stale'
  if (state.hasData && empty) return 'empty'
  return state.hasData ? 'ready' : 'loading'
}

export function compactFacts(
  facts: readonly (string | null | undefined | false)[],
): string[] {
  return facts.filter((fact): fact is string => typeof fact === 'string' && fact.length > 0)
}

export const workRowClass =
  'text-fg-muted transition-colors group-hover:text-fg group-focus-within:text-fg motion-reduce:transition-none'
