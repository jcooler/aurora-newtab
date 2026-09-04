import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.resetModules()
})

async function loadClient(mode: 'production' | 'preview' | 'account-local', search = '') {
  vi.stubEnv('MODE', mode)
  vi.stubGlobal('location', { search })
  vi.resetModules()
  const { createAccountClient } = await import('./createAccountClient')
  return createAccountClient()
}

describe('createAccountClient', () => {
  it('activates production without a backend request when the isolated session is absent', async () => {
    const fetchSpy = vi.fn()
    const storageGet = vi.fn(async () => ({}))
    const storageSet = vi.fn()
    const storageRemove = vi.fn()
    const launchWebAuthFlow = vi.fn(async () => undefined)
    const openSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    vi.stubGlobal('chrome', {
      identity: {
        getRedirectURL: vi.fn(() => 'https://akjalbmacojpmebkgohhcaaiacicpgkh.chromiumapp.org/account-auth'),
        launchWebAuthFlow,
      },
      storage: {
        local: { get: storageGet, set: storageSet, remove: storageRemove },
        onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
      },
    })
    vi.stubGlobal('open', openSpy)

    const client = await loadClient('production')
    expect(client.accountDataExportEnabled).toBe(false)
    const snapshot = await client.getSnapshot()

    expect(snapshot).toEqual({
      mode: 'local',
      accountId: null,
      email: null,
      displayName: null,
      billing: {
        state: 'none',
        plan: null,
        currentPeriodEnd: null,
        courtesyEnd: null,
        cancelAtPeriodEnd: false,
        introductoryEligible: true,
      },
      lease: null,
      sync: {
        enabled: false,
        phase: 'disabled',
        lastSuccessAt: null,
        usedBytes: 0,
        quotaBytes: 2_097_152,
      },
      devices: [],
    })
    expect(Object.isFrozen(snapshot)).toBe(true)
    expect(Object.isFrozen(snapshot.billing)).toBe(true)
    expect(Object.isFrozen(snapshot.sync)).toBe(true)
    expect(Object.isFrozen(snapshot.devices)).toBe(true)
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(storageGet).toHaveBeenCalledWith('tab-two:account-session:v1')

    expect(await client.actions.beginSignIn()).toEqual({ ok: false, code: 'cancelled' })
    expect(launchWebAuthFlow).toHaveBeenCalledOnce()

    await client.actions.signOut()
    await client.actions.enableSync()
    await client.actions.disableSync()
    await client.actions.syncNow()
    await client.actions.revokeDevice('device-1')
    expect(await client.actions.openPlans('monthly')).toEqual({ status: 'authentication_required' })
    expect(await client.actions.openBilling()).toEqual({ status: 'authentication_required' })
    expect(await client.actions.refreshBilling()).toEqual({ status: 'authentication_required' })
    expect(await client.actions.prepareAccountDataExport()).toEqual({ status: 'data_unavailable' })
    await client.actions.deleteVault()
    await client.actions.deleteAccount()

    expect(fetchSpy).not.toHaveBeenCalled()
    expect(storageSet).not.toHaveBeenCalled()
    expect(openSpy).not.toHaveBeenCalled()
  })

  it('loads deterministic preview states by semantic query name', async () => {
    const client = await loadClient('preview', '?accountState=device-limit')

    expect(client.accountDataExportEnabled).toBe(true)
    await expect(client.actions.prepareAccountDataExport()).resolves.toMatchObject({
      status: 'ready',
      value: { account: { accountId: '43000000-0000-4000-8000-000000000001' } },
    })

    await expect(client.getSnapshot()).resolves.toEqual(
      expect.objectContaining({
        mode: 'signed_in',
        billing: expect.objectContaining({ state: 'active', plan: 'monthly' }),
        lease: expect.objectContaining({
          capabilities: [
            'encrypted_sync',
            'multi_account',
            'metrics_history',
            'google_calendar',
            'microsoft_calendar',
          ],
        }),
        sync: expect.objectContaining({ enabled: false, phase: 'needs_attention' }),
        devices: expect.arrayContaining([
          expect.objectContaining({ id: 'preview-device-5', revoked: false }),
        ]),
      }),
    )
  })

  it('falls back to the Local preview state for an unknown semantic name', async () => {
    const client = await loadClient('preview', '?accountState=not-a-state')

    await expect(client.getSnapshot()).resolves.toEqual(
      expect.objectContaining({ mode: 'local', accountId: null }),
    )
  })

  it('fails closed to Local when account-local configuration is incomplete', async () => {
    const fetchSpy = vi.fn()
    const storageGet = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    vi.stubGlobal('chrome', { storage: { local: { get: storageGet } } })

    const client = await loadClient('account-local')
    await expect(client.getSnapshot()).resolves.toEqual(expect.objectContaining({ mode: 'local' }))
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(storageGet).not.toHaveBeenCalled()
  })

  it('creates the authenticated adapter only for complete account-local configuration', async () => {
    vi.stubEnv('VITE_TAB_TWO_SUPABASE_URL', 'http://127.0.0.1:54321')
    vi.stubEnv('VITE_TAB_TWO_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_local-test-key-value')
    vi.stubEnv('VITE_TAB_TWO_TRUSTED_LEASE_KEYS', JSON.stringify({
      'local-test-key': 'MCowBQYDK2VwAyEAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    }))
    vi.stubGlobal('chrome', {
      identity: {
        getRedirectURL: vi.fn(() => 'https://abcdefghijklmnop.chromiumapp.org/account-auth'),
        launchWebAuthFlow: vi.fn(async () => undefined),
      },
      storage: {
        local: { get: vi.fn(), set: vi.fn(), remove: vi.fn() },
        onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
      },
    })

    const client = await loadClient('account-local')
    expect(client.accountDataExportEnabled).toBe(true)
    expect(await client.actions.beginSignIn()).toEqual({ ok: false, code: 'cancelled' })
  })
})
