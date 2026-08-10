// src/services/connectors/views.test.ts — the generic resolveViews<V>: every
// connector's per-config `views` field resolves through this ONE function
// (wave-1's resolveGithubViews backfill semantics, generalized). Each key
// comes from `stored` only when stored carries an actual boolean for it;
// anything else (missing key, undefined/null container, a hand-edited
// non-boolean value) falls back to that key's default — so a section can
// never vanish for lack of a key or a corrupted value.
import { describe, expect, it } from 'vitest'
import { resolveViews } from './views'

const DEFAULTS = { alpha: true, beta: false, gamma: true }

describe('resolveViews', () => {
  it('undefined stored resolves to the defaults verbatim', () => {
    expect(resolveViews(DEFAULTS, undefined)).toEqual(DEFAULTS)
  })

  it('null stored resolves to the defaults verbatim', () => {
    expect(resolveViews(DEFAULTS, null)).toEqual(DEFAULTS)
  })

  it('{} (no keys at all) resolves to the defaults verbatim', () => {
    expect(resolveViews(DEFAULTS, {})).toEqual(DEFAULTS)
  })

  it('a partial stored object overrides only its own keys, leaving the rest at default', () => {
    expect(resolveViews(DEFAULTS, { beta: true })).toEqual({ alpha: true, beta: true, gamma: true })
  })

  it('a fully-specified stored object overrides every key', () => {
    expect(resolveViews(DEFAULTS, { alpha: false, beta: true, gamma: false })).toEqual({
      alpha: false,
      beta: true,
      gamma: false,
    })
  })

  it('a non-boolean stored value (hand-edited backup) falls back to that key\'s default rather than being used verbatim', () => {
    expect(resolveViews(DEFAULTS, { gamma: 'yes' } as never)).toEqual(DEFAULTS)
  })

  it('a non-boolean stored value alongside valid overrides only replaces the bad key with the default', () => {
    expect(resolveViews(DEFAULTS, { alpha: false, beta: 'yes' } as never)).toEqual({
      alpha: false,
      beta: false,
      gamma: true,
    })
  })

  it('does not mutate the defaults object passed in', () => {
    const defaultsCopy = { ...DEFAULTS }
    resolveViews(DEFAULTS, { alpha: false })
    expect(DEFAULTS).toEqual(defaultsCopy)
  })
})
