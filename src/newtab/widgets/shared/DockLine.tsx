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
      {/* The chip law (owner-approved 2026-08-18): the LINE owns its color —
          soft at rest, full on hover (.dock-line CSS). Secondary facts use
          RELATIVE opacity (the same 0.68 the muted token carries) instead of
          a fixed muted color, so they brighten with the line; the quiet tone
          inherits for the same reason, while real tones (attention/critical)
          keep their semantic tints. */}
      {surviving.map((fact, index) => (
        <Fragment key={`${index}-${fact}`}>
          {index > 0 ? (
            <span aria-hidden className="dock-line__dot opacity-[0.68]">·</span>
          ) : null}
          <span className={index === 0 ? `font-medium ${tone === 'quiet' ? '' : TONE_CLASS[tone]}` : 'opacity-[0.68]'}>
            {fact}
          </span>
        </Fragment>
      ))}
    </span>
  )
}
