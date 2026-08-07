// @vitest-environment jsdom
// TokenConnectForm.test.tsx — dedicated test file for the one card body every
// token connector (Tasks 48-51) renders. Mocks ../../services/permissions the
// same way SettingsPanel.test.tsx does for the RSS body: only ensureOrigin is
// mocked, everything else stays real (nothing else here needs it, but the
// import shape matches the house idiom).
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'

vi.mock('../../services/permissions', async (importActual) => {
  const actual = await importActual<typeof import('../../services/permissions')>()
  return { ...actual, ensureOrigin: vi.fn() }
})
import { ensureOrigin } from '../../services/permissions'
import { TokenConnectForm, type TokenField } from './TokenConnectForm'

const FIELDS: TokenField[] = [
  { id: 'token', label: 'Personal access token', type: 'password', placeholder: 'ghp_...' },
  { id: 'username', label: 'Username', type: 'text', placeholder: 'octocat' },
]

// Every test's spies push into this array so happy-path ordering can be
// asserted directly (ensureOrigin before validate before onConnected),
// rather than relying on vi.fn mock.invocationCallOrder across three
// independently-created mocks.
let calls: string[]

beforeEach(() => {
  calls = []
  vi.mocked(ensureOrigin).mockReset()
})

function renderForm(overrides: Partial<Parameters<typeof TokenConnectForm>[0]> = {}) {
  const originsFor = vi.fn((_values: Record<string, string>) => ['https://api.example.com/*'])
  const validate = vi.fn(async (_values: Record<string, string>) => {
    calls.push('validate')
    return { ok: true as const, identity: 'octocat' }
  })
  const onConnected = vi.fn(async (_values: Record<string, string>, _identity: string) => {
    calls.push('onConnected')
  })
  const onDisconnect = vi.fn(async () => {})

  const props = {
    fields: FIELDS,
    originsFor,
    validate,
    onConnected,
    connectedAs: null,
    onDisconnect,
    ...overrides,
  }
  render(<TokenConnectForm {...props} />)
  return { originsFor, validate, onConnected, onDisconnect }
}

function fillFields() {
  fireEvent.change(screen.getByLabelText('Personal access token'), { target: { value: 'secret-token' } })
  fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'octocat' } })
}

describe('TokenConnectForm — connect gesture', () => {
  it('happy path: ensureOrigin runs before validate, which runs before onConnected', async () => {
    vi.mocked(ensureOrigin).mockImplementation(async (_url: string) => {
      calls.push('ensureOrigin')
      return true
    })
    const { validate, onConnected } = renderForm()
    fillFields()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Connect' }))
    })

    expect(calls).toEqual(['ensureOrigin', 'validate', 'onConnected'])
    expect(ensureOrigin).toHaveBeenCalledWith('https://api.example.com/*')
    expect(validate).toHaveBeenCalledWith({ token: 'secret-token', username: 'octocat' })
    expect(onConnected).toHaveBeenCalledWith({ token: 'secret-token', username: 'octocat' }, 'octocat')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('a denied origin grant shows an alert and calls neither validate nor onConnected', async () => {
    vi.mocked(ensureOrigin).mockResolvedValue(false)
    const { validate, onConnected } = renderForm()
    fillFields()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Connect' }))
    })

    expect(ensureOrigin).toHaveBeenCalledOnce()
    expect(validate).not.toHaveBeenCalled()
    expect(onConnected).not.toHaveBeenCalled()
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBeTruthy()
  })

  it('a validate() failure shows an alert and never calls onConnected', async () => {
    vi.mocked(ensureOrigin).mockResolvedValue(true)
    const { onConnected } = renderForm({
      validate: vi.fn(async () => ({ ok: false as const, message: 'Bad token' })),
    })
    fillFields()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Connect' }))
    })

    expect(onConnected).not.toHaveBeenCalled()
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBe('Bad token')
  })

  it('a required-empty field shows an alert and never calls ensureOrigin', async () => {
    renderForm()
    // Only fill the username; leave the token field blank.
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'octocat' } })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Connect' }))
    })

    expect(ensureOrigin).not.toHaveBeenCalled()
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBeTruthy()
  })

  it('originsFor() returning [] shows an alert and never calls ensureOrigin', async () => {
    renderForm({ originsFor: vi.fn(() => []) })
    fillFields()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Connect' }))
    })

    expect(ensureOrigin).not.toHaveBeenCalled()
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBeTruthy()
  })

  it('originsFor() throwing shows an alert and never calls ensureOrigin', async () => {
    renderForm({
      originsFor: vi.fn(() => {
        throw new Error('cannot derive an origin')
      }),
    })
    fillFields()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Connect' }))
    })

    expect(ensureOrigin).not.toHaveBeenCalled()
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBeTruthy()
  })

  it('every field input is labelled', () => {
    renderForm()
    expect(screen.getByLabelText('Personal access token')).toBeTruthy()
    expect(screen.getByLabelText('Username')).toBeTruthy()
  })

  it('a password field gets autocomplete="off"', () => {
    renderForm()
    const tokenInput = screen.getByLabelText('Personal access token') as HTMLInputElement
    expect(tokenInput.type).toBe('password')
    expect(tokenInput.getAttribute('autocomplete')).toBe('off')
  })

  it('connectLabel overrides the default "Connect" button text', () => {
    renderForm({ connectLabel: 'Link account' })
    expect(screen.getByRole('button', { name: 'Link account' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Connect' })).toBeNull()
  })
})

describe('TokenConnectForm — connected state', () => {
  it('connectedAs set replaces the form with a connected row + Disconnect button', () => {
    renderForm({ connectedAs: 'octocat' })

    expect(screen.getByText(/octocat/)).toBeTruthy()
    expect(screen.queryByLabelText('Personal access token')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Connect' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Disconnect' })).toBeTruthy()
  })

  it('clicking Disconnect calls onDisconnect', async () => {
    const { onDisconnect } = renderForm({ connectedAs: 'octocat' })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }))
    })

    expect(onDisconnect).toHaveBeenCalledOnce()
  })
})
