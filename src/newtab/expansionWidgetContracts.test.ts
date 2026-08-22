import { describe, expect, it } from 'vitest'

import { DEFAULT_WIDGET_POINTS } from '../lib/layout/defaultPlacements'
import { BLOCK_IDS, type BlockId } from '../lib/layout/types'
import { defaults } from '../lib/storage/schema'
import { WIDGET_REGISTRY } from './widgetRegistry'
import { WIDGET_RENDERERS, WIDGET_RENDERER_KEYS } from './widgetRenderers'
import { WIDGET_SIZE_CONTRACTS } from './widgetSizeContracts'
import { CATALOG_BATCHES, CATALOG_CONTRACTS, captureTiersFor } from '../../scripts/widget-catalog-manifest.mjs'

const EXPECTED_WIDGET_IDS = [
  'bookmarks', 'clock', 'countdown', 'crypto', 'focus', 'github', 'gitlab',
  'greeting', 'habits', 'homeassistant', 'ics', 'jira', 'links', 'monthCal',
  'moon', 'notes', 'quote', 'rss', 'search', 'status', 'sun', 'tasks', 'timer',
  'vercel', 'weather', 'worldClocks',
] as const satisfies readonly BlockId[]

function sorted(values: readonly string[]) {
  return [...values].sort()
}

describe('expansion widget authorities', () => {
  it('keeps every current identity in registry, size, placement, and renderer parity', () => {
    const expected = [...EXPECTED_WIDGET_IDS]
    expect(sorted(BLOCK_IDS)).toEqual(expected)
    expect(sorted(WIDGET_REGISTRY.map((entry) => entry.id))).toEqual(expected)
    expect(sorted(Object.keys(WIDGET_SIZE_CONTRACTS))).toEqual(expected)
    expect(sorted(Object.keys(DEFAULT_WIDGET_POINTS))).toEqual(expected)
    expect(sorted(Object.keys(WIDGET_RENDERERS))).toEqual(expected)
    expect(sorted(WIDGET_RENDERER_KEYS)).toEqual(expected)
  })

  it('maps every registry identity to its own renderer identity', () => {
    expect(WIDGET_REGISTRY.map((entry) => [entry.id, entry.rendererKey])).toEqual(
      WIDGET_REGISTRY.map((entry) => [entry.id, entry.id]),
    )
  })

  it('keeps declared sizes and Docked support truthful and nonblank', () => {
    for (const entry of WIDGET_REGISTRY) {
      const contract = WIDGET_SIZE_CONTRACTS[entry.id]
      expect(entry.canvasSizes).toEqual(contract.sizes)
      for (const size of ['compact', 'standard', 'full'] as const) {
        const promise = contract[size]
        expect(typeof promise === 'string' && promise.trim().length > 0).toBe(contract.sizes.includes(size))
      }
      const hasDocked = typeof contract.docked === 'string' && contract.docked.trim().length > 0
      expect(entry.supportsDocked).toBe(hasDocked)
    }
  })

  it('resolves every widget-backed availability key through storage defaults', () => {
    const toggles = defaults().settings.widgets
    for (const entry of WIDGET_REGISTRY) {
      if (entry.availability.kind === 'widget') {
        expect(Object.hasOwn(toggles, entry.availability.key)).toBe(true)
        expect(typeof toggles[entry.availability.key]).toBe('boolean')
      }
    }
  })

  it('captures every free tier and Docked promise exactly once across disjoint batches', () => {
    const first = CATALOG_BATCHES['1'].map(({ id }) => id)
    const second = CATALOG_BATCHES['2'].map(({ id }) => id)
    expect(sorted([...first, ...second])).toEqual([...EXPECTED_WIDGET_IDS])
    expect(new Set(first.filter((id) => second.includes(id))).size).toBe(0)

    for (const id of BLOCK_IDS) {
      const tiers = captureTiersFor(id)
      expect(tiers.filter((tier) => tier !== 'docked')).toEqual(WIDGET_SIZE_CONTRACTS[id].sizes)
      const hasDockedPromise = typeof WIDGET_SIZE_CONTRACTS[id].docked === 'string'
        && WIDGET_SIZE_CONTRACTS[id].docked!.trim().length > 0
      expect(tiers.includes('docked')).toBe(hasDockedPromise)

      const batchContracts = Object.values(CATALOG_CONTRACTS)
        .find((contracts) => Object.hasOwn(contracts, id))
      expect(batchContracts?.[id]).toEqual(Object.fromEntries(
        ['compact', 'standard', 'full', 'docked']
          .flatMap((tier) => {
            const promise = WIDGET_SIZE_CONTRACTS[id][tier as keyof typeof WIDGET_SIZE_CONTRACTS[typeof id]]
            return typeof promise === 'string' && promise.trim().length > 0 ? [[tier, promise]] : []
          }),
      ))
    }
  })
})
