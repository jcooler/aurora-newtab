import { describe, expect, it } from 'vitest'
import {
  BACKUP_REDACTION_NOTICE,
  prepareBackup,
  serializeBackup,
  parseBackup,
  redactBackupData,
  validateBackupShape,
  stripSecrets,
} from './backup'
import { CURRENT_VERSION, defaults, type AuroraData } from './storage/schema'
import { migrate, migrations } from './storage/migrations'
import type { LayoutV2, Placement } from './layout/types'
import type { LayoutV3 } from './layout/canvasTypes'
import { layoutV2FromLegacy } from './layout/v2'
import type { ConnectorDescriptor, CryptoConfig, GithubConfig, GitlabConfig, IcsConfig, JiraConfig, RssConfig, VercelConfig } from '../services/connectors/types'

describe('Quick Link import safety (W1-P9)', () => {
  it.each([
    'mailto:user@example.com',
    'javascript:payload@example.com',
    'data:text/plain,hello',
    'chrome://settings',
    'file:///private.txt',
    'https://user:password@example.com/private',
    'https:example.com',
    'https:/example.com',
  ])('rejects a backup containing unsafe or credential-bearing URL %s', (url) => {
    expect(validateBackupShape({
      ...defaults(),
      links: [{ id: 'unsafe', title: 'Unsafe', url }],
    })).toEqual({ ok: false, reason: 'That backup\'s "links" data is invalid.' })
  })

  it('retains a valid HTTP(S) Quick Link', () => {
    const links = [{ id: 'safe', title: 'Safe', url: 'https://example.test/path' }]
    const result = validateBackupShape({ ...defaults(), links })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data.links).toEqual(links)
  })
})

