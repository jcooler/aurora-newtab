import { describe, expect, it } from 'vitest'
import { isSafeQuickLinkUrl, normalizeQuickLinkUrl } from './quickLinkUrl'

describe('Quick Link URL policy', () => {
  it.each([
    'mailto:user@example.com',
    'javascript:payload@example.com',
    'data:text/plain,hello',
    'vbscript:payload',
    'chrome://settings',
    'file:///private.txt',
    'https://user:password@example.com/private',
  ])('rejects unsafe or credential-bearing input %s', (input) => {
    expect(normalizeQuickLinkUrl(input)).toBeNull()
    expect(isSafeQuickLinkUrl(input)).toBe(false)
  })

  it.each([
    'http:example.com',
    'https:example.com',
    'http:/example.com',
    'https:/example.com',
  ])('rejects malformed explicit HTTP(S) input %s instead of storing a non-renderable value', (input) => {
    expect(normalizeQuickLinkUrl(input)).toBeNull()
    expect(isSafeQuickLinkUrl(input)).toBe(false)
  })

  it.each([
    ['https://example.com/path', 'https://example.com/path'],
    ['http://example.com:8080/path', 'http://example.com:8080/path'],
    ['example.com:8080/path', 'https://example.com:8080/path'],
    ['localhost:5173/path', 'https://localhost:5173/path'],
  ])('keeps valid HTTP(S), bare-host, and port input %s', (input, expected) => {
    expect(normalizeQuickLinkUrl(input)).toBe(expected)
    expect(isSafeQuickLinkUrl(expected)).toBe(true)
  })
})
