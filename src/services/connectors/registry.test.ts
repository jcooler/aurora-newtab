import { describe, expect, it } from 'vitest'
import { CONNECTORS, getConnector } from './registry'
import { CONNECTOR_IDS, type ConnectorId } from './types'

// These invariants are written GENERICALLY over CONNECTORS (shipped empty in
// Task 42, populated with RSS in Task 43): a duplicate id, an id outside
// CONNECTOR_IDS, or a registered id that getConnector can't resolve all fail
// immediately, for the current registry and every future descriptor alike.
describe('connector registry invariants', () => {
  it('has no duplicate descriptor ids', () => {
    const ids = CONNECTORS.map((d) => d.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('every registered descriptor id is a known ConnectorId', () => {
    for (const d of CONNECTORS) {
      expect(CONNECTOR_IDS).toContain(d.id)
    }
  })

  it('getConnector resolves every registered descriptor by id', () => {
    for (const d of CONNECTORS) {
      expect(getConnector(d.id)).toBe(d)
    }
  })

  // Completeness direction, written conditionally so it becomes meaningful at
  // Task 43: once ANY connector is registered, EVERY CONNECTOR_ID must map to
  // exactly one descriptor. With RSS the only id, registering RSS makes this a
  // hard full-coverage check; it stays meaningful as the union grows. Vacuous
  // (skipped body) only while the registry is still empty.
  it('once the registry is populated, every CONNECTOR_ID has exactly one descriptor', () => {
    if (CONNECTORS.length === 0) return
    for (const id of CONNECTOR_IDS) {
      const matches = CONNECTORS.filter((d) => d.id === id)
      expect(matches).toHaveLength(1)
    }
  })

  it('getConnector returns undefined for an id with no descriptor', () => {
    // A permanently-unknown id (cast past the ConnectorId type) exercises the
    // miss branch without breaking once real ids gain descriptors in Task 43.
    expect(getConnector('does-not-exist' as ConnectorId)).toBeUndefined()
  })
})
