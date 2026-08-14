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
  const onDisconnect = vi.fn(async () => ({
    candidates: [] as string[],
    transaction: {
      status: 'committed' as const,
      value: undefined,
      preExisting: [] as string[],
      acquired: [] as string[],
    },
  }))
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

  it('a denied origin grant shows an alert and calls neither validate nor onConnected', async () => {
    requestGranted = false
    const { validate, onConnected } = await renderForm()
    fillFields()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Connect' }))
    })

    expect(request).toHaveBeenCalledOnce()
    expect(validate).not.toHaveBeenCalled()
    expect(onConnected).not.toHaveBeenCalled()
    expect((await screen.findByRole('alert')).textContent).toBe('Permission to read that site was denied, so nothing was connected.')
  })

  it('a required-empty field shows an alert and never queues a permission request', async () => {
    const { validate, onConnected } = await renderForm()
    // Only fill the username; leave the token field blank.
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'octocat' } })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Connect' }))
    })

    expect(request).not.toHaveBeenCalled()
    expect(validate).not.toHaveBeenCalled()
    expect(onConnected).not.toHaveBeenCalled()
    expect((await screen.findByRole('alert')).textContent).toBe('Personal access token is required.')
  })

  it('originsFor returning no origins shows an alert and never queues a permission request', async () => {
    const { validate, onConnected } = await renderForm({ originsFor: vi.fn(() => []) })
    fillFields()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Connect' }))
    })

    expect(request).not.toHaveBeenCalled()
    expect(validate).not.toHaveBeenCalled()
    expect(onConnected).not.toHaveBeenCalled()
    expect((await screen.findByRole('alert')).textContent).toBe('Could not determine which site to connect to.')
  })

  it('preserves a connector-specific originsFor error without requesting permission', async () => {
    const { validate, onConnected } = await renderForm({
      originsFor: vi.fn(() => {
        throw new Error('Enter your site as yoursite.atlassian.net')
      }),
    })
    fillFields()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Connect' }))
    })

    expect(request).not.toHaveBeenCalled()
    expect(validate).not.toHaveBeenCalled()
    expect(onConnected).not.toHaveBeenCalled()
    expect((await screen.findByRole('alert')).textContent).toBe('Enter your site as yoursite.atlassian.net')
  })

  it('falls back to the generic origins alert for a messageless throw without requesting permission', async () => {
    const { validate, onConnected } = await renderForm({
      originsFor: vi.fn(() => {
        // eslint-disable-next-line @typescript-eslint/no-throw-literal
        throw 'not an Error instance'
      }),
    })
    fillFields()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Connect' }))
    })

    expect(request).not.toHaveBeenCalled()
    expect(validate).not.toHaveBeenCalled()
    expect(onConnected).not.toHaveBeenCalled()
    expect((await screen.findByRole('alert')).textContent).toBe('Could not determine which site to connect to.')
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

  it('labels every field and marks password fields autocomplete off', async () => {
    await renderForm()

    const token = screen.getByLabelText('Personal access token') as HTMLInputElement
    expect(token.type).toBe('password')
    expect(token.getAttribute('autocomplete')).toBe('off')
    expect(screen.getByLabelText('Username')).toBeTruthy()
  })

  it('uses a connector-supplied connect label', async () => {
    await renderForm({ connectLabel: 'Link account' })

    expect(screen.getByRole('button', { name: 'Link account' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Connect' })).toBeNull()
  })
})

describe('TokenConnectForm connected state', () => {
  it('replaces the form with Disconnect without repeating the card-shell identity', async () => {
    await renderForm({ connectedAs: 'octocat' })

    expect(screen.queryByText(/octocat/)).toBeNull()
    expect(screen.queryByLabelText('Personal access token')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Connect' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Disconnect' })).toBeTruthy()
  })

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

  it('keeps the connected branch visible and stops before release when lifecycle authority is unavailable', async () => {
    const origin = 'https://api.example.com/*'
    const reportPendingCleanup = vi.fn()
    await renderForm({
      connectedAs: 'octocat',
      reportPendingCleanup,
      onDisconnect: vi.fn(async () => ({
        candidates: [origin],
        transaction: { status: 'permission-unavailable' as const },
      })),
    })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }))
    })

    expect(remove).not.toHaveBeenCalled()
    expect(reportPendingCleanup).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Disconnect' })).toBeTruthy()
    expect((await screen.findByRole('alert')).textContent).toBe(
      "Couldn't disconnect because the saved connection could not be updated. Please try again.",
    )
  })

  it('keeps the connected branch visible and stops before release after a rejected authoritative owner write', async () => {
    const origin = 'https://api.example.com/*'
    await renderForm({
      connectedAs: 'octocat',
      onDisconnect: vi.fn(async () => ({
        candidates: [origin],
        transaction: {
          status: 'failed' as const,
          error: new Error('storage rejected'),
          preExisting: [] as string[],
          acquired: [] as string[],
          pendingCleanup: [] as string[],
        },
      })),
    })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }))
    })

    expect(remove).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Disconnect' })).toBeTruthy()
    expect((await screen.findByRole('alert')).textContent).toMatch(/could not be updated/i)
  })

  it('releases committed disconnect candidates through the shared form contract', async () => {
    const origin = 'https://api.example.com/*'
    grantExisting(origin)
    await renderForm({
      connectedAs: 'octocat',
      onDisconnect: vi.fn(async () => ({
        candidates: [origin],
        transaction: {
          status: 'committed' as const,
          value: undefined,
          preExisting: [] as string[],
          acquired: [] as string[],
        },
      })),
    })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }))
    })

    expect(remove).toHaveBeenCalledWith({ origins: [origin] })
    expect(held.has(origin)).toBe(false)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('does not render connected extras while the connect form is visible', async () => {
    await renderForm({ connectedAs: null, connectedExtras: <div data-testid="extras">Show on your board</div> })
    expect(screen.queryByTestId('extras')).toBeNull()
  })

  it('has no stray extras node when connected extras are omitted', async () => {
    await renderForm({ connectedAs: 'octocat' })
    expect(screen.queryByTestId('extras')).toBeNull()
    expect(screen.getByRole('button', { name: 'Disconnect' })).toBeTruthy()
  })
})

