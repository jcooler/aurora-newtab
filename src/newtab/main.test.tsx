// @vitest-environment jsdom
import { waitFor } from '@testing-library/react'
import { act } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const secrets = Object.freeze({
  token: 'ghp_AURORA_ROOT_CAUGHT_TOKEN_7412',
  capabilityUrl: 'https://calendar.example/private.ics?token=AURORA_ROOT_CAPABILITY_8841',
  payload: 'AURORA_ROOT_RAW_PAYLOAD_6519',
})

const safeDiagnostics = Object.freeze({
  caught: '[aurora] widget render failure:',
  uncaught: '[aurora] uncaught root render failure',
  recoverable: '[aurora] recoverable root render failure',
})

type RootFailureMode = 'caught' | 'uncaught' | 'recoverable'

vi.mock('../lib/storage/index', () => ({
  createStorage: () => ({
    init: vi.fn().mockResolvedValue(undefined),
    update: vi.fn(),
  }),
}))

vi.mock('../lib/storage/chrome', () => ({
  chromeDriver: () => ({
    read: vi.fn(),
    write: vi.fn(),
    onChanged: vi.fn(),
  }),
}))

vi.mock('../lib/storage/context', async () => {
  const React = await import('react')
  return {
    StorageProvider: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children),
  }
})

vi.mock('../lib/storage/authority', () => ({
  createWebLockStorageAuthority: () => ({}),
}))

vi.mock('../account/AccountContext', async () => {
  const React = await import('react')
  return {
    AccountProvider: ({ children }: { children: React.ReactNode }) => React.createElement(
      'div',
      { 'data-account-provider': '' },
      children,
    ),
  }
})

vi.mock('../sync/SyncProvider', async () => {
  const React = await import('react')
  return {
    SyncProvider: ({ children }: { children: React.ReactNode }) => React.createElement(
      React.Fragment,
      null,
      children,
    ),
  }
})

