import { createContext } from 'react'
import type { Layout } from '../../lib/layout/types'

/** Live-position override merged over the stored layout when `PositionedBlock`
 *  renders. Populated ONLY by `ArrangeController` (via App's `onDraftChange`
 *  callback) while arrange mode is on — every block touched so far this
 *  session (dragged OR keyboard-nudged) gets an entry, not just "at most one":
 *  the keyboard-nudge path has always sent the whole `nudged` map on every
 *  keystroke, and the pointer-drag path now does too on drop (review fix I2)
 *  specifically so the just-dropped block keeps rendering its committed
 *  position instead of one flickered frame at its stale pre-drag one while
 *  storage's async echo is still in flight. Empty object (the default, no
 *  `Provider`, an idle one, or after `exit()` clears it) means every block
 *  renders its stored (or default) position.
 *
 *  Drafts NEVER reach storage — this is a render-time-only channel so a
 *  dragged/nudged block tracks its live position without a write on every
 *  pointermove. Deliberately minimal and delete-able: retiring arrange mode
 *  means deleting this file and its two call sites (`PositionedBlock`,
 *  `App`). */
export const DraftLayoutContext = createContext<Layout>({})
