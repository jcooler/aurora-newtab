import { describe, expect, it } from 'vitest'
import { DENSITY_TOKENS, type Density } from '../lib/layout/adaptiveStage'
import { BLOCK_IDS, WIDGET_VARIANTS, type BlockId, type WidgetVariant } from '../lib/layout/types'
import { DOCK_BLOCK_SIZES } from './dockBlockSizes'
import { WIDGET_REGISTRY } from './widgetRegistry'

const densities: readonly Density[] = ['compact', 'balanced', 'spacious']
const connectorIds = new Set(WIDGET_REGISTRY.filter(({ availability }) => availability.kind === 'connector').map(({ id }) => id))
type RawCalibration = Readonly<Record<BlockId, Readonly<Record<WidgetVariant, readonly [number, number, number]>>>>

// Chromium 1600x900 source measurements from scripts/calibrate-dock-block-sizes.mjs.
// Each tuple is the isolated BoardItem outer height at compact/balanced/spacious.
const RAW_OUTER_HEIGHTS: RawCalibration = {
  clock: { compact: [240, 240, 240], standard: [240, 240, 240], expanded: [240, 240, 240] },
  greeting: { compact: [64, 80, 96], standard: [64, 80, 96], expanded: [64, 80, 96] },
  worldClocks: { compact: [244, 184, 164], standard: [104, 84, 96], expanded: [64, 80, 96] },
  countdown: { compact: [64, 80, 96], standard: [64, 80, 96], expanded: [64, 80, 96] },
  search: { compact: [70, 80, 96], standard: [70, 80, 96], expanded: [70, 80, 96] },
  focus: { compact: [108, 108, 116], standard: [108, 108, 116], expanded: [108, 108, 116] },
  links: { compact: [292, 292, 332], standard: [188, 164, 188], expanded: [256, 196, 196] },
  quote: { compact: [94, 80, 96], standard: [98, 80, 96], expanded: [120, 80, 96] },
  weather: { compact: [64, 80, 96], standard: [184.5, 156.5, 117.25], expanded: [117.25, 117.25, 117.25] },
  timer: { compact: [64, 80, 96], standard: [64, 80, 96], expanded: [64, 80, 96] },
  tasks: { compact: [64, 80, 96], standard: [64, 80, 96], expanded: [64, 80, 96] },
  notes: { compact: [64, 80, 96], standard: [64, 80, 96], expanded: [64, 80, 96] },
  bookmarks: { compact: [64, 80, 96], standard: [64, 80, 96], expanded: [64, 80, 96] },
  rss: { compact: [92, 92, 108], standard: [336, 336, 400], expanded: [336, 336, 400] },
  github: { compact: [121, 121, 129], standard: [415, 415, 447], expanded: [415, 415, 447] },
  gitlab: { compact: [121, 121, 129], standard: [487, 487, 527], expanded: [487, 487, 527] },
  jira: { compact: [76, 80, 96], standard: [307, 307, 347], expanded: [307, 307, 347] },
  vercel: { compact: [100, 100, 108], standard: [300, 300, 340], expanded: [300, 300, 340] },
  crypto: { compact: [64, 80, 96], standard: [64, 80, 96], expanded: [64, 80, 96] },
  ics: { compact: [78, 80, 96], standard: [124, 124, 132], expanded: [124, 124, 132] },
  habits: { compact: [116, 116, 140], standard: [256, 256, 304], expanded: [256, 256, 304] },
  monthCal: { compact: [98, 98, 106], standard: [282, 282, 290], expanded: [282, 282, 290] },
  sun: { compact: [64, 80, 96], standard: [64, 80, 96], expanded: [64, 80, 96] },
  moon: { compact: [64, 80, 96], standard: [64, 80, 96], expanded: [64, 80, 96] },
  status: { compact: [64, 80, 96], standard: [64, 80, 96], expanded: [64, 80, 96] },
  homeassistant: { compact: [64, 80, 96], standard: [92, 92, 100], expanded: [92, 92, 100] },
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
      if (connectorIds.has(id)) continue
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

  it('uses the shared condensed wrapper instead of full-renderer height calibration for every connector', () => {
    expect([...connectorIds].sort()).toEqual(['crypto', 'github', 'gitlab', 'homeassistant', 'ics', 'jira', 'rss', 'status', 'vercel'])
    for (const id of connectorIds) expect(DOCK_BLOCK_SIZES[id]).toBeUndefined()
  })
})
