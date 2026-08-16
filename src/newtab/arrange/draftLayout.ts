import { createContext } from 'react'
import type { Layout, LayoutProfile } from '../../lib/layout/types'
import type { ProfileOverrides } from './profileEditor'

/** In-memory planner input for W3-P3. It is never written until Save. */
export interface ArrangePreview {
  profile: LayoutProfile
  overrides: ProfileOverrides
}

/** W3-P4 cleanup seam for the now-unused percentage PositionBlock bridge. */
export const DraftLayoutContext = createContext<Layout>({})
