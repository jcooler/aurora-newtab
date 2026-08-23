import type { ReactNode } from 'react'
import type { WidgetPresentationState } from '../../widgetSizeContracts'

export type TierFrameTier = 'compact' | 'standard' | 'full'

export interface TierFrameProps {
  label: string
  tier: TierFrameTier
  state: WidgetPresentationState
  className?: string
  children: ReactNode
}

export default function TierFrame({ label, tier, state, className = '', children }: TierFrameProps) {
  return (
    <section
      aria-label={label}
      data-tier-frame={tier}
      data-tier-frame-state={state}
      className={`tier-frame tier-frame--${tier} bg-panel-solid border-panel-border text-fg shadow-lg shadow-black/25 backdrop-blur-[var(--panel-blur)] ${className}`.trim()}
    >
      {children}
    </section>
  )
}
