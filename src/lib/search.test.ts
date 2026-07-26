import { describe, expect, it } from 'vitest'
import { searchUrl } from './search'

describe('searchUrl', () => {
  it('builds an encoded query URL for the chosen engine', () => {
    expect(searchUrl('google', 'hello world')).toBe(
      'https://www.google.com/search?q=hello%20world',
    )
    expect(searchUrl('duckduckgo', 'a&b')).toBe('https://duckduckgo.com/?q=a%26b')
  })
  it('trims the query', () => {
    expect(searchUrl('bing', '  cats  ')).toBe('https://www.bing.com/search?q=cats')
  })
})
