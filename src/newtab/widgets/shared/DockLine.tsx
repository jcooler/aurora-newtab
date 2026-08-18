import { Fragment } from 'react'
import { TONE_CLASS, type WorkPulseTone } from './WorkPulseSummary'

/** One Docked-tier dense line (named-layouts spec 2.3): text-first facts
 *  separated by middle dots, tinted by the shared Work Pulse tone. Renders
 *  NOTHING when no fact survives — an empty line is not a tier (the
 *  no-whitespace law), so a widget with no data simply has no dock line. */
export default function DockLine({
  label,
  facts,
  tone = 'quiet',
}: {
  /** Accessible name prefix, e.g. "GitHub". */
  label: string
  /** Ordered dense facts; falsy entries are dropped. */
  facts: readonly (string | null | undefined | false)[]
  tone?: WorkPulseTone
}) {
  const surviving = facts.filter((fact): fact is string => Boolean(fact))
  if (surviving.length === 0) return null
  return (
    <span
      data-dock-line=""
      aria-label={`${label}: ${surviving.join(', ')}`}
      className="dock-line"
    >
      {surviving.map((fact, index) => (
        <Fragment key={`${index}-${fact}`}>
          {index > 0 ? (
            <span aria-hidden className="dock-line__dot text-fg-muted">·</span>
          ) : null}
          <span className={index === 0 ? `font-medium ${TONE_CLASS[tone]}` : 'text-fg-muted'}>
            {fact}
          </span>
        </Fragment>
      ))}
    </span>
  )
}
