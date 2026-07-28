import { describe, expect, it } from 'vitest'
import { serializeBackup, parseBackup, validateBackupShape } from './backup'
import { CURRENT_VERSION, defaults } from './storage/schema'
import { migrate } from './storage/migrations'

describe('serializeBackup / parseBackup round-trip', () => {
  it('round-trips: serialize -> parse -> data deep-equals the input', () => {
    const input = { ...defaults(), links: [{ id: '1', title: 'HN', url: 'https://news.ycombinator.com' }] }
    const json = serializeBackup(input)
    const result = parseBackup(json)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data).toEqual(input)
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
    expect(envelope.data).toEqual(defaults())
    // Pretty-printed: multiple lines, not a single minified line.
    expect(json.split('\n').length).toBeGreaterThan(1)
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

  it('rejects settings.searchEngine outside the known engine keys', () => {
    // Unlike theme/units/photoPrefs.mode, an unrecognized searchEngine is a
    // real reachable crash: SearchBar.tsx calls ENGINES[engine].url, and an
    // uncaught TypeError from a form's onSubmit handler isn't caught by any
    // React error boundary (event-handler throws don't unwind through one).
    const bad = { ...defaults(), settings: { ...defaults().settings, searchEngine: 'yahoo' } }
    const result = validateBackupShape(bad as never)
    expect(result).toEqual({ ok: false, reason: 'That backup\'s "settings" data is invalid.' })
  })

  it('accepts every real engine key as a valid settings.searchEngine', () => {
    for (const engine of ['google', 'duckduckgo', 'bing'] as const) {
      const ok = { ...defaults(), settings: { ...defaults().settings, searchEngine: engine } }
      const result = validateBackupShape(ok as never)
      expect(result.ok).toBe(true)
    }
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
})
