import { createContext } from 'react'
import type { Layout } from '../../lib/layout/types'

/** Live-drag override merged over the stored layout when `PositionedBlock`
 *  renders. Populated ONLY by `ArrangeController` (via App's `onDraftChange`
 *  callback) while a drag is in flight — at most one entry, the block
 *  currently being dragged. Empty object (the default, no `Provider` or an
 *  idle one) means every block renders its stored (or default) position.
 *
 *  Drafts NEVER reach storage — this is a render-time-only channel so the
 *  dragged block tracks the pointer without writing on every pointermove.
 *  Deliberately minimal and delete-able: retiring arrange mode means
 *  deleting this file and its two call sites (`PositionedBlock`, `App`). */
export const DraftLayoutContext = createContext<Layout>({})
