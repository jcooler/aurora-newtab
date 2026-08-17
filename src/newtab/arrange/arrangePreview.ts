import type { LayoutProfile } from '../../lib/layout/types'
import type { ProfileOverrides } from './profileEditor'

/** In-memory planner input for Arrange. It is never written until Save. */
export interface ArrangePreview {
  profile: LayoutProfile
  overrides: ProfileOverrides
  useDesktopLayoutEverywhere?: true
}
