import { afterEach, describe, expect, it, vi } from 'vitest'
import { hasPermission, ensurePermission, originPattern, hasOrigin, ensureOrigin, removeOrigin } from './permissions'

describe('hasPermission / ensurePermission (chrome.permissions wrappers)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('hasPermission forwards the named permission to chrome.permissions.contains', async () => {
    const contains = vi.fn().mockResolvedValue(true)
    vi.stubGlobal('chrome', { permissions: { contains } })

    await expect(hasPermission('geolocation')).resolves.toBe(true)
    expect(contains).toHaveBeenCalledWith({ permissions: ['geolocation'] })
  })

  it('hasPermission resolves false when chrome.permissions.contains does', async () => {
    const contains = vi.fn().mockResolvedValue(false)
    vi.stubGlobal('chrome', { permissions: { contains } })

    await expect(hasPermission('bookmarks')).resolves.toBe(false)
  })

  it('ensurePermission calls chrome.permissions.request directly — no contains() pre-check, so no extra await lands between the click and the gesture-consuming call', async () => {
    const contains = vi.fn()
    const request = vi.fn().mockResolvedValue(true)
    vi.stubGlobal('chrome', { permissions: { contains, request } })

    await expect(ensurePermission('geolocation')).resolves.toBe(true)
    expect(request).toHaveBeenCalledWith({ permissions: ['geolocation'] })
    expect(contains).not.toHaveBeenCalled()
  })

  it('ensurePermission forwards a denial (request resolving false) rather than swallowing it', async () => {
    const request = vi.fn().mockResolvedValue(false)
    vi.stubGlobal('chrome', { permissions: { request } })

    await expect(ensurePermission('geolocation')).resolves.toBe(false)
  })

  it('ensurePermission is parameterized by permission name — a bookmarks call and a geolocation call each request only their own name', async () => {
    const request = vi.fn().mockResolvedValue(true)
    vi.stubGlobal('chrome', { permissions: { request } })

    await ensurePermission('bookmarks')
    await ensurePermission('geolocation')

    expect(request).toHaveBeenNthCalledWith(1, { permissions: ['bookmarks'] })
    expect(request).toHaveBeenNthCalledWith(2, { permissions: ['geolocation'] })
  })
})

describe('originPattern (URL -> chrome.permissions origin match pattern)', () => {
  it('strips the path, keeping only scheme + host', () => {
    expect(originPattern('https://news.ycombinator.com/path')).toBe('https://news.ycombinator.com/*')
  })

  it('strips the query string', () => {
    expect(originPattern('https://news.ycombinator.com/path?foo=bar')).toBe('https://news.ycombinator.com/*')
  })

  it('preserves a non-default port', () => {
    expect(originPattern('https://host:8443/x')).toBe('https://host:8443/*')
  })

  it('throws on a non-https URL', () => {
    expect(() => originPattern('http://example.com')).toThrow()
  })

  it('throws on a garbage/invalid URL', () => {
    expect(() => originPattern('not a url')).toThrow()
  })
})

describe('hasOrigin / ensureOrigin / removeOrigin (chrome.permissions origin wrappers)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('hasOrigin forwards the URL\'s origin pattern to chrome.permissions.contains', async () => {
    const contains = vi.fn().mockResolvedValue(true)
    vi.stubGlobal('chrome', { permissions: { contains } })

    await expect(hasOrigin('https://news.ycombinator.com/item?id=1')).resolves.toBe(true)
    expect(contains).toHaveBeenCalledWith({ origins: ['https://news.ycombinator.com/*'] })
  })

  it('hasOrigin resolves false when chrome.permissions.contains does', async () => {
    const contains = vi.fn().mockResolvedValue(false)
    vi.stubGlobal('chrome', { permissions: { contains } })

    await expect(hasOrigin('https://example.com/')).resolves.toBe(false)
  })

  it('ensureOrigin calls chrome.permissions.request directly — no contains() pre-check, so no extra await lands between the click and the gesture-consuming call', async () => {
    const contains = vi.fn()
    const request = vi.fn().mockResolvedValue(true)
    vi.stubGlobal('chrome', { permissions: { contains, request } })

    await expect(ensureOrigin('https://news.ycombinator.com/item?id=1')).resolves.toBe(true)
    expect(request).toHaveBeenCalledWith({ origins: ['https://news.ycombinator.com/*'] })
    expect(contains).not.toHaveBeenCalled()
  })

  it('ensureOrigin forwards a denial (request resolving false) rather than swallowing it', async () => {
    const request = vi.fn().mockResolvedValue(false)
    vi.stubGlobal('chrome', { permissions: { request } })

    await expect(ensureOrigin('https://example.com/')).resolves.toBe(false)
  })

  it('removeOrigin forwards the URL\'s origin pattern to chrome.permissions.remove', async () => {
    const remove = vi.fn().mockResolvedValue(true)
    vi.stubGlobal('chrome', { permissions: { remove } })

    await removeOrigin('https://news.ycombinator.com/item?id=1')
    expect(remove).toHaveBeenCalledWith({ origins: ['https://news.ycombinator.com/*'] })
  })

  it('removeOrigin tolerates a rejecting remove — resolves rather than throwing', async () => {
    const remove = vi.fn().mockRejectedValue(new Error('nope'))
    vi.stubGlobal('chrome', { permissions: { remove } })

    await expect(removeOrigin('https://example.com/')).resolves.toBeUndefined()
  })

  it('removeOrigin is a safe no-op when the origin was never granted (remove resolves false)', async () => {
    const remove = vi.fn().mockResolvedValue(false)
    vi.stubGlobal('chrome', { permissions: { remove } })

    await expect(removeOrigin('https://example.com/')).resolves.toBeUndefined()
  })
})
