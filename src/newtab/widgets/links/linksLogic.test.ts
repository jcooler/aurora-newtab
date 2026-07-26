import { describe, expect, it } from 'vitest'
import { addLink, moveLink, removeLink } from './linksLogic'

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
