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

  // Completeness direction, written conditionally so it becomes meaningful
  // once the catalog is believed complete. Originally triggered on ANY
  // registration (CONNECTORS.length === 0), which held while RSS was the
  // only known id — but Task 46 grows CONNECTOR_IDS to seven ids ahead of
  // their descriptors (github/gitlab/jira/vercel/crypto/ics land in later
  // sub-project-2 tasks; CONNECTORS deliberately stays rss-only until each
  // one does — same additive, incremental-registration principle as the
  // Connectors.tsx body map). Gating on a LENGTH match instead keeps the
  // check vacuous through every partial state and meaningful again exactly
  // when the last connector is registered, rather than firing (and failing
  // by design) on every task in between.
  it('once every CONNECTOR_ID has a registered descriptor, each maps to exactly one', () => {
    if (CONNECTORS.length !== CONNECTOR_IDS.length) return
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
