import { describe, expect, it } from 'vitest'
import { canonicalJson, canonicalUtf8 } from './canonical'

describe('canonicalJson', () => {
  it('sorts object keys recursively while preserving array order and exact JSON escaping', () => {
    const value = {
      zebra: [{ beta: '\u2028', alpha: 'quote"' }, 0],
      alpha: { delta: true, charlie: null },
    }

    expect(canonicalJson(value)).toBe(
      '{"alpha":{"charlie":null,"delta":true},"zebra":[{"alpha":"quote\\\"","beta":" "},0]}',
    )
    expect([...canonicalUtf8(value)]).toEqual([
      ...new TextEncoder().encode(canonicalJson(value)),
    ])
  })

  it('canonicalizes negative zero and rejects values JSON cannot represent exactly', () => {
    expect(canonicalJson({ value: -0 })).toBe('{"value":0}')

    for (const value of [undefined, Number.NaN, Number.POSITIVE_INFINITY, 1n, Symbol('x')]) {
      expect(() => canonicalJson(value)).toThrow('sync_canonical_value_invalid')
    }
    expect(() => canonicalJson({ value: undefined })).toThrow('sync_canonical_value_invalid')
    expect(() => canonicalJson([undefined])).toThrow('sync_canonical_value_invalid')
  })

  it('rejects sparse arrays, non-plain objects, accessors, and cycles', () => {
    const sparse = new Array(1)
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    const accessor = Object.defineProperty({}, 'secret', { enumerable: true, get: () => 'read' })

    for (const value of [sparse, new Date(0), new Map(), accessor, cyclic]) {
      expect(() => canonicalJson(value)).toThrow('sync_canonical_value_invalid')
    }
  })
})
