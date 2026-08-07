import { afterEach, describe, expect, it } from 'vitest'
import { CONNECTORS, getConnector, releasableOrigins } from './registry'
import {
  CONNECTOR_IDS,
  type ConnectorConfig,
  type ConnectorDescriptor,
  type ConnectorId,
  type GithubConfig,
  type JiraConfig,
  type RssConfig,
} from './types'

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

// releasableOrigins needs a SECOND registered connector to exercise the
// "shared origin" cases, but CONNECTORS is rss-only until Tasks 48-51 land
// their real descriptors. CONNECTORS is a `const` BINDING but a mutable
// array, so each test below pushes a fake descriptor onto the real registry
// (under an id CONNECTOR_IDS already reserves but no real descriptor uses
// yet — 'github'/'jira') and afterEach restores the original contents. Same
// fake-descriptor-cast-to-base pattern as backup.test.ts and this file's own
// authState fixture in SettingsPanel.test.tsx.
describe('releasableOrigins', () => {
  const original = [...CONNECTORS]

  afterEach(() => {
    CONNECTORS.length = 0
    CONNECTORS.push(...original)
  })

  const fakeGithub: ConnectorDescriptor<GithubConfig> = {
    id: 'github',
    label: 'Fake Github',
    blurb: 'test',
    auth: 'token',
    ttlMs: 1_000,
    secretFields: ['token'],
    identityField: 'username',
    origins: () => ['https://shared.example.com/*'],
  }

  const fakeJiraThrows: ConnectorDescriptor<JiraConfig> = {
    id: 'jira',
    label: 'Fake Jira (bad row)',
    blurb: 'test',
    auth: 'token',
    ttlMs: 1_000,
    secretFields: ['apiToken'],
    identityField: 'displayName',
    origins: () => {
      throw new Error('malformed config')
    },
  }

  const rssConfig: RssConfig = { enabled: true, feeds: ['https://shared.example.com/feed'], shownCount: 5 }

  it('an origin used only by the disconnecting connector is returned', () => {
    const configs: Partial<Record<ConnectorId, ConnectorConfig>> = { rss: rssConfig }
    expect(releasableOrigins('rss', configs)).toEqual(['https://shared.example.com/*'])
  })

  it('an origin also derived by another ENABLED connector is withheld', () => {
    CONNECTORS.push(fakeGithub as ConnectorDescriptor)
    const githubConfig: GithubConfig = { enabled: true, token: 't', username: 'octocat' }
    const configs: Partial<Record<ConnectorId, ConnectorConfig>> = { rss: rssConfig, github: githubConfig }
    expect(releasableOrigins('rss', configs)).toEqual([])
  })

  it('a DISABLED other connector does not withhold its shared origin', () => {
    CONNECTORS.push(fakeGithub as ConnectorDescriptor)
    const githubConfig: GithubConfig = { enabled: false, token: 't', username: 'octocat' }
    const configs: Partial<Record<ConnectorId, ConnectorConfig>> = { rss: rssConfig, github: githubConfig }
    expect(releasableOrigins('rss', configs)).toEqual(['https://shared.example.com/*'])
  })

  it("a bad config row whose origins() throws is swept over, not thrown out of", () => {
    CONNECTORS.push(fakeJiraThrows as ConnectorDescriptor)
    const jiraConfig: JiraConfig = { enabled: true, email: 'a@b.com', apiToken: 't', site: 'x', displayName: 'x' }
    const configs: Partial<Record<ConnectorId, ConnectorConfig>> = { rss: rssConfig, jira: jiraConfig }
    expect(() => releasableOrigins('rss', configs)).not.toThrow()
    expect(releasableOrigins('rss', configs)).toEqual(['https://shared.example.com/*'])
  })

  it('an id with no config for the disconnecting connector returns []', () => {
    expect(releasableOrigins('github', {})).toEqual([])
  })
})
