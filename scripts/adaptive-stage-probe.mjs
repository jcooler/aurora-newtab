export function adaptiveStageProbeOk(row) {
  return row.rootOwned && row.tokenExact && row.profileExact && row.densityExact &&
    row.stageCapacityExact && row.dockTrackContract && row.dockExplicitTracksExact && row.dockInlineSizeExact && row.persistentTargetsExact &&
    row.unique && row.exactlyOnceClock && row.clockProtected && row.semanticWrappers && row.finiteGeometry &&
    row.finiteBoardContained && row.noPageHorizontalScroll && row.noVerticalScroll &&
    row.noOverlap && row.descendantPaintContained && row.noPaintOverlap && row.compactReadable &&
    row.noRootTransform && row.dockPresent && row.dockReachable && row.dockZoneParentExact && row.dockReasonExact &&
    row.closedBookmarksStackingNeutral && row.closedBookmarksHitTestNeutral
}
