import { describe, expect, it } from 'vitest'
import { DENSITY_TOKENS, type Density } from '../lib/layout/adaptiveStage'
import { BLOCK_IDS, WIDGET_VARIANTS, type BlockId, type WidgetVariant } from '../lib/layout/types'
import { DOCK_BLOCK_SIZES } from './dockBlockSizes'

const densities: readonly Density[] = ['compact', 'balanced', 'spacious']
type RawCalibration = Readonly<Record<BlockId, Readonly<Record<WidgetVariant, readonly [number, number, number]>>>>

// Chromium 1600x900 source measurements from scripts/calibrate-dock-block-sizes.mjs.
// Each tuple is the isolated BoardItem outer height at compact/balanced/spacious.
const RAW_OUTER_HEIGHTS: RawCalibration = {
  clock: { compact: [240, 240, 240], standard: [240, 240, 240], expanded: [240, 240, 240] },
  greeting: { compact: [64, 80, 96], standard: [64, 80, 96], expanded: [64, 80, 96] },
  worldClocks: { compact: [292, 220, 220], standard: [148, 100, 100], expanded: [100, 80, 96] },
  countdown: { compact: [76, 80, 96], standard: [64, 80, 96], expanded: [64, 80, 96] },
  search: { compact: [68, 80, 96], standard: [68, 80, 96], expanded: [68, 80, 96] },
  focus: { compact: [108, 108, 108], standard: [108, 108, 108], expanded: [108, 108, 108] },
  links: { compact: [286.625, 286.625, 286.625], standard: [183.969, 161.313, 121.313], expanded: [408, 268, 268] },
  quote: { compact: [72, 80, 96], standard: [64, 80, 96], expanded: [168, 120, 96] },
  weather: { compact: [74, 80, 96], standard: [74, 80, 96], expanded: [64, 80, 96] },
  timer: { compact: [64, 80, 96], standard: [64, 80, 96], expanded: [64, 80, 96] },
  tasks: { compact: [64, 80, 96], standard: [64, 80, 96], expanded: [64, 80, 96] },
  notes: { compact: [64, 80, 96], standard: [64, 80, 96], expanded: [64, 80, 96] },
  bookmarks: { compact: [64, 80, 96], standard: [64, 80, 96], expanded: [64, 80, 96] },
  rss: { compact: [92, 92, 96], standard: [336, 336, 336], expanded: [336, 336, 336] },
  github: { compact: [93, 93, 96], standard: [411, 411, 411], expanded: [411, 411, 411] },
  gitlab: { compact: [93, 93, 96], standard: [479.5, 479.5, 479.5], expanded: [479.5, 479.5, 479.5] },
  jira: { compact: [64, 80, 96], standard: [303.5, 303.5, 303.5], expanded: [303.5, 303.5, 303.5] },
  vercel: { compact: [78, 80, 96], standard: [216, 216, 216], expanded: [216, 216, 216] },
  crypto: { compact: [64, 80, 96], standard: [64, 80, 96], expanded: [64, 80, 96] },
  ics: { compact: [64, 80, 96], standard: [96, 96, 96], expanded: [96, 96, 96] },
  habits: { compact: [116, 116, 140], standard: [244, 244, 244], expanded: [244, 244, 244] },
  monthCal: { compact: [87.657, 87.657, 96], standard: [247, 247, 247], expanded: [247, 247, 247] },
  sun: { compact: [64, 80, 96], standard: [64, 80, 96], expanded: [64, 80, 96] },
  moon: { compact: [64, 80, 96], standard: [64, 80, 96], expanded: [64, 80, 96] },
  status: { compact: [64, 80, 96], standard: [64, 80, 96], expanded: [64, 80, 96] },
  homeassistant: { compact: [64, 80, 96], standard: [82, 82, 96], expanded: [82, 82, 96] },
}

describe('Dock renderer block-size compatibility bridge', () => {
  it('records every schema-valid id/variant/density calibration, including unsupported registry variants', () => {
    expect(Object.keys(RAW_OUTER_HEIGHTS).sort()).toEqual([...BLOCK_IDS].sort())
    for (const id of BLOCK_IDS) {
      expect(Object.keys(RAW_OUTER_HEIGHTS[id]).sort()).toEqual([...WIDGET_VARIANTS].sort())
      for (const variant of WIDGET_VARIANTS) expect(RAW_OUTER_HEIGHTS[id][variant]).toHaveLength(densities.length)
    }
  })

  it('uses a measured-headroom contract for every renderer taller than the density track', () => {
    for (const id of BLOCK_IDS) {
      for (const variant of WIDGET_VARIANTS) {
        densities.forEach((density, index) => {
          const raw = RAW_OUTER_HEIGHTS[id][variant][index]
          const track = DENSITY_TOKENS[density].minimumTrack
          const contract = DOCK_BLOCK_SIZES[id]?.[variant]?.[density]
          if (raw > track) {
            expect(contract, `${id}/${variant}/${density}: raw ${raw}px`).toBeGreaterThan(raw)
          } else {
            expect(contract ?? track, `${id}/${variant}/${density}: fallback`).toBeGreaterThanOrEqual(raw)
          }
        })
      }
    }
  })
})
