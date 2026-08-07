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

  // Review fix (round 1, Task 50): originsFor throwing an Error with a
  // message used to be discarded entirely — the catch below only ever set
  // origins to [], and the alert always showed the generic fallback text,
  // no matter what originsFor's own thrown message said. That silently
  // swallowed connector-specific guidance (e.g. jira.ts's
  // normalizeJiraSite naming the exact site format it expects). The thrown
  // message is now captured and preferred when present.
  it('originsFor() throwing an Error with a message shows THAT message, never calls ensureOrigin', async () => {
    renderForm({
      originsFor: vi.fn(() => {
        throw new Error('Enter your site as yoursite.atlassian.net')
      }),
    })
    fillFields()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Connect' }))
    })

    expect(ensureOrigin).not.toHaveBeenCalled()
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBe('Enter your site as yoursite.atlassian.net')
  })

  it('originsFor() throwing a messageless value falls back to the generic alert, never calls ensureOrigin', async () => {
    renderForm({
      originsFor: vi.fn(() => {
        // eslint-disable-next-line @typescript-eslint/no-throw-literal
        throw 'not an Error instance'
      }),
    })
    fillFields()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Connect' }))
    })

    expect(ensureOrigin).not.toHaveBeenCalled()
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBe('Could not determine which site to connect to.')
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
  it('connectedAs set replaces the form with just a Disconnect button — the identity is shown by the card shell, not repeated here', () => {
    renderForm({ connectedAs: 'octocat' })

    // `connectedAs` still SELECTS the connected branch, but the identity is NOT
    // displayed here: the card shell's authState chip (Connectors.tsx) is the
    // single source of "Connected as X". Repeating it in the form was redundant.
    expect(screen.queryByText(/octocat/)).toBeNull()
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

// Review fix (round 1): ids used to be static (`token-connect-${field.id}`,
// hardcoded `token-connect-error`). GithubConfig and VercelConfig both
// declare a `token` field, so two token-connector cards mounted on the same
// Connectors tab at once — an ordinary state, not an edge case — used to
// collide on id="token-connect-token" and id="token-connect-error", breaking
// label association and aria-describedby for screen readers. useId()
// prefixes every generated id per mounted instance; this block is the
// falsifying case for the old bug.
describe('TokenConnectForm — two instances mounted at once (per-instance ids)', () => {
  function renderTwo() {
    const makeProps = () => ({
      fields: FIELDS,
      originsFor: vi.fn(() => []),
      validate: vi.fn(async () => ({ ok: false as const, message: 'x' })),
      onConnected: vi.fn(async () => {}),
      connectedAs: null,
      onDisconnect: vi.fn(async () => {}),
    })
    return render(
      <>
        <TokenConnectForm {...makeProps()} />
        <TokenConnectForm {...makeProps()} />
      </>,
    )
  }

  it('generates no duplicate DOM ids, even though both instances share a field id ("token")', () => {
    const { container } = renderTwo()
    const ids = Array.from(container.querySelectorAll('[id]')).map((el) => el.id)
    // Sanity: there ARE ids to check (both the per-field input ids and, once
    // an error is present, the alert id) — an empty list would make the
    // uniqueness assertion below vacuously true.
    expect(ids.length).toBeGreaterThan(0)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it("each label resolves to (and would focus) its OWN instance's input, never the other instance's", () => {
    renderTwo()
    const labels = screen.getAllByText('Personal access token').filter((el) => el.tagName === 'LABEL') as HTMLLabelElement[]
    const inputs = screen.getAllByPlaceholderText('ghp_...')
    expect(labels).toHaveLength(2)
    expect(inputs).toHaveLength(2)
    expect(inputs[0]!.id).not.toBe(inputs[1]!.id)

    // `label.control` is the browser-native resolution of a label's target
    // control (per the labeled-control algorithm: look up `for`'s value with
    // getElementById, the SAME lookup a real click-to-focus relies on and
    // the exact mechanism duplicate ids would break — getElementById always
    // returns the FIRST matching id in document order, so with the old
    // static ids labels[1].control would have resolved to inputs[0], not
    // inputs[1]). Asserted via `.control` rather than a simulated click
    // because jsdom implements label->control resolution but does not
    // forward a synthetic label click into focusing a text input.
    expect(labels[0]!.control).toBe(inputs[0])
    expect(labels[1]!.control).toBe(inputs[1])

    // And the real focus path still works end-to-end for each instance.
    inputs[1]!.focus()
    expect(document.activeElement).toBe(inputs[1])
    inputs[0]!.focus()
    expect(document.activeElement).toBe(inputs[0])
  })
})