describe('secret-safe redaction and prepared import (W1-P4)', () => {
  it('removes every RSS capability URL without mutating the stored config', () => {
    const feeds = [
      'https://feeds.example.com/private.xml?token=rss-capability-one',
      'https://other.example.com/secret.xml?token=rss-capability-two',
    ]
    const input = { ...defaults(), connectors: { rss: { enabled: true, feeds, shownCount: 7 } } }

    const result = redactBackupData(input)
    const serialized = JSON.stringify(result)

    expect(result.data.connectors.rss).toEqual({ enabled: true, feeds: [], shownCount: 7 })
    expect(serialized).not.toContain(feeds[0])
    expect(serialized).not.toContain(feeds[1])
    expect(serialized).not.toContain('rss-capability-one')
    expect(serialized).not.toContain('rss-capability-two')
    expect(input.connectors.rss?.feeds).toEqual(feeds)
  })

  it('redacts token and calendar capabilities while retaining reconnect identities and view settings', () => {
    const input = {
      ...defaults(),
      connectors: {
        github: { enabled: true, token: 'github-bearer', username: 'octocat' },
        gitlab: { enabled: true, token: 'gitlab-bearer', instanceUrl: 'https://gitlab.example.test', username: 'jon' },
        jira: { enabled: true, apiToken: 'jira-api-token', email: 'jon@example.test', site: 'acme.atlassian.net', displayName: 'Jon' },
        vercel: { enabled: true, token: 'vercel-bearer', username: 'shipper' },
        homeassistant: { enabled: true, token: 'ha-bearer', instanceUrl: 'https://home.example.test', locationName: 'Home' },
        ics: {
          enabled: true,
          url: 'https://calendar.example.test/legacy.ics?token=legacy-capability',
          calendars: [{ name: 'Family', url: 'https://calendar.example.test/multi.ics?token=multi-capability' }],
          view: 'upcoming',
          upcomingCount: 4,
          meetLinks: false,
        },
      },
    } as AuroraData

    const { data } = redactBackupData(input)
    const serialized = JSON.stringify(data)

    for (const secret of ['github-bearer', 'gitlab-bearer', 'jira-api-token', 'vercel-bearer', 'ha-bearer', 'legacy-capability', 'multi-capability']) {
      expect(serialized).not.toContain(secret)
    }
    expect(data.connectors.github).toMatchObject({ username: 'octocat' })
    expect(data.connectors.gitlab).toMatchObject({ instanceUrl: 'https://gitlab.example.test', username: 'jon' })
    expect(data.connectors.jira).toMatchObject({ email: 'jon@example.test', site: 'acme.atlassian.net', displayName: 'Jon' })
    expect(data.connectors.homeassistant).toMatchObject({ instanceUrl: 'https://home.example.test', locationName: 'Home' })
    expect(data.connectors.ics).toEqual({ enabled: true, calendars: [], view: 'upcoming', upcomingCount: 4, meetLinks: false })
  })

  it('excludes forged cache values and declares stable re-entry ids only for recoverable incomplete configs', () => {
    const input = {
      ...defaults(),
      connectorSnapshots: { github: { fetchedAt: 1, data: { private: 'forged' } } },
      apodCache: { date: '2026-08-14', photo: { url: 'https://private.example.test/photo', title: 'forged' } },
      connectors: {
        github: { enabled: true, token: 'token', username: 'octocat' },
        rss: { enabled: true, feeds: ['https://feed.example.test/private'], shownCount: 5 },
        ics: { enabled: true, calendars: [], view: 'today' },
        crypto: { enabled: true, coins: [] },
      },
    } as AuroraData

    const envelope = JSON.parse(serializeBackup(input))
    expect(envelope.data).not.toHaveProperty('connectorSnapshots')
    expect(envelope.data).not.toHaveProperty('apodCache')
    expect(envelope.redactions).toEqual({
      reentryRequired: ['rss', 'github', 'ics'],
      notice: BACKUP_REDACTION_NOTICE,
    })
  })

  it('prepares legacy token and ambiguous ICS envelopes without inventing a Calendar label', () => {
    const legacy = {
      app: 'aurora',
      version: CURRENT_VERSION,
      data: {
        ...defaults(),
        connectors: {
          github: { enabled: true, username: 'octocat' },
          ics: { enabled: true },
        },
      },
    }

    const result = prepareBackup(JSON.stringify(legacy))
    expect(result).toMatchObject({ ok: true })
    if (result.ok) {
      expect(result.redactions.reentryRequired).toEqual(['github'])
      expect(result.legacyReentryMayBeRequired).toBe(true)
    }
  })

  it('does not warn about re-entry for a complete legacy ICS capability URL', () => {
    const result = prepareBackup(JSON.stringify({
      app: 'aurora',
      version: CURRENT_VERSION,
      data: { ...defaults(), connectors: { ics: { enabled: true, url: 'https://calendar.example.test/legacy.ics' } } },
    }))
    expect(result).toMatchObject({ ok: true })
    if (result.ok) {
      expect(result.redactions.reentryRequired).toEqual([])
      expect(result.legacyReentryMayBeRequired).toBe(false)
    }
  })

  it('rejects Calendar re-entry metadata that contradicts a complete legacy ICS capability URL', () => {
    const result = prepareBackup(JSON.stringify({
      app: 'aurora',
      version: CURRENT_VERSION,
      redactions: { reentryRequired: ['ics'], notice: BACKUP_REDACTION_NOTICE },
      data: { ...defaults(), connectors: { ics: { enabled: true, url: 'https://calendar.example.test/legacy.ics' } } },
    }))
    expect(result).toEqual({ ok: false, reason: "That backup's redaction metadata is invalid." })
  })

  it.each([
    ['malformed metadata', { reentryRequired: ['github'], notice: 7 }],
    ['unknown id', { reentryRequired: ['bogus'], notice: BACKUP_REDACTION_NOTICE }],
    ['duplicate id', { reentryRequired: ['github', 'github'], notice: BACKUP_REDACTION_NOTICE }],
    ['inconsistent id', { reentryRequired: ['ics'], notice: BACKUP_REDACTION_NOTICE }],
    ['wrong notice', { reentryRequired: [], notice: 'unsafe label' }],
  ])('rejects a present %s before preparation', (_name, redactions) => {
    const data = {
      ...defaults(),
      connectors: redactions === null ? {} : { github: { enabled: true, username: 'octocat' } },
    }
    const raw = JSON.stringify({ app: 'aurora', version: CURRENT_VERSION, exportedAt: '2026-08-14T12:00:00.000Z', redactions, data })
    expect(prepareBackup(raw).ok).toBe(false)
  })

  it('rejects non-canonical exportedAt before a consumer can confirm', () => {
    const raw = JSON.stringify({
      app: 'aurora',
      version: CURRENT_VERSION,
      exportedAt: '2026-08-14T12:00:00Z',
      redactions: { reentryRequired: [], notice: BACKUP_REDACTION_NOTICE },
      data: defaults(),
    })
    expect(prepareBackup(raw).ok).toBe(false)
  })

  it('migrates legacy data and derives only real restored origins', () => {
    const v1 = { app: 'aurora', version: 1, data: { settings: defaults().settings } }
    expect(prepareBackup(JSON.stringify(v1)).ok).toBe(true)

    const prepared = prepareBackup(JSON.stringify({
      app: 'aurora',
      version: CURRENT_VERSION,
      redactions: { reentryRequired: [], notice: BACKUP_REDACTION_NOTICE },
      data: {
        ...defaults(),
        photoPrefs: { mode: 'apod', index: 0, lastRotated: '' },
        connectors: {
          status: { enabled: true, services: [{ name: 'Status', url: 'https://status.example.test/api/v2/status.json' }] },
          crypto: { enabled: true, coins: ['bitcoin'] },
          github: { enabled: true, username: 'octocat' },
          rss: { enabled: true, feeds: [], shownCount: 5 },
          ics: { enabled: true, calendars: [] },
        },
      },
    }))
    expect(prepared).toMatchObject({ ok: true })
    if (prepared.ok) {
      expect(prepared.requiredOrigins.sort()).toEqual([
        'https://api.coingecko.com/*',
        'https://api.nasa.gov/*',
        'https://apod.nasa.gov/*',
        'https://status.example.test/*',
      ])
    }
  })

  it('turns a missing migration step into the preparation rejection without returning data', () => {
    const original = migrations[1]
    delete migrations[1]
    try {
      expect(prepareBackup(JSON.stringify({ app: 'aurora', version: 1, data: { settings: defaults().settings } }))).toEqual({
        ok: false,
        reason: 'That backup cannot be migrated by this Aurora version.',
      })
    } finally {
      migrations[1] = original
    }
  })

  it('never prepares a malformed data shape even when envelope metadata is valid', () => {
    const raw = JSON.stringify({
      app: 'aurora',
      version: CURRENT_VERSION,
      redactions: { reentryRequired: [], notice: BACKUP_REDACTION_NOTICE },
      data: { ...defaults(), settings: 'malformed' },
    })
    expect(prepareBackup(raw)).toEqual({ ok: false, reason: 'That backup\'s "settings" data is invalid.' })
  })
})

