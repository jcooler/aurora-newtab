import type { ComponentPropsWithoutRef, ReactNode } from 'react'
import type { WidgetPresentationState } from '../../widgetSizeContracts'

export type TierFrameTier = 'compact' | 'standard' | 'full'

export interface TierFrameProps extends Omit<ComponentPropsWithoutRef<'section'>, 'aria-label' | 'children' | 'className'> {
  label: string
  tier: TierFrameTier
  state: WidgetPresentationState
  className?: string
  children: ReactNode
}

export default function TierFrame({ label, tier, state, className = '', children, ...sectionProps }: TierFrameProps) {
  return (
    <section
      {...sectionProps}
      aria-label={label}
      data-tier-frame={tier}
      data-tier-frame-state={state}
      className={`tier-frame tier-frame--${tier} bg-panel-solid border-panel-border text-fg shadow-lg shadow-black/25 backdrop-blur-[var(--panel-blur)] ${className}`.trim()}
    >
      {children}
    </section>
  )
}
