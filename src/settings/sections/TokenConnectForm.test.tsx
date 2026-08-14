// @vitest-environment jsdom
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { createStorage, type AuroraStorage } from '../../lib/storage'
import { memoryDriver } from '../../lib/storage/driver'
import { initializePermissionMirror } from '../../services/permissionMirror'
import { TokenConnectForm, type TokenField } from './TokenConnectForm'

type PermissionListener = (permissions: chrome.permissions.Permissions) => void

const held = new Set<string>()
const addedListeners: PermissionListener[] = []
const removedListeners: PermissionListener[] = []
let order: string[] = []
let requestGranted = true
const getAll = vi.fn(async () => ({ origins: [...held] }))
const request = vi.fn(async ({ origins = [] }: chrome.permissions.Permissions) => {
  order.push('request')
  if (!requestGranted) return false
  for (const origin of origins) held.add(origin)
  addedListeners.forEach((listener) => listener({ origins }))
  return true
})
const contains = vi.fn(async ({ origins = [] }: chrome.permissions.Permissions) =>
  origins.every((origin) => held.has(origin)),
)
const remove = vi.fn(async ({ origins = [] }: chrome.permissions.Permissions) => {
  const removed = origins.some((origin) => held.delete(origin))
  if (removed) removedListeners.forEach((listener) => listener({ origins }))
  return removed
})
const locks = {
  request: vi.fn(async (_name: string, _options: LockOptions, work: () => Promise<unknown>) => {
    order.push('lock-queued')
    return Promise.resolve().then(() => {
      order.push('lock-callback')
      return work()
    })
  }),
}

const FIELDS: TokenField[] = [
  { id: 'token', label: 'Personal access token', type: 'password', placeholder: 'ghp_...' },
  { id: 'username', label: 'Username', type: 'text', placeholder: 'octocat' },
]

function clearPermissions() {
  const origins = [...held]
  held.clear()
  if (origins.length > 0) removedListeners.forEach((listener) => listener({ origins }))
}

function grantExisting(...origins: string[]) {
  origins.forEach((origin) => held.add(origin))
  addedListeners.forEach((listener) => listener({ origins }))
}

beforeAll(async () => {
  vi.stubGlobal('chrome', {
    permissions: {
      getAll,
      request,
      contains,
      remove,
      onAdded: { addListener: (listener: PermissionListener) => addedListeners.push(listener) },
      onRemoved: { addListener: (listener: PermissionListener) => removedListeners.push(listener) },
    },
  })
  Object.defineProperty(navigator, 'locks', { configurable: true, value: locks })
  await initializePermissionMirror()
})

afterAll(() => {
  vi.unstubAllGlobals()
  Reflect.deleteProperty(navigator, 'locks')
})

beforeEach(() => {
  clearPermissions()
  order = []
  requestGranted = true
  getAll.mockClear()
  request.mockClear()
  contains.mockClear()
  remove.mockReset()
  remove.mockImplementation(async ({ origins = [] }: chrome.permissions.Permissions) => {
    const removed = origins.some((origin) => held.delete(origin))
    if (removed) removedListeners.forEach((listener) => listener({ origins }))
    return removed
  })
  locks.request.mockClear()
})

async function renderForm(overrides: Record<string, unknown> = {}) {
  const storage = (overrides.storage as AuroraStorage | undefined) ?? createStorage(memoryDriver())
  if (typeof storage.init === 'function') await storage.init()
  const validate = vi.fn(async () => ({ ok: true as const, identity: 'octocat' }))
  const onConnected = vi.fn(async () => {})
  const onDisconnect = vi.fn(async () => [] as string[])
  const reportPendingCleanup = vi.fn()
  const props = {
    fields: FIELDS,
    originsFor: () => ['https://api.example.com/*'],
    validate,
    onConnected,
    connectedAs: null,
    onDisconnect,
    storage,
    reportPendingCleanup,
    ...overrides,
  }
  render(<TokenConnectForm {...(props as Parameters<typeof TokenConnectForm>[0])} />)
  return { storage, validate, onConnected, onDisconnect, reportPendingCleanup }
}

function fillFields() {
  fireEvent.change(screen.getByLabelText('Personal access token'), { target: { value: 'secret-token' } })
  fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'octocat' } })
}

