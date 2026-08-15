import { describe, expect, it } from 'vitest'
import { addLink, moveLink, normalizeUrl, removeLink } from './linksLogic'

const seed = [
  { id: 'a', title: 'A', url: 'https://a.example' },
  { id: 'b', title: 'B', url: 'https://b.example' },
  { id: 'c', title: 'C', url: 'https://c.example' },
]

describe('addLink', () => {
  it('appends with a generated id and normalized url', () => {
    const out = addLink([], 'Mail', 'gmail.com')
    expect(out).toHaveLength(1)
    expect(out[0].url).toBe('https://gmail.com')
    expect(out[0].id).toBeTruthy()
  })
  it('keeps an explicit scheme', () => {
    expect(addLink([], 'X', 'http://x.test')[0].url).toBe('http://x.test')
  })
  it('trims the title and falls back to the hostname', () => {
    expect(addLink([], '   ', 'https://news.ycombinator.com')[0].title).toBe(
      'news.ycombinator.com',
    )
  })
  it('no-ops on malformed input', () => {
    expect(addLink([], 'X', 'not a url')).toEqual([])
  })
})

describe('normalizeUrl', () => {
  it('rejects unparseable input', () => {
    expect(normalizeUrl('not a url')).toBeNull()
  })
  it('rejects a bare scheme with no host', () => {
    expect(normalizeUrl('https://')).toBeNull()
  })
  it('rejects disallowed schemes', () => {
    expect(normalizeUrl('javascript://alert(1)')).toBeNull()
  })
  it.each([
    'mailto:user@example.com',
    'javascript:payload@example.com',
    'data:text/plain,hello',
    'vbscript:payload',
    'chrome://settings',
    'file:///private.txt',
    'https://user:password@example.com/private',
    'https:example.com',
    'https:/example.com',
  ])('rejects explicit unsafe schemes and embedded credentials: %s', (input) => {
    expect(normalizeUrl(input)).toBeNull()
    expect(addLink(seed, 'Unsafe', input)).toEqual(seed)
  })
  it('normalizes a bare hostname', () => {
    expect(normalizeUrl('gmail.com')).toBe('https://gmail.com')
  })
  it('preserves bare localhost and host ports', () => {
    expect(normalizeUrl('localhost:5173/path')).toBe('https://localhost:5173/path')
    expect(normalizeUrl('example.com:8080/path')).toBe('https://example.com:8080/path')
  })
})

describe('removeLink', () => {
  it('removes by id', () => {
    expect(removeLink(seed, 'b').map((l) => l.id)).toEqual(['a', 'c'])
  })
})

describe('moveLink', () => {
  it('reorders forward and backward', () => {
    expect(moveLink(seed, 0, 2).map((l) => l.id)).toEqual(['b', 'c', 'a'])
    expect(moveLink(seed, 2, 0).map((l) => l.id)).toEqual(['c', 'a', 'b'])
  })
  it('ignores out-of-range moves', () => {
    expect(moveLink(seed, 5, 0)).toEqual(seed)
  })
})
