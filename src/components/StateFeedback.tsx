import type { ReactNode } from 'react'
import type { AsyncResourceState } from '../lib/asyncState'

interface FeedbackProps {
  children: ReactNode
  id?: string
  className?: string
}

export function PoliteStatus({ children, id, className }: FeedbackProps) {
  return (
    <span id={id} className={className} role="status" aria-live="polite" aria-atomic="true">
      {children}
    </span>
  )
}

export function AssertiveAlert({ children, id, className }: FeedbackProps) {
  if (children === null || children === undefined || children === false) return null
  return (
    <span id={id} className={className} role="alert" aria-atomic="true">
      {children}
    </span>
  )
}

interface ResourceFeedbackProps {
  state: AsyncResourceState
  loading: ReactNode
  refreshing: ReactNode
  stale: ReactNode
  offline: ReactNode
  unavailable: ReactNode
  id?: string
  className?: string
}

export function ResourceFeedback({
  state,
  loading,
  refreshing,
  stale,
  offline,
  unavailable,
  id,
  className,
}: ResourceFeedbackProps) {
  if (state.operation === 'pending') {
    return (
      <PoliteStatus id={id} className={className}>
        {state.hasData ? refreshing : loading}
      </PoliteStatus>
    )
  }
  if (state.operation === 'error') {
    if (state.hasData) {
      return <PoliteStatus id={id} className={className}>{offline}</PoliteStatus>
    }
    return <AssertiveAlert id={id} className={className}>{unavailable}</AssertiveAlert>
  }
  if (state.freshness === 'stale') {
    return <PoliteStatus id={id} className={className}>{stale}</PoliteStatus>
  }
  return <PoliteStatus id={id} className={className}>{null}</PoliteStatus>
}
