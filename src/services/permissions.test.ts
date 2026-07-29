import { afterEach, describe, expect, it, vi } from 'vitest'
import { hasPermission, ensurePermission } from './permissions'

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
