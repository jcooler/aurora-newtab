import { describe, expect, it } from 'vitest'
import { serializeBackup, parseBackup, validateBackupShape, stripSecrets } from './backup'
import { CURRENT_VERSION, defaults, type AuroraData } from './storage/schema'
import { migrate } from './storage/migrations'
import type { ConnectorDescriptor, GithubConfig, GitlabConfig, JiraConfig, RssConfig } from '../services/connectors/types'

describe('serializeBackup / parseBackup round-trip', () => {
  it('round-trips: serialize -> parse -> data deep-equals the input, except connectorSnapshots (excluded from export)', () => {
    const input = { ...defaults(), links: [{ id: '1', title: 'HN', url: 'https://news.ycombinator.com' }] }
    const json = serializeBackup(input)
    const result = parseBackup(json)
    expect(result.ok).toBe(true)
    if (result.ok) {
      const { connectorSnapshots: _connectorSnapshots, ...expected } = input
      expect(result.data).toEqual(expected)
      expect('connectorSnapshots' in result.data).toBe(false)
      expect(result.version).toBe(CURRENT_VERSION)
    }
  })

  it('serializes a pretty-printed envelope with app/version/exportedAt/data', () => {
    const json = serializeBackup(defaults())
    const envelope = JSON.parse(json)
    expect(envelope.app).toBe('aurora')
    expect(envelope.version).toBe(CURRENT_VERSION)
    expect(typeof envelope.exportedAt).toBe('string')
    expect(new Date(envelope.exportedAt).toString()).not.toBe('Invalid Date')
    const { connectorSnapshots: _connectorSnapshots, ...expectedData } = defaults()
    expect(envelope.data).toEqual(expectedData)
    // Pretty-printed: multiple lines, not a single minified line.
    expect(json.split('\n').length).toBeGreaterThan(1)
  })
})

