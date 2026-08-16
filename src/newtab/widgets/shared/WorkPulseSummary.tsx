export type WorkPulseTone = 'quiet' | 'attention' | 'critical' | 'unknown'

const TONE_CLASS: Record<WorkPulseTone, string> = {
  quiet: 'text-fg-muted',
  attention: 'text-accent',
  critical: 'text-red-400',
  unknown: 'text-canvas-fg-muted',
}

export default function WorkPulseSummary({
  label,
  value,
  tone,
  metadata,
}: {
  label: string
  value: string
  tone: WorkPulseTone
  metadata?: string
}) {
  const accessible = `${label}: ${value}${metadata ? `, ${metadata}` : ''}`
  return (
    <div
      aria-label={accessible}
      data-work-pulse-summary
      data-work-pulse-tone={tone}
      className="flex min-w-0 items-baseline justify-between gap-2"
    >
      <span data-work-pulse-value className={`min-w-0 truncate text-sm font-medium ${TONE_CLASS[tone]}`}>
        {value}
      </span>
      {metadata && (
        <span
          aria-hidden="true"
          data-stage-text-tier="metadata"
          data-work-pulse-metadata
          className="shrink-0 text-xs text-fg-muted"
        >
          {metadata}
        </span>
      )}
    </div>
  )
}