describe('serializeBackup / parseBackup round-trip', () => {
  it('round-trips: serialize -> parse -> data deep-equals the input, except connectorSnapshots and apodCache (both excluded from export)', () => {
    const input = { ...defaults(), links: [{ id: '1', title: 'HN', url: 'https://news.ycombinator.com' }] }
    const json = serializeBackup(input)
    const result = parseBackup(json)
    expect(result.ok).toBe(true)
    if (result.ok) {
      const { connectorSnapshots: _connectorSnapshots, apodCache: _apodCache, ...expected } = input
      expect(result.data).toEqual(expected)
      expect('connectorSnapshots' in result.data).toBe(false)
      expect('apodCache' in result.data).toBe(false)
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
    const { connectorSnapshots: _connectorSnapshots, apodCache: _apodCache, ...expectedData } = defaults()
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
      category: 'news-markets', // Task 79 made this required; matches the real rssDescriptor's category
      auth: 'token',
      ttlMs: 1_000,
      secretFields: ['apiKey'],
      origins: () => [],
      ownsOrigins: () => false,
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

  it('a real serializeBackup strips the vercel token but keeps username; storage is untouched (Task 51)', () => {
    // Same REAL-registry proof as the github/gitlab/jira cases above, for
    // vercel's own secretFields: ['token'] (github's exact shape — a single
    // bare token, no non-secret companion field like gitlab's instanceUrl or
    // jira's site/email).
    const stored: VercelConfig = { enabled: true, token: 'vercel_supersecret', username: 'jon' }
    const input = { ...defaults(), connectors: { vercel: stored } as AuroraData['connectors'] }

    const envelope = JSON.parse(serializeBackup(input))
    expect(envelope.data.connectors.vercel).toEqual({ enabled: true, username: 'jon' })
    expect('token' in envelope.data.connectors.vercel).toBe(false)
    // The object handed in (what's actually in storage) survives untouched.
    expect(stored.token).toBe('vercel_supersecret')
  })

  it('a real serializeBackup leaves the crypto coins config UNstripped — its descriptor declares secretFields: [] (Task 52, no-auth connector)', () => {
    // The negative case documenting secretFields: []: unlike github/gitlab/
    // jira/vercel (each stripped of exactly its token/apiToken above), crypto
    // has nothing sensitive to strip at all — CoinGecko ids are not secrets —
    // so a real serializeBackup must round-trip the WHOLE config, enabled and
    // coins both, byte-for-byte.
    const stored: CryptoConfig = { enabled: true, coins: ['bitcoin', 'ethereum', 'dogecoin'] }
    const input = { ...defaults(), connectors: { crypto: stored } as AuroraData['connectors'] }

    const envelope = JSON.parse(serializeBackup(input))
    expect(envelope.data.connectors.crypto).toEqual({
      enabled: true,
      coins: ['bitcoin', 'ethereum', 'dogecoin'],
    })
    // The object handed in (what's actually in storage) survives untouched.
    expect(stored.coins).toEqual(['bitcoin', 'ethereum', 'dogecoin'])
  })

  it('a real serializeBackup strips both the legacy url AND calendars — the WHOLE url IS the secret, in either shape (Task 53, first auth-none connector that strips)', () => {
    // The FIRST of its kind: an auth:'none' connector (like crypto/rss — no
    // token, no identity) that STILL declares a secretField. An ICS url is a
    // calendar's "private address" — it grants read access to the entire
    // calendar, so it must never leave the device on export, in EITHER at-rest
    // shape: the legacy single `url` field or the new `calendars` array (each
    // entry's url is the same kind of secret). A config mid-migration can
    // legally hold both at once (icsCalendarsOf prefers `calendars`; see
    // ics.test.ts) so a real serialize -> parse must strip both, keeping
    // `enabled` and the non-secret view fields, and must never mutate what's
    // sitting in storage.
    const stored: IcsConfig = {
      enabled: true,
      url: 'https://calendar.example.com/private-abc123/basic.ics',
      calendars: [{ name: 'P', url: 'https://calendar.example.com/private-def456/personal.ics' }],
      view: 'upcoming',
      upcomingCount: 3,
    }
    const input = { ...defaults(), connectors: { ics: stored } as AuroraData['connectors'] }

    const envelope = JSON.parse(serializeBackup(input))
    expect(envelope.data.connectors.ics).toEqual({ enabled: true, calendars: [], view: 'upcoming', upcomingCount: 3 })
    expect('url' in envelope.data.connectors.ics).toBe(false)
    expect(envelope.data.connectors.ics.calendars).toEqual([])
    // The object handed in (what's actually in storage) survives untouched.
    expect(stored.url).toBe('https://calendar.example.com/private-abc123/basic.ics')
    expect(stored.calendars).toEqual([{ name: 'P', url: 'https://calendar.example.com/private-def456/personal.ics' }])
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

// Task 95: apodCache is cache, not user data — same exclusion mechanism as
// connectorSnapshots above (excluded from every export, never trusted on
// import, hard-reset instead). Unlike connectorSnapshots (a Partial<Record<...>>
// that resets to `{}`), apodCache's "empty" value is `null` (see schema.ts's
// AuroraData.apodCache and defaults()).
describe('apodCache export / import exclusion (Task 95)', () => {
  it('export of defaults contains no apodCache key at all', () => {
    const json = serializeBackup(defaults())
    const envelope = JSON.parse(json)
    expect('apodCache' in envelope.data).toBe(false)
  })

  it('a real apodCache sitting in storage never reaches a serialized export', () => {
    const input = {
      ...defaults(),
      apodCache: { date: '2026-08-11', photo: { url: 'https://apod.nasa.gov/apod/image/x.jpg', title: 'X' } },
    }
    const envelope = JSON.parse(serializeBackup(input))
    expect('apodCache' in envelope.data).toBe(false)
  })

  it('import resets a forged apodCache to null regardless of what the backup carries', () => {
    const data = { ...defaults(), apodCache: { date: 'bogus', photo: { url: 'not a real url', title: 'forged' } } }
    const result = validateBackupShape(data as never)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data.apodCache).toBeNull()
  })

  it('a pre-apodCache backup (key entirely absent, from before Task 95) still validates, defaulting apodCache to null', () => {
    const { apodCache: _apodCache, ...withoutApodCache } = defaults()
    const result = validateBackupShape(withoutApodCache as never)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data.apodCache).toBeNull()
  })

  it('a fully-defaulted backup (apodCache already null) still validates cleanly', () => {
    const result = validateBackupShape(defaults())
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data.apodCache).toBeNull()
  })
})

// Task 56: schema v6 habits key. Unlike connectors/layout (whole-key
// validation, then drop-unknown-id cleaning), habits cleaning drops
// individual malformed ROWS and filters malformed log entries within an
// otherwise-valid row — a corrupted or hand-edited backup should not lose
// every habit because one row is bad.
describe('habits export / import (Task 56)', () => {
  it('export includes habits verbatim', () => {
    const habit = { id: 'h1', name: 'Read', createdAt: 1000, log: ['2026-07-01', '2026-07-02'] }
    const input = { ...defaults(), habits: [habit] }
    const envelope = JSON.parse(serializeBackup(input))
    expect(envelope.data.habits).toEqual([habit])
  })

  it('import drops a malformed row but keeps valid siblings', () => {
    const good = { id: 'h1', name: 'Read', createdAt: 1000, log: ['2026-07-01'] }
    const data = {
      ...defaults(),
      habits: [good, { id: 42, name: 'Bad id', createdAt: 1000, log: [] }, { id: 'h3', log: [] }],
    }
    const result = validateBackupShape(data as never)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.habits).toEqual([good])
    }
  })

  it("a log entry 'not-a-date' is filtered while its habit survives", () => {
    const data = {
      ...defaults(),
      habits: [{ id: 'h1', name: 'Read', createdAt: 1000, log: ['2026-07-01', 'not-a-date', '2026-07-03'] }],
    }
    const result = validateBackupShape(data as never)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.habits).toEqual([
        { id: 'h1', name: 'Read', createdAt: 1000, log: ['2026-07-01', '2026-07-03'] },
      ])
    }
  })

  it('rejects habits as a string, naming the key', () => {
    const bad = { ...defaults(), habits: 'oops' }
    const result = validateBackupShape(bad as never)
    expect(result).toEqual({ ok: false, reason: 'That backup\'s "habits" data is invalid.' })
  })

  it('drops a habit row whose log is not an array', () => {
    const data = { ...defaults(), habits: [{ id: 'h1', name: 'Read', createdAt: 1000, log: 'oops' }] }
    const result = validateBackupShape(data as never)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data.habits).toEqual([])
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
    expect(result).toEqual({
      ok: true,
      data: { a: 1 },
      version: CURRENT_VERSION,
      exportedAt: undefined,
      redactionsPresent: false,
      redactions: { reentryRequired: [], notice: BACKUP_REDACTION_NOTICE },
    })
  })

  it('accepts version 1 without migrating it', () => {
    const result = parseBackup(JSON.stringify({ app: 'aurora', version: 1, data: { a: 1 } }))
    expect(result).toEqual({
      ok: true,
      data: { a: 1 },
      version: 1,
      exportedAt: undefined,
      redactionsPresent: false,
      redactions: { reentryRequired: [], notice: BACKUP_REDACTION_NOTICE },
    })
  })
})

