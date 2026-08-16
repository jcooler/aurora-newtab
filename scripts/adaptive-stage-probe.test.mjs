import { describe, expect, it } from 'vitest'
import { adaptiveStageProbeOk } from './adaptive-stage-probe.mjs'

const passingProbe = Object.freeze({
  rootOwned: true,
  tokenExact: true,
  profileExact: true,
  densityExact: true,
  stageCapacityExact: true,
  dockTrackContract: true,
  dockExplicitTracksExact: true,
  dockInlineSizeExact: true,
  persistentTargetsExact: true,
  unique: true,
  exactlyOnceClock: true,
  clockProtected: true,
  semanticWrappers: true,
  finiteGeometry: true,
  finiteBoardContained: true,
  noPageHorizontalScroll: true,
  noVerticalScroll: true,
  noOverlap: true,
  descendantPaintContained: true,
  noPaintOverlap: true,
  compactReadable: true,
  noRootTransform: true,
  dockPresent: true,
  dockReachable: true,
  dockZoneParentExact: true,
  dockReasonExact: true,
  closedBookmarksStackingNeutral: true,
  closedBookmarksHitTestNeutral: true,
})

describe('W3-P2 normal probe aggregate', () => {
  it('accepts a row only when every normal predicate is true', () => {
    expect(adaptiveStageProbeOk(passingProbe)).toBe(true)
  })

  it.each(['finiteBoardContained', 'noPageHorizontalScroll', 'noVerticalScroll'])('rejects a false %s predicate', (predicate) => {
    expect(adaptiveStageProbeOk({ ...passingProbe, [predicate]: false })).toBe(false)
  })
})
