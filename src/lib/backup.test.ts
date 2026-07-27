import { describe, expect, it } from 'vitest'
import { serializeBackup, parseBackup } from './backup'
import { CURRENT_VERSION, defaults } from './storage/schema'

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