describe('validateBackupShape rejections (per-key structural check)', () => {
  it('accepts legacy/current weather identities but rejects malformed identity values', () => {
    const baseWeather = {
      current: { tempC: 20, feelsLikeC: 19, code: 0, windKmh: 5, humidity: 50 },
      hourly: [],
      fetchedAt: 123,
      locationLabel: 'Springfield',
    }
    expect(validateBackupShape({ ...defaults(), weatherCache: baseWeather } as never).ok).toBe(true)
    expect(validateBackupShape({
      ...defaults(),
      weatherCache: { ...baseWeather, requestIdentity: 'open-meteo:v1:public-contract' },
    } as never).ok).toBe(true)
    expect(validateBackupShape({
      ...defaults(),
      weatherCache: { ...baseWeather, requestIdentity: { label: 'secretly wrong' } },
    } as never)).toEqual({ ok: false, reason: 'That backup\'s "weatherCache" data is invalid.' })
  })

  it.each([
    { lat: 91, lon: 0 },
    { lat: -91, lon: 0 },
    { lat: 0, lon: 181 },
    { lat: 0, lon: -181 },
    { lat: Number.NaN, lon: 0 },
  ])('rejects invalid stored location coordinates: $lat, $lon', ({ lat, lon }) => {
    const result = validateBackupShape({
      ...defaults(),
      location: { lat, lon, label: 'Invalid', manual: true },
    } as never)
    expect(result).toEqual({ ok: false, reason: 'That backup\'s "location" data is invalid.' })
  })

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

  it('rejects a V2 layout whose known legacy entry is not a finite pair', () => {
    const bad = { ...defaults(), layout: { version: 2, profiles: {}, legacy: { clock: { x: NaN, y: 10 } } } }
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

  // Fix round 1 (post-review, Task 58): a REAL v6-tagged backup — exported
  // by an app instance sometime between Task 57 (habits) and Task 58
  // (monthCal) landing, so its settings.widgets has `habits` but not yet
  // `monthCal` — was being REJECTED WHOLESALE on import: isWidgetToggles
  // (backup.ts) requires EVERY WIDGET_KEYS entry present as a boolean, and
  // `monthCal` was simply absent from a genuinely v6-era snapshot (neither
  // Task 57 nor Task 58 bumped CURRENT_VERSION when its own widget toggle
  // landed). migrations.ts's new v6->v7 step is what closes this — proven
  // here via the exact migrate-then-validate order Data.tsx's real import
  // handler uses (parseBackup -> migrate(data, version) ->
  // validateBackupShape(migrated)), same as every other era's test in this
  // describe block.
  it('a v6-era backup whose settings.widgets predates monthCal migrates forward and then still passes validation', () => {
    const v6Widgets = {
      search: true, weather: true, links: true, todo: true, timer: false,
      quote: true, bookmarks: false, notes: true, clocks: false, countdown: false,
      habits: true, // v6 already had this one (Task 57) — the point of this test is monthCal, not habits
      // monthCal intentionally absent — the actual v6-era gap
    }
    const migrated = migrate({ settings: { ...defaults().settings, name: 'Jon', widgets: v6Widgets } }, 6)
    const result = validateBackupShape(migrated)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.settings.widgets.habits).toBe(true) // stored choice preserved
      expect(result.data.settings.widgets.monthCal).toBe(false) // backfilled by the v6->v7 step
    }
  })

  // Task 60: an OLD (v<=7) backup still carries settings.theme. isSettings no
  // longer checks (or knows) that field, and requires panelColor, so importing
  // such a backup only works because migrate()'s v7->v8 step strips theme and
  // backfills panelColor BEFORE validateBackupShape runs — the same
  // migrate-then-validate order every other era's test in this block relies on.
  it('a v7 backup carrying theme imports cleanly: migration strips it and backfills panelColor before validation', () => {
    const v7Settings = { ...defaults().settings, name: 'Jon', theme: 'glass' }
    const migrated = migrate({ settings: v7Settings }, 7)
    expect('theme' in migrated.settings).toBe(false)
    expect(migrated.settings.panelColor).toBeNull()
    const result = validateBackupShape(migrated)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data.settings.name).toBe('Jon')
  })
})