describe('TokenConnectForm origin transactions', () => {
  it('queues lifecycle work, requests only a click-time mirror-absent origin, then validates and persists', async () => {
    const alreadyHeld = 'https://existing.example.com/*'
    const newlyRequested = 'https://new.example.com/*'
    grantExisting(alreadyHeld)
    const { validate, onConnected } = await renderForm({ originsFor: () => [alreadyHeld, newlyRequested] })
    fillFields()

    fireEvent.click(screen.getByRole('button', { name: 'Connect' }))

    expect(order).toEqual(['lock-queued', 'request'])
    expect(request).toHaveBeenCalledWith({ origins: [newlyRequested] })

    await act(async () => {})

    expect(order).toEqual(['lock-queued', 'request', 'lock-callback'])
    expect(validate).toHaveBeenCalledWith({ token: 'secret-token', username: 'octocat' })
    expect(onConnected).toHaveBeenCalledWith({ token: 'secret-token', username: 'octocat' }, 'octocat')
  })

  it('rolls back a newly granted origin when credentials are invalid, without storing a connector', async () => {
    const origin = 'https://new.example.com/*'
    const { storage, onConnected } = await renderForm({
      originsFor: () => [origin],
      validate: vi.fn(async () => ({ ok: false as const, message: 'Bad token' })),
    })
    fillFields()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Connect' }))
    })

    expect(onConnected).not.toHaveBeenCalled()
    expect(held.has(origin)).toBe(false)
    expect(remove).toHaveBeenCalledWith({ origins: [origin] })
    expect((await storage.get('connectors')).github).toBeUndefined()
    expect((await screen.findByRole('alert')).textContent).toBe('Bad token')
  })

  it('keeps a pre-existing origin after invalid credentials', async () => {
    const origin = 'https://existing.example.com/*'
    grantExisting(origin)
    await renderForm({
      originsFor: () => [origin],
      validate: vi.fn(async () => ({ ok: false as const, message: 'Bad token' })),
    })
    fillFields()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Connect' }))
    })

    expect(held.has(origin)).toBe(true)
    expect(remove).not.toHaveBeenCalled()
  })

  it('recovers a rejected persistence write, rolls back its new origin, and shows a storage alert', async () => {
    const origin = 'https://new.example.com/*'
    const storage = {
      async get(key: string) {
        if (key === 'connectors') return {}
        if (key === 'photoPrefs') return { mode: 'auto', index: 0, lastRotated: '' }
        throw new Error(`unexpected key ${key}`)
      },
      async update() {
        throw new Error('disk full')
      },
    } as unknown as AuroraStorage
    const { reportPendingCleanup } = await renderForm({
      storage,
      originsFor: () => [origin],
      onConnected: async () => storage.update('connectors', (value) => value),
    })
    fillFields()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Connect' }))
    })

    expect(held.has(origin)).toBe(false)
    expect(reportPendingCleanup).not.toHaveBeenCalled()
    expect((await screen.findByRole('alert')).textContent).toMatch(/couldn't save/i)
  })

  it('reports a failed rollback for durable Settings-level cleanup', async () => {
    const origin = 'https://stuck.example.com/*'
    remove.mockRejectedValueOnce(new Error('remove failed'))
    const { reportPendingCleanup } = await renderForm({
      originsFor: () => [origin],
      validate: vi.fn(async () => ({ ok: false as const, message: 'Bad token' })),
    })
    fillFields()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Connect' }))
    })

    expect(held.has(origin)).toBe(true)
    expect(reportPendingCleanup).toHaveBeenCalledWith([origin])
  })
})

describe('TokenConnectForm connected state', () => {
  it('renders connected extras before Disconnect and delegates the removal callback', async () => {
    const { onDisconnect } = await renderForm({
      connectedAs: 'octocat',
      connectedExtras: <div data-testid="extras">Show on your board</div>,
    })

    const extras = screen.getByTestId('extras')
    const disconnect = screen.getByRole('button', { name: 'Disconnect' })
    expect(extras.compareDocumentPosition(disconnect) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    await act(async () => {
      fireEvent.click(disconnect)
    })

    expect(onDisconnect).toHaveBeenCalledOnce()
  })
})
