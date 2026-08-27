import type { ComponentPropsWithoutRef, ReactNode } from 'react'
import type { AsyncResourceState } from '../../../lib/asyncState'
import type { WidgetPresentationState } from '../../widgetSizeContracts'

export type TierFrameTier = 'compact' | 'standard' | 'full'

export interface TierFrameProps extends Omit<ComponentPropsWithoutRef<'section'>, 'aria-label' | 'children' | 'className'> {
  label: string
  tier: TierFrameTier
  state: WidgetPresentationState
  surface?: 'card' | 'none'
  className?: string
  children: ReactNode
}

export function resourceFrameState(
  state: AsyncResourceState,
  empty = false,
): WidgetPresentationState {
  if (state.operation === 'error') return state.hasData ? 'partial' : 'hard-error'
  if (!state.hasData) return 'loading'
  if (state.freshness === 'stale') return 'stale'
  return empty ? 'empty' : 'ready'
}

export function ResourceFrameStatus({
  label,
  tier,
  state,
  message,
}: {
  label: string
  tier: TierFrameTier
  state: Extract<WidgetPresentationState, 'loading' | 'empty' | 'hard-error'>
  message?: string
}) {
  const copy = message ?? (
    state === 'loading'
      ? `Loading ${label}.`
      : state === 'empty'
        ? `${label} has no items right now.`
        : `${label} is unavailable.`
  )
  return (
    <TierFrame
      label={label}
      tier={tier}
      state={state}
      aria-busy={state === 'loading' ? true : undefined}
      className="flex items-center justify-center p-3 text-center"
    >
      <p role={state === 'hard-error' ? 'alert' : 'status'} className="text-sm text-fg-muted">{copy}</p>
    </TierFrame>
  )
}

export default function TierFrame({ label, tier, state, surface = 'card', className = '', children, ...sectionProps }: TierFrameProps) {
  const surfaceClasses = surface === 'card'
    ? 'bg-panel-solid border-panel-border shadow-lg shadow-black/25 backdrop-blur-[var(--panel-blur)]'
    : ''
  return (
    <section
      {...sectionProps}
      aria-label={label}
      data-tier-frame={tier}
      data-tier-frame-state={state}
      data-tier-surface={surface}
      className={`tier-frame tier-frame--${tier} ${surfaceClasses} text-fg ${className}`.trim()}
    >
      {children}
    </section>
  )
}