// Task 60: settings.panelColor (hex | null) round-trips through export/import,
// and a non-#rrggbb value (e.g. a named color) rejects the whole settings key
// per the structural convention (isPanelColor is the shared validator).
describe('panelColor export / import (Task 60)', () => {
  it("round-trips a '#12ab34' panelColor through serialize -> parse", () => {
    const input = { ...defaults(), settings: { ...defaults().settings, panelColor: '#12ab34' } }
    const json = serializeBackup(input)
    const parsed = parseBackup(json)
    expect(parsed.ok).toBe(true)
    if (parsed.ok) expect((parsed.data.settings as { panelColor: string }).panelColor).toBe('#12ab34')
    // And it survives shape validation unchanged.
    const validated = validateBackupShape(input)
    expect(validated.ok).toBe(true)
    if (validated.ok) expect(validated.data.settings.panelColor).toBe('#12ab34')
  })

  it("accepts a null panelColor (the default)", () => {
    const result = validateBackupShape({ ...defaults(), settings: { ...defaults().settings, panelColor: null } } as never)
    expect(result.ok).toBe(true)
  })

  it("rejects a named-color panelColor ('red'), naming the settings key", () => {
    const bad = { ...defaults(), settings: { ...defaults().settings, panelColor: 'red' } }
    const result = validateBackupShape(bad as never)
    expect(result).toEqual({ ok: false, reason: 'That backup\'s "settings" data is invalid.' })
  })

  it('rejects a 3-digit short-form panelColor (#fff)', () => {
    const bad = { ...defaults(), settings: { ...defaults().settings, panelColor: '#fff' } }
    const result = validateBackupShape(bad as never)
    expect(result).toEqual({ ok: false, reason: 'That backup\'s "settings" data is invalid.' })
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

  it('drops unknown profile and block ids from V2 layout while keeping known placements and legacy rows', () => {
    const placement: Placement = { zone: 'now', order: 0, colSpan: 1, rowSpan: 1, variant: 'standard', priority: 'pinned' }
    const data = {
      ...defaults(),
      layout: {
        version: 2,
        profiles: { standard: { clock: placement, bogus: 'malformed but unknown' }, future: { clock: 'ignored' } },
        legacy: { clock: { x: 40, y: 30 }, bogus: 'malformed but unknown' },
      },
    }
    const result = validateBackupShape(data as never)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.layout).toEqual({
        version: 2,
        profiles: { standard: { clock: placement } },
        legacy: { clock: { x: 40, y: 30 } },
      })
    }
  })
})