vi.mock('../services/permissionMirror', () => ({
  initializePermissionMirror: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../metrics/MetricsProvider', async () => {
  const React = await import('react')
  return {
    MetricsProvider: ({ children }: { children: React.ReactNode }) => React.createElement(
      'div',
      { 'data-metrics-provider': '' },
      children,
    ),
  }
})

vi.mock('../providers/GoogleCalendarProvider', async () => {
  const React = await import('react')
  return {
    GoogleCalendarProvider: ({ children }: { children: React.ReactNode }) => React.createElement(
      React.Fragment,
      null,
      children,
    ),
  }
})

vi.mock('./App', async () => {
  const React = await import('react')
  const { default: WidgetBoundary } = await import('./components/WidgetBoundary')

  function ThrowSecret(): never {
    const error = new Error(`${secrets.token} ${secrets.capabilityUrl}`)
    Object.assign(error, { payload: { raw: secrets.payload } })
    throw error
  }

  let recoverableAttempt = 0

  function RecoverAfterRetry() {
    recoverableAttempt += 1
    if (recoverableAttempt === 1) ThrowSecret()
    return React.createElement('p', null, 'Recovered root content')
  }

  return {
    default: () => {
      const mode = (globalThis as typeof globalThis & { __auroraRootFailureMode?: RootFailureMode }).__auroraRootFailureMode
      if (mode === 'uncaught') return React.createElement(ThrowSecret)
      if (mode === 'recoverable') return React.createElement(RecoverAfterRetry)
      return React.createElement(
            'section',
            null,
            React.createElement(
              WidgetBoundary,
              { name: 'Calendar', children: React.createElement(ThrowSecret) },
            ),
            React.createElement('p', null, 'Calendar sibling survives'),
          )
    },
  }
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.resetModules()
  delete (globalThis as typeof globalThis & { __auroraRootFailureMode?: RootFailureMode }).__auroraRootFailureMode
  document.body.replaceChildren()
})

function serializeConsoleValue(value: unknown): string {
  if (typeof value === 'string') return value
  if (value instanceof Error) {
    return `${value.name}:${value.message}:${serializeConsoleValue((value as Error & { payload?: unknown }).payload)}`
  }
  try {
    return JSON.stringify(value)
  } catch {
    return '[unserializable]'
  }
}

describe('new-tab React root caught-error handling', () => {
  it('contains a caught widget failure without React logging its raw error, message, URL, or payload', async () => {
    document.body.innerHTML = '<div id="root"></div>'
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    await act(async () => {
      await import('./main')
    })

    await waitFor(() => {
      expect(document.querySelector('[role="alert"][aria-label="Calendar unavailable"]')).toBeTruthy()
      expect(document.body.textContent).toContain('Calendar sibling survives')
      expect(document.querySelector('[data-account-provider]')).toBeTruthy()
      expect(document.querySelector('[data-metrics-provider]')).toBeTruthy()
    })

    const safeCalls = consoleError.mock.calls.filter((call) => (
      call[0] === safeDiagnostics.caught && call[1] === 'Calendar'
    ))
    expect(safeCalls).toHaveLength(1)

    const serialized = consoleError.mock.calls.flat().map(serializeConsoleValue).join('\n')
    expect(serialized).not.toContain(secrets.token)
    expect(serialized).not.toContain(secrets.capabilityUrl)
    expect(serialized).not.toContain(secrets.payload)
    expect(consoleError.mock.calls.flat().some((value) => value instanceof Error)).toBe(false)
    expect(document.body.textContent).not.toContain(secrets.token)
    expect(document.body.textContent).not.toContain(secrets.capabilityUrl)
    expect(document.body.textContent).not.toContain(secrets.payload)
  })

  it('reports an uncaught root failure with one fixed-safe diagnostic and no raw console or global-event data', async () => {
    document.body.innerHTML = '<div id="root"></div>'
    ;(globalThis as typeof globalThis & { __auroraRootFailureMode?: RootFailureMode }).__auroraRootFailureMode = 'uncaught'
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const globalReports: unknown[] = []
    const onError = (event: ErrorEvent) => globalReports.push(event.error, event.message, event.filename)
    const onUnhandledRejection = (event: PromiseRejectionEvent) => globalReports.push(event.reason)
    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onUnhandledRejection)

    try {
      await import('./main')
      await waitFor(() => {
        expect(consoleError.mock.calls.filter((call) => call.length === 1 && call[0] === safeDiagnostics.uncaught)).toHaveLength(1)
      })
    } finally {
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onUnhandledRejection)
    }

    expect(consoleError.mock.calls.some((call) => call[0] === safeDiagnostics.caught)).toBe(false)
    const serialized = [...consoleError.mock.calls.flat(), ...consoleWarn.mock.calls.flat(), ...globalReports]
      .map(serializeConsoleValue)
      .join('\n')
    expect(serialized).not.toContain(secrets.token)
    expect(serialized).not.toContain(secrets.capabilityUrl)
    expect(serialized).not.toContain(secrets.payload)
    expect([...consoleError.mock.calls.flat(), ...consoleWarn.mock.calls.flat(), ...globalReports]
      .some((value) => value instanceof Error)).toBe(false)
    expect(document.getElementById('root')?.textContent).toBe('')
  })

  it('reports a recovered root render with one fixed-safe diagnostic and no raw data', async () => {
    document.body.innerHTML = '<div id="root"></div>'
    ;(globalThis as typeof globalThis & { __auroraRootFailureMode?: RootFailureMode }).__auroraRootFailureMode = 'recoverable'
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await act(async () => {
      await import('./main')
    })

    await waitFor(() => {
      expect(document.body.textContent).toContain('Recovered root content')
    })
    expect(consoleError.mock.calls.filter((call) => call.length === 1 && call[0] === safeDiagnostics.recoverable)).toHaveLength(1)
    const serialized = [...consoleError.mock.calls.flat(), ...consoleWarn.mock.calls.flat()]
      .map(serializeConsoleValue)
      .join('\n')
    expect(serialized).not.toContain(secrets.token)
    expect(serialized).not.toContain(secrets.capabilityUrl)
    expect(serialized).not.toContain(secrets.payload)
    expect([...consoleError.mock.calls.flat(), ...consoleWarn.mock.calls.flat()]
      .some((value) => value instanceof Error)).toBe(false)
  })
})
