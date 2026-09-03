import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  hasPermission,
  ensurePermission,
  originPattern,
  hasOrigin,
  ensureOrigin,
  removeOrigin,
  ensureOrigins,
  canonicalOriginPatterns,
  subscribePermission,
  GOOGLE_CALENDAR_API_ORIGIN,
  ensureGoogleCalendarOrigin,
  hasGoogleCalendarOrigin,
  removeGoogleCalendarOrigin,
  MICROSOFT_GRAPH_ORIGIN,
  ensureMicrosoftGraphOrigin,
  hasMicrosoftGraphOrigin,
  removeMicrosoftGraphOrigin,
} from './permissions'

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

  it('canonicalOriginPatterns preserves first-seen order while collapsing duplicate urls and patterns', () => {
    expect(
      canonicalOriginPatterns([
        'https://b.example.com/path',
        'https://a.example.com/*',
        'https://b.example.com/other',
      ]),
    ).toEqual(['https://b.example.com/*', 'https://a.example.com/*'])
  })

  it('canonicalOriginPatterns throws for a malformed member before any Chrome boundary is needed', () => {
    expect(() => canonicalOriginPatterns(['https://ok.example.com/', 'http://bad.example.com/'])).toThrow()
  })

  it('subscribePermission reports only matching add/remove changes and cleans up both listeners', () => {
    const added = new Set<(permissions: chrome.permissions.Permissions) => void>()
    const removed = new Set<(permissions: chrome.permissions.Permissions) => void>()
    const onAdded = {
      addListener: vi.fn((listener: (permissions: chrome.permissions.Permissions) => void) => added.add(listener)),
      removeListener: vi.fn((listener: (permissions: chrome.permissions.Permissions) => void) => added.delete(listener)),
    }
    const onRemoved = {
      addListener: vi.fn((listener: (permissions: chrome.permissions.Permissions) => void) => removed.add(listener)),
      removeListener: vi.fn((listener: (permissions: chrome.permissions.Permissions) => void) => removed.delete(listener)),
    }
    vi.stubGlobal('chrome', { permissions: { onAdded, onRemoved } })
    const listener = vi.fn()
    const cleanup = subscribePermission('downloads', listener)

    added.forEach((fire) => fire({ permissions: ['bookmarks'] }))
    added.forEach((fire) => fire({ permissions: ['downloads'] }))
    removed.forEach((fire) => fire({ permissions: ['downloads'] }))
    expect(listener.mock.calls).toEqual([[true], [false]])
    cleanup()
    expect(onAdded.removeListener).toHaveBeenCalled()
    expect(onRemoved.removeListener).toHaveBeenCalled()
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

  it('removeOrigin returns true and forwards the URL\'s origin pattern to chrome.permissions.remove', async () => {
    const remove = vi.fn().mockResolvedValue(true)
    vi.stubGlobal('chrome', { permissions: { remove } })

    await expect(removeOrigin('https://news.ycombinator.com/item?id=1')).resolves.toBe(true)
    expect(remove).toHaveBeenCalledWith({ origins: ['https://news.ycombinator.com/*'] })
  })

  it('removeOrigin propagates a rejecting remove so revoke failure remains retryable', async () => {
    const remove = vi.fn().mockRejectedValue(new Error('nope'))
    vi.stubGlobal('chrome', { permissions: { remove } })

    await expect(removeOrigin('https://example.com/')).rejects.toThrow('nope')
  })

  it('removeOrigin returns false when Chrome reports that the origin was not removed', async () => {
    const remove = vi.fn().mockResolvedValue(false)
    vi.stubGlobal('chrome', { permissions: { remove } })

    await expect(removeOrigin('https://example.com/*')).resolves.toBe(false)
  })
})

