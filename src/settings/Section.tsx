import type { ReactNode } from 'react'
import { eyebrow } from './sections/shared'

/** One Settings section: a quiet uppercase eyebrow header over its rows (the
 *  control kit's rhythm pass, Task 61). Extracted so the eyebrow, the aria-label
 *  landmark, and the vertical rhythm are enforced BY CONSTRUCTION across every
 *  section rather than copy-pasted per file.
 *
 *  `title` is BOTH the visible eyebrow (CSS-uppercased) and the section's
 *  accessible name (aria-label) — the drawer's tests and the harness query
 *  these landmarks by that name (getByRole('region', { name: 'Widgets' }) …),
 *  so the two can never drift.
 *
 *  Spacing: the section carries its own `py-6` and the parent tabpanel draws the
 *  hairline between siblings (`divide-y divide-hairline`, see Tabs.tsx); the
 *  first section sits flush under the tab bar and the last flush to the bottom.
 *  `as` lets a section render as a <footer> (About) while keeping the rhythm. */
export default function Section({
  title,
  className = '',
  labelledBy,
  children,
}: {
  title?: string
  className?: string
  // When a section already has a visible heading it wants to be named by
  // instead of the eyebrow, it can point aria-labelledby at that id and omit
  // `title`. Unused today; kept so the wrapper doesn't force an eyebrow on a
  // section that shouldn't have one.
  labelledBy?: string
  children: ReactNode
}) {
  return (
    <section
      aria-label={title}
      aria-labelledby={labelledBy}
      className={`py-4 first:pt-0 last:pb-0 ${className}`}
    >
      {title && <h3 className={eyebrow}>{title}</h3>}
      {children}
    </section>
  )
}