describe('schema v11 layout density backup boundary', () => {
  const safeReason = { ok: false, reason: 'That backup\'s "settings" data is invalid.' } as const

  function withoutDensity() {
    const { layoutDensity: _layoutDensity, ...settings } = defaults().settings as unknown as Record<string, unknown>
    return settings
  }

  it.each(['auto', 'compact', 'balanced', 'spacious'] as const)(
    'exports and strictly restores the exact %s preference',
    (layoutDensity) => {
      const input = { ...defaults(), settings: { ...defaults().settings, layoutDensity } }
      const envelope = JSON.parse(serializeBackup(input))
      expect(envelope.version).toBe(CURRENT_VERSION)
      expect(envelope.data.settings.layoutDensity).toBe(layoutDensity)

      const prepared = prepareBackup(JSON.stringify(envelope))
      expect(prepared.ok).toBe(true)
      if (prepared.ok) expect(prepared.data.settings).toEqual(input.settings)
    },
  )

  it.each([
    ['missing', undefined],
    ['null', null],
    ['non-string', 7],
    ['unknown', 'dense'],
  ])('rejects current schema v11 %s density instead of normalizing it', (_label, layoutDensity) => {
    const settings = { ...defaults().settings } as unknown as Record<string, unknown>
    if (layoutDensity === undefined) delete settings.layoutDensity
    else settings.layoutDensity = layoutDensity
    const raw = JSON.stringify({ app: 'aurora', version: 11, data: { ...defaults(), settings } })

    expect(prepareBackup(raw)).toEqual(safeReason)
  })

  it('migrates a schema-10 backup to Auto Fit while preserving every sibling and layout byte-for-byte', () => {
    const layout: LayoutV2 = {
      version: 2,
      profiles: { standard: { clock: { zone: 'now', order: 0, colSpan: 2, rowSpan: 2, variant: 'standard', priority: 'pinned' } } },
      legacy: { clock: { x: 50, y: 50 } },
    }
    const settings = { ...withoutDensity(), name: 'Migrated backup', muted: true }
    const raw = JSON.stringify({ app: 'aurora', version: 10, data: { ...defaults(), settings, layout } })
    const prepared = prepareBackup(raw)

    expect(prepared.ok).toBe(true)
    if (prepared.ok) {
      expect(prepared.data.settings).toEqual({ ...settings, layoutDensity: 'auto' })
      expect(prepared.data.layout).toEqual(layout)
    }
  })

  it('runs an older supported backup through all steps and ends at Auto Fit', () => {
    const raw = JSON.stringify({ app: 'aurora', version: 1, data: { settings: withoutDensity() } })
    const prepared = prepareBackup(raw)

    expect(prepared.ok).toBe(true)
    if (prepared.ok) expect(prepared.data.settings.layoutDensity).toBe('auto')
  })

  it('rejects a schema-10 backup with missing settings instead of defaulting it', () => {
    const raw = JSON.stringify({ app: 'aurora', version: 10, data: {} })

    expect(prepareBackup(raw)).toEqual(safeReason)
  })
})