// Task 95: the plural counterpart to ensureOrigin, first needed by the APOD
// background feature (two origins — api.nasa.gov and apod.nasa.gov — granted
// via ONE settings-toggle click, since Chrome only shows its permission
// prompt once per gesture).
describe('ensureOrigins (plural gesture helper)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('computes every pattern synchronously and requests them all in ONE chrome.permissions.request call', async () => {
    const request = vi.fn().mockResolvedValue(true)
    vi.stubGlobal('chrome', { permissions: { request } })

    await expect(
      ensureOrigins(['https://api.nasa.gov/planetary/apod', 'https://apod.nasa.gov/apod/image/x.jpg']),
    ).resolves.toBe(true)
    expect(request).toHaveBeenCalledTimes(1)
    expect(request).toHaveBeenCalledWith({ origins: ['https://api.nasa.gov/*', 'https://apod.nasa.gov/*'] })
  })

  it('forwards a denial (request resolving false) rather than swallowing it', async () => {
    const request = vi.fn().mockResolvedValue(false)
    vi.stubGlobal('chrome', { permissions: { request } })

    await expect(ensureOrigins(['https://api.nasa.gov/', 'https://apod.nasa.gov/'])).resolves.toBe(false)
  })

  it('a non-https member resolves false with ZERO awaits/request calls — the throw is caught before the gesture-consuming call', async () => {
    const request = vi.fn().mockResolvedValue(true)
    vi.stubGlobal('chrome', { permissions: { request } })

    await expect(ensureOrigins(['https://api.nasa.gov/', 'http://apod.nasa.gov/'])).resolves.toBe(false)
    expect(request).not.toHaveBeenCalled()
  })

  it('a garbage/unparseable URL member also resolves false with zero request calls', async () => {
    const request = vi.fn().mockResolvedValue(true)
    vi.stubGlobal('chrome', { permissions: { request } })

    await expect(ensureOrigins(['not a url'])).resolves.toBe(false)
    expect(request).not.toHaveBeenCalled()
  })
})

describe('Google Calendar optional origin boundary', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('pins request, observation, and removal to the exact Google APIs origin', async () => {
    const contains = vi.fn().mockResolvedValue(true)
    const request = vi.fn().mockResolvedValue(true)
    const remove = vi.fn().mockResolvedValue(true)
    vi.stubGlobal('chrome', { permissions: { contains, request, remove } })

    expect(GOOGLE_CALENDAR_API_ORIGIN).toBe('https://www.googleapis.com/*')
    await expect(ensureGoogleCalendarOrigin()).resolves.toBe(true)
    await expect(hasGoogleCalendarOrigin()).resolves.toBe(true)
    await expect(removeGoogleCalendarOrigin()).resolves.toBe(true)
    expect(request).toHaveBeenCalledWith({ origins: [GOOGLE_CALENDAR_API_ORIGIN] })
    expect(contains).toHaveBeenCalledWith({ origins: [GOOGLE_CALENDAR_API_ORIGIN] })
    expect(remove).toHaveBeenCalledWith({ origins: [GOOGLE_CALENDAR_API_ORIGIN] })
  })
})

describe('Microsoft Calendar optional origin boundary', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('pins request, observation, and removal to the exact Graph origin without touching Google', async () => {
    const contains = vi.fn().mockResolvedValue(true)
    const request = vi.fn().mockResolvedValue(true)
    const remove = vi.fn().mockResolvedValue(true)
    vi.stubGlobal('chrome', { permissions: { contains, request, remove } })

    expect(MICROSOFT_GRAPH_ORIGIN).toBe('https://graph.microsoft.com/*')
    await expect(ensureMicrosoftGraphOrigin()).resolves.toBe(true)
    await expect(hasMicrosoftGraphOrigin()).resolves.toBe(true)
    await expect(removeMicrosoftGraphOrigin()).resolves.toBe(true)
    expect(request).toHaveBeenCalledTimes(1)
    expect(request).toHaveBeenCalledWith({ origins: [MICROSOFT_GRAPH_ORIGIN] })
    expect(contains).toHaveBeenCalledWith({ origins: [MICROSOFT_GRAPH_ORIGIN] })
    expect(remove).toHaveBeenCalledWith({ origins: [MICROSOFT_GRAPH_ORIGIN] })
    expect(request).not.toHaveBeenCalledWith({ origins: [GOOGLE_CALENDAR_API_ORIGIN] })
  })

  it('preserves an explicit denial and rejection without a second request', async () => {
    const request = vi.fn()
      .mockResolvedValueOnce(false)
      .mockRejectedValueOnce(new Error('gesture expired'))
    vi.stubGlobal('chrome', { permissions: { request } })

    await expect(ensureMicrosoftGraphOrigin()).resolves.toBe(false)
    await expect(ensureMicrosoftGraphOrigin()).rejects.toThrow('gesture expired')
    expect(request).toHaveBeenCalledTimes(2)
    expect(request).toHaveBeenNthCalledWith(1, { origins: [MICROSOFT_GRAPH_ORIGIN] })
    expect(request).toHaveBeenNthCalledWith(2, { origins: [MICROSOFT_GRAPH_ORIGIN] })
  })
})
