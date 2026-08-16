import type { Density, DockBlockSizeTable } from '../lib/layout/adaptiveStage'

type DensitySizes = Readonly<Partial<Record<Density, number>>>

const sizes = (compact?: number, balanced?: number, spacious?: number): DensitySizes => Object.freeze({
  ...(compact === undefined ? {} : { compact }),
  ...(balanced === undefined ? {} : { balanced }),
  ...(spacious === undefined ? {} : { spacious }),
})

const clock = sizes(248, 248, 248)
const focus = sizes(112, 112, 120)
const linksCompact = sizes(296, 296, 336)
const linksStandard = sizes(192, 168, 192)
const linksExpanded = sizes(416, 272, 272)
const tallHabits = sizes(264, 264, 312)
const tallMonth = sizes(288, 288, 296)

/**
 * Temporary W3 compatibility bridge for preserved Dock renderers whose
 * max-content block size exceeds one density track. Values are rounded above
 * isolated Chromium source measurements; missing entries deliberately use
 * the density track. The frozen registry remains layout metadata only.
 */
export const DOCK_BLOCK_SIZES: DockBlockSizeTable = Object.freeze({
  clock: Object.freeze({ compact: clock, standard: clock, expanded: clock }),
  worldClocks: Object.freeze({
    compact: sizes(296, 224, 224),
    standard: sizes(152, 104, 104),
    expanded: sizes(104),
  }),
  countdown: Object.freeze({ compact: sizes(80) }),
  search: Object.freeze({ compact: sizes(72), standard: sizes(72), expanded: sizes(72) }),
  focus: Object.freeze({ compact: focus, standard: focus, expanded: focus }),
  links: Object.freeze({ compact: linksCompact, standard: linksStandard, expanded: linksExpanded }),
  quote: Object.freeze({ compact: sizes(96), standard: sizes(104), expanded: sizes(176, 128) }),
  weather: Object.freeze({ compact: sizes(80), standard: sizes(192, 160, 120), expanded: sizes(120, 120, 120) }),
  habits: Object.freeze({ compact: sizes(120, 120, 144), standard: tallHabits, expanded: tallHabits }),
  monthCal: Object.freeze({ compact: sizes(104, 104, 112), standard: tallMonth, expanded: tallMonth }),
} satisfies DockBlockSizeTable)
