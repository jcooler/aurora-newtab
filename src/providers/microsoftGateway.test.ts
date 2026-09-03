import { describe, expect, it, vi } from 'vitest'
import {
  createMicrosoftCalendarGateway,
  createPreviewMicrosoftCalendarGateway,
} from './microsoftGateway'
import { createPreviewAccountClient } from '../account/previewAccountClient'

const now = Date.UTC(2026, 8, 3, 18, 0, 0)
const origin = 'https://ovlobmvxtryitupxwylg.supabase.co'
const accountId = '43000000-0000-4000-8000-000000000001'
const connectionId = '63000000-0000-4000-8000-000000000001'
const nonce = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
const redirect = 'https://abcdefghijklmnopabcdefghijklmnop.chromiumapp.org/microsoft-calendar'

function json(value: unknown): Response {
  return new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } })
}

describe('Microsoft Calendar provider gateway', () => {
  it('provides two deterministic account kinds in preview without network or Chrome APIs', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    vi.stubGlobal('location', { search: '?accountState=active' })
    try {
      const gateway = createPreviewMicrosoftCalendarGateway('two-account', now)
      const listed = await gateway.listConnections()
      expect(listed.ok && [...listed.value.connections.map((value) => value.accountKind)].sort())
        .toEqual(['personal', 'work_or_school'])
      const firstId = listed.ok ? listed.value.connections[0]!.connectionId : ''
      await expect(gateway.getSession(firstId)).resolves.toMatchObject({
        ok: true,
        value: { provider: 'microsoft_calendar', accessToken: 'preview-microsoft-calendar-authority' },
      })
      const client = createPreviewAccountClient()
      await expect(client.providerGateways.microsoft_calendar?.listConnections()).resolves.toMatchObject({
        ok: true,
        value: { accountId },
      })
      expect(fetchSpy).not.toHaveBeenCalled()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('keeps Microsoft endpoints, entitlement, metadata, and origin lifecycle isolated', async () => {
    const fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/microsoft-calendar-oauth-start')) {
        return json({ authorizationUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=test' })
      }
      if (url.endsWith('/microsoft-calendar-connections')) return json({ connections: [{
        id: connectionId,
        provider: 'microsoft_calendar',
        accountKind: 'personal',
        email: 'alex@outlook.example',
        displayName: 'Alex',
        status: 'active',
        grantedScopes: [
          'openid',
          'offline_access',
          'https://graph.microsoft.com/User.Read',
          'https://graph.microsoft.com/Calendars.ReadBasic',
        ],
        createdAt: now - 1,
        updatedAt: now,
      }] })
      return json({})
    }) as typeof globalThis.fetch
    const requestMicrosoftOrigin = vi.fn(async () => true)
    const removeMicrosoftOrigin = vi.fn(async () => true)
    const gateway = createMicrosoftCalendarGateway({
      enabled: true,
      origin,
      allowedOrigins: [origin],
      fetch,
      now: () => now,
      randomBytes: () => new Uint8Array(32),
      getAccount: () => ({
        accountId,
        capabilities: ['multi_account', 'microsoft_calendar'],
        leaseExpiresAt: now + 60_000,
      }),
      getAccessToken: async () => 'tab-two-token',
      invalidateAuthentication: vi.fn(),
      identity: {
        getRedirectURL: () => redirect,
        launchWebAuthFlow: vi.fn(async () => `${redirect}?nonce=${nonce}&result=success`),
      },
      requestMicrosoftOrigin,
      removeMicrosoftOrigin,
    })

    await expect(gateway.connect()).resolves.toMatchObject({
      ok: true,
      value: { connections: [{ accountKind: 'personal', provider: 'microsoft_calendar' }] },
    })
    expect(requestMicrosoftOrigin).toHaveBeenCalledTimes(1)
    expect(removeMicrosoftOrigin).not.toHaveBeenCalled()
    expect(fetch).toHaveBeenCalledWith(
      `${origin}/functions/v1/microsoft-calendar-oauth-start`,
      expect.any(Object),
    )
  })

  it('surfaces organization approval without listing connections', async () => {
    const fetch = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith('/microsoft-calendar-oauth-start')) {
        return json({ authorizationUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize' })
      }
      throw new Error('connections must not be requested')
    }) as typeof globalThis.fetch
    const gateway = createMicrosoftCalendarGateway({
      enabled: true,
      origin,
      allowedOrigins: [origin],
      fetch,
      now: () => now,
      randomBytes: () => new Uint8Array(32),
      getAccount: () => ({
        accountId,
        capabilities: ['multi_account', 'microsoft_calendar'],
        leaseExpiresAt: now + 60_000,
      }),
      getAccessToken: async () => 'tab-two-token',
      invalidateAuthentication: vi.fn(),
      identity: {
        getRedirectURL: () => redirect,
        launchWebAuthFlow: vi.fn(async () => (
          `${redirect}?nonce=${nonce}&result=organization_approval_required`
        )),
      },
      requestMicrosoftOrigin: vi.fn(async () => true),
      removeMicrosoftOrigin: vi.fn(async () => true),
    })

    await expect(gateway.connect()).resolves.toEqual({
      ok: false,
      code: 'organization_approval_required',
    })
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})
