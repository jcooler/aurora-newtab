import { afterEach, describe, expect, it } from 'vitest'
import { CONNECTORS, getConnector, releasableOrigins, heldOrigins, ownedConnectorOriginPatterns } from './registry'
import {
  CATEGORY_ORDER,
  CONNECTOR_IDS,
  type ConnectorCategory,
  type ConnectorConfig,
  type ConnectorDescriptor,
  type ConnectorId,
  type GithubConfig,
  type GitlabConfig,
  type JiraConfig,
  type RssConfig,
} from './types'

// These invariants are written GENERICALLY over CONNECTORS (shipped empty in
// Task 42, populated with RSS in Task 43): a duplicate id, an id outside
// CONNECTOR_IDS, or a registered id that getConnector can't resolve all fail
// immediately, for the current registry and every future descriptor alike.
describe('connector registry invariants', () => {
  it('appends provider calendars after all fifteen existing connector identities', () => {
    expect(CONNECTOR_IDS).toEqual([
      'rss', 'github', 'gitlab', 'jira', 'vercel', 'crypto', 'ics', 'status', 'homeassistant',
      'linear', 'sentry', 'todoist', 'onThisDay', 'publicHolidays', 'auroraKp',
      'googleCalendar', 'microsoftCalendar',
    ])
    expect(CATEGORY_ORDER).toEqual([
      'development',
      'calendar-tasks',
      'at-a-glance',
      'home',
      'news-markets',
      'fun',
    ])
  })

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

  it('every registered descriptor exposes its own pure ownership-readiness predicate', () => {
    for (const descriptor of CONNECTORS) expect(descriptor.ownsOrigins).toBeTypeOf('function')
  })

  it('has descriptor-owned backup redaction and re-entry policy for capability-bearing connectors', () => {
    expect(getConnector('rss')?.redactForBackup).toBeTypeOf('function')
    expect(getConnector('rss')?.backupReentryRequired).toBeTypeOf('function')
    expect(getConnector('ics')?.redactForBackup).toBeTypeOf('function')
    expect(getConnector('ics')?.backupReentryRequired).toBeTypeOf('function')
  })

  it('registers the three keyless At a glance descriptors without claiming Chrome origins', () => {
    const configs: Record<'onThisDay' | 'publicHolidays' | 'auroraKp', ConnectorConfig> = {
      onThisDay: { enabled: true },
      publicHolidays: { enabled: true, countryCode: 'US' },
      auroraKp: { enabled: true },
    }
    for (const id of Object.keys(configs) as (keyof typeof configs)[]) {
      const descriptor = getConnector(id)
      expect(descriptor).toMatchObject({ id, category: 'at-a-glance', auth: 'none' })
      expect(descriptor?.origins(configs[id])).toEqual([])
      expect(descriptor?.ownsOrigins(configs[id])).toBe(true)
    }
    expect(getConnector('publicHolidays')?.ownsOrigins({ enabled: true, countryCode: 'usa' })).toBe(false)
  })

  it('registers Google Calendar as a separately authorized OAuth connector', () => {
    const descriptor = getConnector('googleCalendar')
    const configured = {
      enabled: true,
      accountId: '43000000-0000-4000-8000-000000000001',
      accounts: [{
        connectionId: '52000000-0000-4000-8000-000000000001',
        displayEmail: 'person@example.com',
        calendars: [{ calendarId: 'primary', name: 'Person', color: '#4285f4', primary: true }],
      }],
    } as ConnectorConfig
    expect(descriptor).toMatchObject({
      id: 'googleCalendar', category: 'calendar-tasks', auth: 'oauth', excludeFromBackup: true,
    })
    expect(descriptor?.origins(configured)).toEqual(['https://www.googleapis.com/*'])
    expect(descriptor?.ownsOrigins(configured)).toBe(true)
  })

  it('registers Microsoft Calendar as a separate account-bound OAuth connector', () => {
    const descriptor = getConnector('microsoftCalendar')
    const configured = {
      enabled: true,
      accountId: '43000000-0000-4000-8000-000000000001',
      accounts: [{
        connectionId: '52000000-0000-4000-8000-000000000001',
        displayEmail: 'person@contoso.example',
        accountKind: 'work_or_school',
        calendars: [{
          calendarId: 'calendar-1', name: 'Work', color: '#0078d4', isDefault: true,
        }],
      }],
    } as ConnectorConfig
    expect(descriptor).toMatchObject({
      id: 'microsoftCalendar', category: 'calendar-tasks', auth: 'oauth', excludeFromBackup: true,
    })
    expect(descriptor?.origins(configured)).toEqual(['https://graph.microsoft.com/*'])
    expect(descriptor?.ownsOrigins(configured)).toBe(true)
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

describe('ownedConnectorOriginPatterns', () => {
  it('counts complete disabled configs and excludes enabled-but-unconfigured constant-origin cards', () => {
    const configs = {
      github: { enabled: false, token: 't', username: 'octocat' },
      vercel: { enabled: true, token: '', username: '' },
      crypto: { enabled: true, coins: [] },
    } satisfies Partial<Record<ConnectorId, ConnectorConfig>>

    expect(ownedConnectorOriginPatterns(configs)).toEqual(['https://api.github.com/*'])
  })

  it('is defensive when a descriptor ownership predicate or origins mapper sees malformed persisted data', () => {
    const malformed = {
      rss: { enabled: false, feeds: null },
      status: { enabled: true, services: 'bad' },
    } as unknown as Partial<Record<ConnectorId, ConnectorConfig>>
    expect(() => ownedConnectorOriginPatterns(malformed)).not.toThrow()
    expect(ownedConnectorOriginPatterns(malformed)).toEqual([])
  })
})

// Task 79: every descriptor names its purpose. The drawer (Task 80) groups
// cards by category, so this pins both directions — every registered
// descriptor's category is a real CATEGORY_ORDER member (catches a typo'd
// literal tsc alone won't, since the per-descriptor `category:` line is
// still just a string) — and the exact per-id mapping the wave-3 plan
// specifies, so a future connector landing in the wrong bucket fails here
// instead of silently mis-grouping in the drawer.
describe('descriptor categories', () => {
  it("every registered descriptor's category is a CATEGORY_ORDER member", () => {
    for (const d of CONNECTORS) {
      expect(CATEGORY_ORDER).toContain(d.category)
    }
  })

  it('the exact per-id category mapping the wave-3 plan specifies', () => {
    const expected: Record<ConnectorId, ConnectorCategory> = {
      github: 'development',
      gitlab: 'development',
      jira: 'development',
      vercel: 'development',
      status: 'development',
      ics: 'calendar-tasks',
      rss: 'news-markets',
      crypto: 'news-markets',
      homeassistant: 'home',
      linear: 'development',
      sentry: 'development',
      todoist: 'calendar-tasks',
      onThisDay: 'at-a-glance',
      publicHolidays: 'at-a-glance',
      auroraKp: 'at-a-glance',
      googleCalendar: 'calendar-tasks',
      microsoftCalendar: 'calendar-tasks',
    }
    for (const d of CONNECTORS) {
      expect(d.category).toBe(expected[d.id])
    }
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
    category: 'development', // Task 79 made this required; matches the real githubDescriptor's category
    auth: 'token',
    ttlMs: 1_000,
    secretFields: ['token'],
    identityField: 'username',
    origins: () => ['https://shared.example.com/*'],
    ownsOrigins: () => true,
  }

  const fakeJiraThrows: ConnectorDescriptor<JiraConfig> = {
    id: 'jira',
    label: 'Fake Jira (bad row)',
    blurb: 'test',
    category: 'development', // Task 79 made this required; matches the real jiraDescriptor's category
    auth: 'token',
    ttlMs: 1_000,
    secretFields: ['apiToken'],
    identityField: 'displayName',
    origins: () => {
      throw new Error('malformed config')
    },
    ownsOrigins: () => true,
  }

  const rssConfig: RssConfig = { enabled: true, feeds: ['https://shared.example.com/feed'], shownCount: 5 }

  it('an origin used only by the disconnecting connector is returned', () => {
    const configs: Partial<Record<ConnectorId, ConnectorConfig>> = { rss: rssConfig }
    expect(releasableOrigins('rss', configs)).toEqual(['https://shared.example.com/*'])
  })

  it('an origin derived TWICE by the disconnecting connector itself (two feeds, same host) is listed once', () => {
    const dupeHostConfig: RssConfig = {
      enabled: true,
      feeds: ['https://shared.example.com/feed-a', 'https://shared.example.com/feed-b'],
      shownCount: 5,
    }
    const configs: Partial<Record<ConnectorId, ConnectorConfig>> = { rss: dupeHostConfig }
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

// Task 95: heldOrigins is the "still claimed" sweep releasableOrigins already
// needed, pulled out as its own export — the APOD gesture helper (Task 96)
// wants to know which origins are ALREADY granted via some enabled connector,
// with no "exclude this one id" notion releasableOrigins has. Unlike the
// releasableOrigins describe block above (which only asserts a FILTERED
// difference, so an incidental extra origin from a duplicate-id fake push
// never shows up), these tests assert heldOrigins' raw output directly — so
// rather than pushing a fake descriptor under an id CONNECTOR_IDS already
// gives a REAL descriptor to (github/gitlab/jira/etc. — every id has one
// today), the cross-connector cases below use TWO REAL descriptors
// (rss + gitlab) pointed at the same or different hosts via their own
// config fields, which exercises the real origins() implementations instead
// of a stand-in.
describe('heldOrigins', () => {
  const original = [...CONNECTORS]

  afterEach(() => {
    CONNECTORS.length = 0
    CONNECTORS.push(...original)
  })

  const fakeJiraThrows: ConnectorDescriptor<JiraConfig> = {
    id: 'jira',
    label: 'Fake Jira (bad row)',
    blurb: 'test',
    category: 'development',
    auth: 'token',
    ttlMs: 1_000,
    secretFields: ['apiToken'],
    identityField: 'displayName',
    origins: () => {
      throw new Error('malformed config')
    },
    ownsOrigins: () => true,
  }

  it('an empty configs map returns []', () => {
    expect(heldOrigins({})).toEqual([])
  })

  it("is the union of every ENABLED connector's derived origins", () => {
    const rssConfig: RssConfig = { enabled: true, feeds: ['https://news.example.com/feed'], shownCount: 5 }
    const gitlabConfig: GitlabConfig = {
      enabled: true,
      token: 't',
      instanceUrl: 'https://gitlab.example.com',
      username: 'jon',
    }
    const configs: Partial<Record<ConnectorId, ConnectorConfig>> = { rss: rssConfig, gitlab: gitlabConfig }
    expect(heldOrigins(configs).sort()).toEqual(['https://gitlab.example.com/*', 'https://news.example.com/*'])
  })

  it('a DISABLED connector does not contribute its origins', () => {
    const gitlabConfig: GitlabConfig = {
      enabled: false,
      token: 't',
      instanceUrl: 'https://gitlab.example.com',
      username: 'jon',
    }
    const configs: Partial<Record<ConnectorId, ConnectorConfig>> = { gitlab: gitlabConfig }
    expect(heldOrigins(configs)).toEqual([])
  })

  it('dedupes an origin claimed by two different enabled connectors (rss + gitlab, same host) down to one entry', () => {
    const rssConfig: RssConfig = { enabled: true, feeds: ['https://shared.example.com/feed'], shownCount: 5 }
    const gitlabConfig: GitlabConfig = {
      enabled: true,
      token: 't',
      instanceUrl: 'https://shared.example.com',
      username: 'jon',
    }
    const configs: Partial<Record<ConnectorId, ConnectorConfig>> = { rss: rssConfig, gitlab: gitlabConfig }
    expect(heldOrigins(configs)).toEqual(['https://shared.example.com/*'])
  })

  it("a bad config row whose origins() throws is swept over, not thrown out of", () => {
    CONNECTORS.push(fakeJiraThrows as ConnectorDescriptor)
    const rssConfig: RssConfig = { enabled: true, feeds: ['https://shared.example.com/feed'], shownCount: 5 }
    const jiraConfig: JiraConfig = { enabled: true, email: 'a@b.com', apiToken: 't', site: 'x', displayName: 'x' }
    const configs: Partial<Record<ConnectorId, ConnectorConfig>> = { rss: rssConfig, jira: jiraConfig }
    expect(() => heldOrigins(configs)).not.toThrow()
    // toContain, not toEqual: the REAL jiraDescriptor (still registered
    // alongside the pushed fake, both under id 'jira') also contributes
    // whatever it derives from this jiraConfig — this test's point is that
    // the THROWING descriptor doesn't take the sweep down with it, not the
    // exact full set.
    expect(heldOrigins(configs)).toContain('https://shared.example.com/*')
  })
})
