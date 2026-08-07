export const BLOCK_IDS = [
  'clock', 'greeting', 'worldClocks', 'countdown', 'search', 'focus', 'links',
  'quote', 'weather', 'timer', 'tasks', 'notes', 'bookmarks', 'rss',
] as const
export type BlockId = (typeof BLOCK_IDS)[number]
/** Block CENTER as percent of viewport (0-100 each axis), finite. */
export interface BlockPos { x: number; y: number }
export type Layout = Partial<Record<BlockId, BlockPos>>