// Github and Vercel can both be rendered in one connector tab and both expose
// a `token` field. useId must keep their labels and controls instance-local.
describe('TokenConnectForm per-instance ids', () => {
  function renderTwo() {
    const makeProps = () => ({
      fields: FIELDS,
      originsFor: vi.fn(() => []),
      validate: vi.fn(async () => ({ ok: false as const, message: 'x' })),
      onConnected: vi.fn(async () => {}),
      connectedAs: null,
      onDisconnect: vi.fn(async () => ({
        candidates: [] as string[],
        transaction: {
          status: 'committed' as const,
          value: undefined,
          preExisting: [] as string[],
          acquired: [] as string[],
        },
      })),
      storage: createStorage(memoryDriver()),
      reportPendingCleanup: vi.fn(),
    })
    return render(
      <>
        <TokenConnectForm {...makeProps()} />
        <TokenConnectForm {...makeProps()} />
      </>,
    )
  }

  it('generates no duplicate DOM ids when two instances share the token field id', () => {
    const { container } = renderTwo()
    const ids = Array.from(container.querySelectorAll('[id]')).map((el) => el.id)

    expect(ids.length).toBeGreaterThan(0)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('keeps each label associated with its own instance input', () => {
    renderTwo()
    const labels = screen.getAllByText('Personal access token').filter((el) => el.tagName === 'LABEL') as HTMLLabelElement[]
    const inputs = screen.getAllByPlaceholderText('ghp_...')
    expect(labels).toHaveLength(2)
    expect(inputs).toHaveLength(2)
    expect(inputs[0]!.id).not.toBe(inputs[1]!.id)
    expect(labels[0]!.control).toBe(inputs[0])
    expect(labels[1]!.control).toBe(inputs[1])

    inputs[1]!.focus()
    expect(document.activeElement).toBe(inputs[1])
    inputs[0]!.focus()
    expect(document.activeElement).toBe(inputs[0])
  })
})