// Task 39: schema v5 connector keys. connectorSnapshots is cache, not user
// data, and is deliberately excluded from every export (smaller files, one
// less validator surface on import — see backup.ts's doc comments). connectors
// carries per-connector config and IS exported, minus anything a connector's
// registry descriptor lists in secretFields (Task 42 replaced the local map).
describe('connector config / snapshot handling (Task 39)', () => {
  it('export of defaults contains connectors but not connectorSnapshots', () => {
    const json = serializeBackup(defaults())
    const envelope = JSON.parse(json)
    expect(envelope.data.connectors).toEqual({})
    expect('connectorSnapshots' in envelope.data).toBe(false)
  })

  it('strips a field declared secret by its descriptor, but the original (storage) data survives untouched', () => {
    // stripSecrets reads secretFields from the connector registry. Inject a
    // fake descriptor via its test-only seam (the production path — CONNECTORS —
    // stays unmocked). A hypothetical rss config that carries an apiKey lets us
    // prove the strip without waiting for a real secret-bearing connector.
    const fakeDescriptor: ConnectorDescriptor<RssConfig & { apiKey: string }> = {
      id: 'rss',
      label: 'RSS (test)',
      blurb: 'test',
      auth: 'token',
      ttlMs: 1_000,
      secretFields: ['apiKey'],
      origins: () => [],
    }
    const stored = { enabled: true, feeds: [], shownCount: 5, apiKey: 'super-secret' }
    const connectors = { rss: stored } as AuroraData['connectors']

    // Single cast: the fake's config type widens RssConfig with apiKey so its
    // secretFields list type-checks; it stays a valid ConnectorDescriptor.
    const stripped = stripSecrets(connectors, [fakeDescriptor] as ConnectorDescriptor[])
    const strippedRss = stripped.rss as Record<string, unknown> | undefined
    expect(strippedRss?.enabled).toBe(true)
    expect(strippedRss && 'apiKey' in strippedRss).toBe(false)
    // The object handed in (what's actually sitting in storage) must not have
    // been mutated by stripping.
    expect(stored.apiKey).toBe('super-secret')
  })

  it('a real serializeBackup strips the github token but keeps the username; storage is untouched (Task 48)', () => {
    // The REAL registry path (not a fake descriptor): github is registered with
    // secretFields: ['token'], so a full serialize -> parse round-trip must emit
    // a github config shorn of its token but keeping enabled/username, and must
    // never mutate what's sitting in storage.
    const stored: GithubConfig = { enabled: true, token: 'github_pat_supersecret', username: 'jon' }
    const input = { ...defaults(), connectors: { github: stored } as AuroraData['connectors'] }

    const envelope = JSON.parse(serializeBackup(input))
    expect(envelope.data.connectors.github).toEqual({ enabled: true, username: 'jon' })
    expect('token' in envelope.data.connectors.github).toBe(false)
    // The object handed in (what's actually in storage) survives untouched.
    expect(stored.token).toBe('github_pat_supersecret')
  })

  it('a real serializeBackup strips the gitlab token but keeps instanceUrl + username; storage is untouched (Task 49)', () => {
    // Same REAL-registry proof as the github case above, for gitlab's own
    // secretFields: ['token']: instanceUrl is NOT a secret (it's needed to
    // reconnect and isn't sensitive on its own), so it survives the strip
    // alongside enabled/username, while token is shorn.
    const stored: GitlabConfig = {
      enabled: true,
      token: 'glpat_supersecret',
      instanceUrl: 'https://gitlab.example.com',
      username: 'jon',
    }
    const input = { ...defaults(), connectors: { gitlab: stored } as AuroraData['connectors'] }

    const envelope = JSON.parse(serializeBackup(input))
    expect(envelope.data.connectors.gitlab).toEqual({
      enabled: true,
      instanceUrl: 'https://gitlab.example.com',
      username: 'jon',
    })
    expect('token' in envelope.data.connectors.gitlab).toBe(false)
    // The object handed in (what's actually in storage) survives untouched.
    expect(stored.token).toBe('glpat_supersecret')
  })

  it('a real serializeBackup strips the jira apiToken but keeps email/site/displayName; storage is untouched (Task 50)', () => {
    // Same REAL-registry proof as the github/gitlab cases above, for jira's
    // own secretFields: ['apiToken']: email and site are NOT secrets (both
    // are needed to reconnect and neither is sensitive on its own), so they
    // survive the strip alongside enabled/displayName, while apiToken is
    // shorn.
    const stored: JiraConfig = {
      enabled: true,
      email: 'jon@acme.com',
      apiToken: 'atlassian_supersecret',
      site: 'yoursite.atlassian.net',
      displayName: 'Jon Cooler',
    }
    const input = { ...defaults(), connectors: { jira: stored } as AuroraData['connectors'] }

    const envelope = JSON.parse(serializeBackup(input))
    expect(envelope.data.connectors.jira).toEqual({
      enabled: true,
      email: 'jon@acme.com',
      site: 'yoursite.atlassian.net',
      displayName: 'Jon Cooler',
    })
    expect('apiToken' in envelope.data.connectors.jira).toBe(false)
    // The object handed in (what's actually in storage) survives untouched.
    expect(stored.apiToken).toBe('atlassian_supersecret')
  })

  it('leaves a connector untouched when no descriptor declares a secret for it (default path)', () => {
    // Real RSS declares no secrets today; with the default CONNECTORS source
    // (empty until Task 43) stripSecrets is an identity over the config.
    const stored = { enabled: true, feeds: ['https://example.com/feed'], shownCount: 5 }
    const connectors = { rss: stored } as AuroraData['connectors']
    const stripped = stripSecrets(connectors)
    expect(stripped.rss).toEqual(stored)
  })

  it('import drops unknown connector ids and any connectorSnapshots key entirely', () => {
    const data = {
      ...defaults(),
      connectors: {
        rss: { enabled: true, feeds: [], shownCount: 5 },
        bogus: { enabled: true },
      },
      connectorSnapshots: { rss: { fetchedAt: 123, data: { items: [] } } },
    }
    const result = validateBackupShape(data as never)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(Object.keys(result.data.connectors)).toEqual(['rss'])
      expect(result.data.connectorSnapshots).toEqual({})
    }
  })

  it('rejects malformed connectors (a string), naming the key', () => {
    const bad = { ...defaults(), connectors: 'oops' }
    const result = validateBackupShape(bad as never)
    expect(result).toEqual({ ok: false, reason: 'That backup\'s "connectors" data is invalid.' })
  })
})