describe('W3-P1 Layout V2 backup compatibility', () => {
  const placement: Placement = {
    zone: 'pulse', order: 2, colSpan: 2, rowSpan: 3,
    variant: 'expanded', priority: 'automatic', locked: true,
  }

  function envelope(version: number, layout: unknown): string {
    const data = { ...defaults(), layout }
    if (version <= 10) {
      const { layoutDensity: _layoutDensity, ...settings } = data.settings as unknown as Record<string, unknown>
      data.settings = settings as unknown as AuroraData['settings']
    }
    return JSON.stringify({ app: 'aurora', version, data })
  }

  it('exports the current schema with only the supplied V2 overrides and exact optional legacy map', () => {
    const layout: LayoutV2 = { version: 2, profiles: { display: { notes: placement } }, legacy: { notes: { x: 12, y: 34 } } }
    const parsed = JSON.parse(serializeBackup({ ...defaults(), layout }))
    expect(parsed.version).toBe(CURRENT_VERSION)
    expect(parsed.data.layout).toEqual(layout)
    expect(Object.keys(parsed.data.layout.profiles)).toEqual(['display'])
  })

  it.each([1, 2, 3, 4, 5, 6, 7, 8, 9])('migrates a v%s layout through the complete historical acceptance matrix', (version) => {
    const legacy = { clock: { x: 50, y: 50 }, greeting: { x: 83.333, y: 50 } }
    const result = prepareBackup(envelope(version, legacy))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const migratedLayout = result.data.layout as LayoutV2
    const expectedLegacy = version <= 2 ? {} : legacy
    expect(migratedLayout).toEqual(layoutV2FromLegacy(expectedLegacy))
    expect(migratedLayout.legacy).toEqual(expectedLegacy)
    expect(Object.keys(migratedLayout.profiles)).toEqual(['compact', 'standard', 'display', 'ultrawide'])
    for (const profile of ['compact', 'standard', 'display', 'ultrawide'] as const) {
      expect(migratedLayout.profiles[profile]).toEqual(layoutV2FromLegacy(expectedLegacy).profiles[profile])
    }
  })

  it.each([
    ['primitive', 'bad'],
    ['array', []],
    ['malformed known row', { clock: { x: 1e400, y: 10 } }],
  ])('maps old %s layout failures to the safe layout reason', (_label, layout) => {
    expect(prepareBackup(envelope(9, layout))).toEqual({ ok: false, reason: 'That backup\'s "layout" data is invalid.' })
  })

  it('drops malformed unknown legacy ids only after validating every known row', () => {
    const result = prepareBackup(envelope(9, { clock: { x: 10, y: 20 }, bogus: 'malformed' }))
    expect(result.ok).toBe(true)
    if (result.ok) expect((result.data.layout as LayoutV2).legacy).toEqual({ clock: { x: 10, y: 20 } })

    expect(prepareBackup(envelope(9, { clock: { x: 'bad', y: 20 }, bogus: { x: 1, y: 2 } }))).toEqual({
      ok: false,
      reason: 'That backup\'s "layout" data is invalid.',
    })
  })

  it('round-trips valid current profiles and optional legacy after cleanup', () => {
    const layout: LayoutV2 = { version: 2, profiles: { standard: { notes: placement } }, legacy: { notes: { x: 15, y: 25 } } }
    const result = prepareBackup(envelope(11, layout))
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data.layout).toEqual(layout)
  })

  it('round-trips a valid V3 layout with exact V2 recovery', () => {
    const semanticV2: LayoutV2 = {
      version: 2,
      profiles: { standard: { notes: placement } },
      legacy: { notes: { x: 15.25, y: 25.75 } },
    }
    const layout: LayoutV3 = {
      version: 3,
      profiles: {
        compact: {
          mode: 'derived',
          placements: {},
        },
        standard: {
          mode: 'custom',
          placements: {
            clock: { kind: 'canvas', x: 50, y: 40, size: 'full', layer: 2 },
            timer: { kind: 'bottom-bar', order: 0, size: 'compact' },
          },
        },
      },
      recovery: { semanticV2 },
    }

    const result = prepareBackup(envelope(CURRENT_VERSION, layout))

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data.layout).toEqual(layout)
  })

  it('drops unknown V3 profiles and block IDs while retaining valid known siblings', () => {
    const layout = {
      version: 3,
      profiles: {
        standard: {
          mode: 'custom',
          placements: {
            clock: { kind: 'canvas', x: 50, y: 40, size: 'full', layer: 2 },
            futureWidget: { kind: 'canvas', x: 'malformed but unknown', y: 4, size: 'compact', layer: 0 },
          },
        },
        futureProfile: { mode: 'custom', placements: { clock: 'ignored' } },
      },
    }

    const result = prepareBackup(envelope(CURRENT_VERSION, layout))

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.layout).toEqual({
        version: 3,
        profiles: {
          standard: {
            mode: 'custom',
            placements: {
              clock: { kind: 'canvas', x: 50, y: 40, size: 'full', layer: 2 },
            },
          },
        },
      })
    }
  })

  it.each([
    ['non-finite coordinate', { kind: 'canvas', x: 1e400, y: 40, size: 'full', layer: 0 }],
    ['invalid size', { kind: 'canvas', x: 50, y: 40, size: 'expanded', layer: 0 }],
    ['invalid Bottom bar size', { kind: 'bottom-bar', order: 0, size: 'standard' }],
  ])('rejects current V3 %s before restore', (_label, placement) => {
    const layout = {
      version: 3,
      profiles: { standard: { mode: 'custom', placements: { clock: placement } } },
    }

    expect(prepareBackup(envelope(CURRENT_VERSION, layout))).toEqual({
      ok: false,
      reason: 'That backup\'s "layout" data is invalid.',
    })
  })

  it.each([
    ['primitive layout', 'bad'],
    ['array layout', []],
    ['malformed V1 known row', { clock: { x: 1 } }],
    ['wrong version', { version: 4, profiles: {} }],
    ['primitive profiles', { version: 2, profiles: 'bad' }],
    ['malformed known profile', { version: 2, profiles: { standard: [] } }],
    ['malformed known placement', { version: 2, profiles: { standard: { clock: { ...placement, zone: 'future' } } } }],
    ['missing variant', { version: 2, profiles: { standard: { clock: { ...placement, variant: undefined } } } }],
    ['invalid variant', { version: 2, profiles: { standard: { clock: { ...placement, variant: 'future' } } } }],
    ['missing priority', { version: 2, profiles: { standard: { clock: { ...placement, priority: undefined } } } }],
    ['invalid priority', { version: 2, profiles: { standard: { clock: { ...placement, priority: 'future' } } } }],
    ['negative order', { version: 2, profiles: { standard: { clock: { ...placement, order: -1 } } } }],
    ['fractional order', { version: 2, profiles: { standard: { clock: { ...placement, order: 0.5 } } } }],
    ['zero span', { version: 2, profiles: { standard: { clock: { ...placement, colSpan: 0 } } } }],
    ['fractional span', { version: 2, profiles: { standard: { clock: { ...placement, rowSpan: 1.5 } } } }],
    ['nonboolean locked', { version: 2, profiles: { standard: { clock: { ...placement, locked: 'yes' } } } }],
    ['malformed legacy', { version: 2, profiles: {}, legacy: { clock: { x: 1, y: 'bad' } } }],
  ])('rejects current V2 %s with the safe layout reason', (_label, layout) => {
    expect(prepareBackup(envelope(11, layout))).toEqual({ ok: false, reason: 'That backup\'s "layout" data is invalid.' })
  })
})