describe('parseBackup rejections', () => {
  it('rejects non-JSON with a distinct reason', () => {
    const result = parseBackup('not json at all {')
    expect(result).toEqual({ ok: false, reason: "That file isn't valid JSON." })
  })

  it('rejects a JSON root that is not an object (array)', () => {
    const result = parseBackup(JSON.stringify([1, 2, 3]))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe("That file isn't an Aurora backup.")
  })

  it('rejects when app is missing', () => {
    const result = parseBackup(JSON.stringify({ version: CURRENT_VERSION, data: {} }))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe("That file isn't an Aurora backup.")
  })

  it('rejects when app is not "aurora"', () => {
    const result = parseBackup(JSON.stringify({ app: 'other-app', version: CURRENT_VERSION, data: {} }))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe("That file isn't an Aurora backup.")
  })

  it('rejects when version is missing', () => {
    const result = parseBackup(JSON.stringify({ app: 'aurora', data: {} }))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('That backup is missing its version number.')
  })

  it('rejects a non-numeric version', () => {
    const result = parseBackup(JSON.stringify({ app: 'aurora', version: '2', data: {} }))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe("That backup's version number is invalid.")
  })

  it('rejects a non-integer version', () => {
    const result = parseBackup(JSON.stringify({ app: 'aurora', version: 1.5, data: {} }))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe("That backup's version number is invalid.")
  })

  it('rejects a non-positive version', () => {
    const result = parseBackup(JSON.stringify({ app: 'aurora', version: 0, data: {} }))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe("That backup's version number is invalid.")
  })

  it('rejects a version newer than this Aurora', () => {
    const result = parseBackup(
      JSON.stringify({ app: 'aurora', version: CURRENT_VERSION + 1, data: {} }),
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toMatch(/newer than this Aurora/)
  })

  it('rejects when data is missing', () => {
    const result = parseBackup(JSON.stringify({ app: 'aurora', version: CURRENT_VERSION }))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('That backup has no data to restore.')
  })

  it('rejects when data is not a plain object (array)', () => {
    const result = parseBackup(JSON.stringify({ app: 'aurora', version: CURRENT_VERSION, data: [] }))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('That backup has no data to restore.')
  })

  it('rejects when data is not a plain object (primitive)', () => {
    const result = parseBackup(
      JSON.stringify({ app: 'aurora', version: CURRENT_VERSION, data: 'nope' }),
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('That backup has no data to restore.')
  })
})

describe('parseBackup accepts older/current versions (migration is the caller\'s job)', () => {
  it('accepts version === CURRENT_VERSION', () => {
    const result = parseBackup(JSON.stringify({ app: 'aurora', version: CURRENT_VERSION, data: { a: 1 } }))
    expect(result).toEqual({ ok: true, data: { a: 1 }, version: CURRENT_VERSION })
  })

  it('accepts version 1 without migrating it', () => {
    const result = parseBackup(JSON.stringify({ app: 'aurora', version: 1, data: { a: 1 } }))
    expect(result).toEqual({ ok: true, data: { a: 1 }, version: 1 })
  })
})

describe('validateBackupShape rejections (per-key structural check)', () => {
  it('rejects settings as a string', () => {
    const result = validateBackupShape({ ...defaults(), settings: 'oops' } as never)
    expect(result).toEqual({ ok: false, reason: 'That backup\'s "settings" data is invalid.' })
  })

  it('rejects settings.widgets as an array', () => {
    const bad = { ...defaults(), settings: { ...defaults().settings, widgets: [] } }
    const result = validateBackupShape(bad as never)
    expect(result).toEqual({ ok: false, reason: 'That backup\'s "settings" data is invalid.' })
  })

  it('rejects links as an object (not an array)', () => {
    const bad = { ...defaults(), links: { id: '1', title: 'HN', url: 'https://x' } }
    const result = validateBackupShape(bad as never)
    expect(result).toEqual({ ok: false, reason: 'That backup\'s "links" data is invalid.' })
  })

  it('rejects notes without text', () => {
    const bad = { ...defaults(), notes: { updatedAt: 0 } }
    const result = validateBackupShape(bad as never)
    expect(result).toEqual({ ok: false, reason: 'That backup\'s "notes" data is invalid.' })
  })

  it('rejects worldClocks as a string', () => {
    const bad = { ...defaults(), worldClocks: 'Asia/Tokyo' }
    const result = validateBackupShape(bad as never)
    expect(result).toEqual({ ok: false, reason: 'That backup\'s "worldClocks" data is invalid.' })
  })

  it('rejects countdowns whose items are missing required fields', () => {
    const bad = { ...defaults(), countdowns: [{ id: 'c1', name: 'Launch' }] } // no `date`
    const result = validateBackupShape(bad as never)
    expect(result).toEqual({ ok: false, reason: 'That backup\'s "countdowns" data is invalid.' })
  })

  it('rejects timerConfig.workMinutes as NaN', () => {
    const bad = { ...defaults(), timerConfig: { ...defaults().timerConfig, workMinutes: NaN } }
    const result = validateBackupShape(bad as never)
    expect(result).toEqual({ ok: false, reason: 'That backup\'s "timerConfig" data is invalid.' })
  })

  it('rejects timerConfig.breakMinutes as Infinity (a real reachable case: JSON can\'t encode NaN, but an oversized literal like 1e400 parses to Infinity)', () => {
    const bad = { ...defaults(), timerConfig: { ...defaults().timerConfig, breakMinutes: Infinity } }
    const result = validateBackupShape(bad as never)
    expect(result).toEqual({ ok: false, reason: 'That backup\'s "timerConfig" data is invalid.' })
  })

  it('rejects a layout whose entry is not a finite pair', () => {
    const bad = { ...defaults(), layout: { clock: { x: NaN, y: 10 } } }
    const result = validateBackupShape(bad as never)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('That backup\'s "layout" data is invalid.')
  })

  it('accepts a fully-defaulted backup unchanged', () => {
    const result = validateBackupShape(defaults())
    expect(result).toEqual({ ok: true, data: defaults() })
  })
})

describe('validateBackupShape: migration-then-validate order', () => {
  it('a valid v1-era backup migrates forward and then still passes validation', () => {
    const v1Settings = {
      ...defaults().settings,
      name: 'Jon',
      widgets: { search: false, weather: true, links: true, todo: true, timer: true, quote: false },
    }
    // A v1 snapshot predates the nested widget keys (bookmarks/notes/clocks/
    // countdown) — migrate() must backfill them BEFORE validateBackupShape
    // runs, or this would fail shape validation on the missing keys.
    const migrated = migrate({ settings: v1Settings }, 1)
    const result = validateBackupShape(migrated)
    expect(result.ok).toBe(true)
  })

  // Red Argon remediation: an OLD (v<=3) backup — from before the in-extension
  // engine picker was removed — still carries a searchEngine field. isSettings
  // no longer checks it at all (the field doesn't exist on Settings anymore),
  // so importing such a backup must still work: migrate()'s v3->v4 step
  // strips searchEngine BEFORE validateBackupShape ever runs, exactly the
  // same migrate-then-validate order the v1-era test above relies on.
  it('an old (v3) backup carrying searchEngine imports cleanly: migration strips it before validation', () => {
    const v3Settings = { ...defaults().settings, name: 'Jon', searchEngine: 'duckduckgo' }
    const migrated = migrate({ settings: v3Settings }, 3)
    expect('searchEngine' in migrated.settings).toBe(false)
    const result = validateBackupShape(migrated)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data.settings.name).toBe('Jon')
  })
})

describe('validateBackupShape: unknown-key dropping', () => {
  it('silently drops top-level keys that are not a known DataKey', () => {
    const withExtra = { ...defaults(), bogusExtraKey: 'should not survive' }
    const result = validateBackupShape(withExtra as never)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(Object.keys(result.data).sort()).toEqual(Object.keys(defaults()).sort())
      expect('bogusExtraKey' in result.data).toBe(false)
    }
  })

  it('drops unknown block ids from layout on import but keeps known ones', () => {
    const data = { ...defaults(), layout: { clock: { x: 40, y: 30 }, bogus: { x: 1, y: 1 } } }
    const result = validateBackupShape(data as never)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.layout).toEqual({ clock: { x: 40, y: 30 } })
    }
  })
})
