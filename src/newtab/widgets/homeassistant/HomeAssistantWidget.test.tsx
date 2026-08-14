// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { StrictMode } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createStorage, type AuroraStorage } from '../../../lib/storage/index'
import { memoryDriver } from '../../../lib/storage/driver'
import { StorageProvider } from '../../../lib/storage/context'
import { __resetInFlight } from '../../../lib/hooks/useConnectorSnapshot'
import type {
  HaAction,
  HaEntityRef,
  HaState,
  HomeAssistantConfig,
  HomeAssistantData,
} from '../../../services/connectors/homeassistant'

// Same treatment SettingsPanel.test.tsx already gives this module: mock ONLY
// callHaService (the one real-network call a button press makes), keep
// everything else (fetchHomeAssistant, haEntitiesOf, haActionsOf,
// homeassistantDescriptor) real via importActual — the widget's own gate and
// snapshot plumbing exercise their real read-time boundaries.
vi.mock('../../../services/connectors/homeassistant', async (importActual) => {
  const actual = await importActual<typeof import('../../../services/connectors/homeassistant')>()
  return {
    ...actual,
    callHaService: vi.fn(),
    fetchHomeAssistant: vi.fn(actual.fetchHomeAssistant),
  }
})
import { callHaService, fetchHomeAssistant } from '../../../services/connectors/homeassistant'
import { connectorSnapshotScope } from '../../../services/connectors/snapshotIdentity'
import HomeAssistantWidget, { ActionButton, chipCopy, remountKey } from './HomeAssistantWidget'

beforeAll(() => {
  const digest = vi.fn(async (_algorithm: AlgorithmIdentifier, source: BufferSource) => {
    const bytes =
      source instanceof ArrayBuffer
        ? new Uint8Array(source)
        : new Uint8Array(source.buffer, source.byteOffset, source.byteLength)
    const output = new Uint8Array(32)
    bytes.forEach((byte, index) => {
      const slot = index % output.length
      output[slot] = ((output[slot] ?? 0) * 33 + byte + index) & 0xff
    })
    return output.buffer
  })
  Object.defineProperty(globalThis.crypto, 'subtle', {
    configurable: true,
    value: { digest },
  })
})

// The snapshot hook's in-flight dedupe map is module-level and survives
// across cases — same discipline as every other connector widget test
// (StatusWidget.test.tsx's own idiom).
beforeEach(() => {
  __resetInFlight()
  vi.mocked(fetchHomeAssistant).mockReset()
})
afterEach(() => __resetInFlight())

// Kitchen/Porch — the SAME fixtures homeassistant.test.ts's own parseStates
// suite proves against the real HA response shape (unit present vs. null),
// so this file's "exact copy" assertions aren't a fresh, unverified guess.
const KITCHEN: HaState = { id: 'sensor.kitchen_temp', state: '21.5', unit: '°C', friendlyName: 'Kitchen', domain: 'sensor' }
const PORCH: HaState = { id: 'light.porch', state: 'on', unit: null, friendlyName: 'Porch light', domain: 'light' }

const PICKED: HaEntityRef[] = [
  { id: 'sensor.kitchen_temp', name: 'Kitchen' },
  { id: 'light.porch', name: 'Porch light' },
]
const ACTIONS: HaAction[] = [{ id: 'scene.movie', name: 'Movie night', domain: 'scene' }]
const EVENING_ACTION: HaAction = { id: 'script.evening', name: 'Evening routine', domain: 'script' }

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((next) => {
    resolve = next
  })
  return { promise, resolve }
}

const CONNECTED: HomeAssistantConfig = {
  enabled: true,
  instanceUrl: 'https://ha.example.com',
  token: 'tok',
  entities: PICKED,
  actions: ACTIONS,
}

/** Storage seeded with a CONNECTED homeassistant connector and a FRESH
 *  snapshot (fetchedAt now) so useConnectorSnapshot treats it as fresh and
 *  never calls the real fetchHomeAssistant — the widget renders straight
 *  from cache, no network. Same idiom as GitlabWidget.test.tsx's own
 *  seededStorage. `data: null` means "no snapshot key at all" (the
 *  first-ever-load case), matching StatusWidget.test.tsx's own convention —
 *  distinct from `{ entities: null }`, a snapshot that DOES exist but
 *  records a failed poll (ruling 2). */
async function seededStorage(
  config: HomeAssistantConfig,
  data: HomeAssistantData | null = { entities: [KITCHEN, PORCH] },
): Promise<AuroraStorage> {
  const storage = createStorage(memoryDriver())
  await storage.init()
  await storage.set('connectors', { homeassistant: config })
  if (data) {
    await storage.set('connectorSnapshots', {
      homeassistant: {
        scope: await connectorSnapshotScope('homeassistant', config),
        fetchedAt: Date.now(),
        data,
      },
    })
  }
  return storage
}

function mount(storage: AuroraStorage) {
  return render(
    <StorageProvider storage={storage}>
      <HomeAssistantWidget />
    </StorageProvider>,
  )
}

describe('HomeAssistantWidget — gate (zero-hooks-in-the-gate, no-husk law)', () => {
  it('renders nothing — and never runs the snapshot refresh — when the connector is disabled', async () => {
    const storage = await seededStorage({ ...CONNECTED, enabled: false }, null)
    const { container } = mount(storage)
    await act(async () => {})

    expect(container.firstChild).toBeNull()
    expect((await storage.get('connectorSnapshots')).homeassistant).toBeUndefined()
  })

  it('renders nothing when connected but the config predates a real connect (no instanceUrl/token yet)', async () => {
    const storage = await seededStorage({ enabled: true, entities: PICKED, actions: ACTIONS }, null)
    const { container } = mount(storage)
    await act(async () => {})

    expect(container.firstChild).toBeNull()
    expect((await storage.get('connectorSnapshots')).homeassistant).toBeUndefined()
  })

  it('renders nothing when connected but nothing was ever picked (empty entities AND empty actions)', async () => {
    const storage = await seededStorage(
      { enabled: true, instanceUrl: 'https://ha.example.com', token: 'tok', entities: [], actions: [] },
      null,
    )
    const { container } = mount(storage)
    await act(async () => {})

    expect(container.firstChild).toBeNull()
    expect((await storage.get('connectorSnapshots')).homeassistant).toBeUndefined()
  })

  it('survives a hand-edited backup restoring { enabled: true } with no other fields — renders nothing, never throws', async () => {
    const storage = createStorage(memoryDriver())
    await storage.init()
    await storage.set('connectors', { homeassistant: { enabled: true } as never })
    const { container } = mount(storage)
    await act(async () => {})

    expect(container.firstChild).toBeNull()
    expect((await storage.get('connectorSnapshots')).homeassistant).toBeUndefined()
  })

  it('positive twin: connected with entities picked renders the section (not null)', async () => {
    const storage = await seededStorage(CONNECTED)
    mount(storage)
    const section = await screen.findByRole('region', { name: 'Home Assistant' })
    expect(section).toBeTruthy()
  })

  it('renders when only actions are picked, with no entities at all', async () => {
    const storage = await seededStorage({ ...CONNECTED, entities: [] }, { entities: [] })
    mount(storage)
    const section = await screen.findByRole('region', { name: 'Home Assistant' })
    expect(section).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Run Movie night' })).toBeTruthy()
    expect(section.querySelectorAll('li').length).toBe(0)
  })

  it('an action-only config stays absent while health is pending, then appears after an authenticated empty result', async () => {
    const health = deferred<HomeAssistantData>()
    vi.mocked(fetchHomeAssistant).mockReturnValue(health.promise)
    const storage = await seededStorage({ ...CONNECTED, entities: [] }, null)
    const { container } = mount(storage)

    await waitFor(() => expect(fetchHomeAssistant).toHaveBeenCalledTimes(1))
    expect(container.firstChild).toBeNull()

    await act(async () => {
      health.resolve({ entities: [] })
    })

    expect(await screen.findByRole('button', { name: 'Run Movie night' })).toBeTruthy()
  })

  it('an action-only config stays absent when its pending health refresh reports failure', async () => {
    const health = deferred<HomeAssistantData>()
    vi.mocked(fetchHomeAssistant).mockReturnValue(health.promise)
    const storage = await seededStorage({ ...CONNECTED, entities: [] }, null)
    const { container } = mount(storage)

    await waitFor(() => expect(fetchHomeAssistant).toHaveBeenCalledTimes(1))
    expect(container.firstChild).toBeNull()

    await act(async () => {
      health.resolve({ entities: null })
    })

    expect(container.firstChild).toBeNull()
    expect(screen.queryByRole('button', { name: 'Run Movie night' })).toBeNull()
  })
})

describe('HomeAssistantWidget — chip copy', () => {
  it('renders "Kitchen 21.5°C" (unit rides with no space) and "Porch light on" (unit omitted) exactly', async () => {
    const storage = await seededStorage(CONNECTED, { entities: [KITCHEN, PORCH] })
    mount(storage)

    expect(await screen.findByText('Kitchen 21.5°C')).toBeTruthy()
    expect(screen.getByText('Porch light on')).toBeTruthy()
  })

  it('chips render as <ul> of <li> pills inside the section', async () => {
    const storage = await seededStorage(CONNECTED, { entities: [KITCHEN, PORCH] })
    mount(storage)
    const section = await screen.findByRole('region', { name: 'Home Assistant' })

    const list = section.querySelector('ul')!
    expect(list).toBeTruthy()
    expect(list.querySelectorAll('li').length).toBe(2)
  })

  it('chipCopy: exact pure-function contract', () => {
    expect(chipCopy(KITCHEN)).toBe('Kitchen 21.5°C')
    expect(chipCopy(PORCH)).toBe('Porch light on')
  })
})

describe('HomeAssistantWidget — anti-staleness, all-or-nothing (plan-pinned ruling 2)', () => {
  it('identical selected entities/actions still hide A data while config B is pending, and B wins a later A completion', async () => {
    const configA: HomeAssistantConfig = {
      ...CONNECTED,
      entities: [PICKED[0]],
      snapshotEpoch: 'generation-a',
    }
    const configB: HomeAssistantConfig = {
      ...configA,
      instanceUrl: 'https://ha-b.example.com',
      token: 'tok-b',
      snapshotEpoch: 'generation-b',
    }
    const kitchenB: HaState = { ...KITCHEN, state: '22.0' }
    const refreshA = deferred<HomeAssistantData>()
    const refreshB = deferred<HomeAssistantData>()
    vi.mocked(fetchHomeAssistant)
      .mockReturnValueOnce(refreshA.promise)
      .mockReturnValueOnce(refreshB.promise)
    const storage = await seededStorage(configA, null)
    await storage.set('connectorSnapshots', {
      homeassistant: {
        scope: await connectorSnapshotScope('homeassistant', configA),
        fetchedAt: Date.now() - 61_000,
        data: { entities: [KITCHEN] },
      },
    })
    mount(storage)
    expect(await screen.findByText('Kitchen 21.5°C')).toBeTruthy()
    await waitFor(() => expect(fetchHomeAssistant).toHaveBeenCalledTimes(1))

    await act(async () => {
      await storage.set('connectors', { homeassistant: configB })
    })
    await waitFor(() => expect(screen.queryByText('Kitchen 21.5°C')).toBeNull())
    expect(screen.queryByRole('region', { name: 'Home Assistant' })).toBeNull()
    await waitFor(() => expect(fetchHomeAssistant).toHaveBeenCalledTimes(2))

    await act(async () => {
      refreshB.resolve({ entities: [kitchenB] })
      await Promise.resolve()
      await Promise.resolve()
      refreshA.resolve({ entities: [KITCHEN] })
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(screen.queryByText('Kitchen 21.5°C')).toBeNull()
    expect(screen.getByText('Kitchen 22.0°C')).toBeTruthy()
    const stored = (await storage.get('connectorSnapshots')).homeassistant
    expect(stored?.scope).toBe(await connectorSnapshotScope('homeassistant', configB))
    expect(stored?.data).toEqual({ entities: [kitchenB] })
  })

  it('a failed poll (entities: null) renders NOTHING — chips AND buttons both hide', async () => {
    const storage = await seededStorage(CONNECTED, { entities: null })
    const { container } = mount(storage)
    await act(async () => {})

    expect(container.firstChild).toBeNull()
    expect(screen.queryByRole('button', { name: 'Run Movie night' })).toBeNull()
  })

  it('an empty-but-successful poll (entities: []) still shows the action buttons — only the poll failing hides them', async () => {
    const storage = await seededStorage(CONNECTED, { entities: [] })
    mount(storage)
    expect(await screen.findByRole('button', { name: 'Run Movie night' })).toBeTruthy()
  })
})

describe('HomeAssistantWidget — DOM contract', () => {
  it('renders section[aria-label="Home Assistant"] at w-80', async () => {
    const storage = await seededStorage(CONNECTED)
    mount(storage)
    const section = await screen.findByRole('region', { name: 'Home Assistant' })
    expect(section.tagName).toBe('SECTION')
    expect(section.className).toContain('w-80')
  })

  it('renders <button aria-label="Run {name}"> with the name as the visible text', async () => {
    const storage = await seededStorage(CONNECTED)
    mount(storage)
    const button = await screen.findByRole('button', { name: 'Run Movie night' })
    expect(button.tagName).toBe('BUTTON')
    expect(button.textContent).toBe('Movie night')
  })
})

describe('HomeAssistantWidget — action buttons (press handling)', () => {
  beforeEach(() => {
    vi.mocked(callHaService).mockReset()
  })

  function renderActionButton(snapshotEpoch = 'generation-a', action = ACTIONS[0]) {
    return render(
      <ActionButton
        snapshotEpoch={snapshotEpoch}
        action={action}
        instanceUrl="https://ha.example.com"
        token="tok"
      />,
    )
  }

  it('an action button synchronously enters pending, disables and describes only itself, while its sibling stays enabled', () => {
    vi.mocked(callHaService).mockReturnValue(new Promise(() => {}))
    render(
      <>
        <ActionButton snapshotEpoch="generation-a" action={ACTIONS[0]} instanceUrl="https://ha.example.com" token="tok" />
        <ActionButton snapshotEpoch="generation-a" action={EVENING_ACTION} instanceUrl="https://ha.example.com" token="tok" />
      </>,
    )
    const movie = screen.getByRole('button', { name: 'Run Movie night' }) as HTMLButtonElement
    const evening = screen.getByRole('button', { name: 'Run Evening routine' }) as HTMLButtonElement

    fireEvent.click(movie)

    const running = screen.getByText('Running Movie night…')
    expect(movie.disabled).toBe(true)
    expect(movie.getAttribute('aria-busy')).toBe('true')
    expect(movie.getAttribute('aria-describedby')).toBe(running.id)
    expect(running.getAttribute('role')).toBe('status')
    expect(evening.disabled).toBe(false)
    expect(evening.getAttribute('aria-busy')).toBeNull()
    expect(screen.queryByText('Running Evening routine…')).toBeNull()
  })

  it('an action button rejects two programmatic clicks in one act turn through its synchronous local guard', () => {
    vi.mocked(callHaService).mockReturnValue(new Promise(() => {}))
    renderActionButton()
    const button = screen.getByRole('button', { name: 'Run Movie night' })

    act(() => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(callHaService).toHaveBeenCalledTimes(1)
  })

  it('an action button announces persistent success and clears it only when the next attempt begins', async () => {
    const first = deferred<boolean>()
    const second = deferred<boolean>()
    vi.mocked(callHaService).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    renderActionButton()
    const button = screen.getByRole('button', { name: 'Run Movie night' }) as HTMLButtonElement

    fireEvent.click(button)
    const feedbackId = screen.getByText('Running Movie night…').id
    await act(async () => {
      first.resolve(true)
    })

    const success = screen.getByRole('status')
    expect(success.textContent).toBe('Movie night completed.')
    expect(success.id).toBe(feedbackId)
    expect(button.disabled).toBe(false)
    expect(button.getAttribute('aria-busy')).toBeNull()
    expect(button.getAttribute('aria-describedby')).toBe(feedbackId)
    await act(async () => Promise.resolve())
    expect(screen.getByText('Movie night completed.')).toBeTruthy()

    fireEvent.click(button)
    expect(screen.queryByText('Movie night completed.')).toBeNull()
    expect(screen.getByText('Running Movie night…')).toBeTruthy()
    await act(async () => {
      second.resolve(true)
    })
  })

  it('an action button announces persistent failure, stays retryable, and replaces it with success after retry', async () => {
    vi.mocked(callHaService).mockResolvedValueOnce(false).mockResolvedValueOnce(true)
    renderActionButton()
    const button = screen.getByRole('button', { name: 'Run Movie night' }) as HTMLButtonElement

    await act(async () => {
      fireEvent.click(button)
    })
    const alert = screen.getByRole('alert')
    expect(alert.textContent).toBe("Couldn't run Movie night. Try again.")
    expect(button.disabled).toBe(false)
    expect(button.getAttribute('aria-busy')).toBeNull()
    expect(button.getAttribute('aria-describedby')).toBe(alert.id)
    await act(async () => Promise.resolve())
    expect(screen.getByRole('alert')).toBe(alert)

    await act(async () => {
      fireEvent.click(button)
    })
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByRole('status').textContent).toBe('Movie night completed.')
    expect(callHaService).toHaveBeenCalledTimes(2)
  })

  it('two production action buttons keep independent pending guards and feedback', async () => {
    const movieCall = deferred<boolean>()
    const eveningCall = deferred<boolean>()
    vi.mocked(callHaService).mockImplementation((_url, _token, action) =>
      action.id === ACTIONS[0].id ? movieCall.promise : eveningCall.promise,
    )
    render(
      <>
        <ActionButton snapshotEpoch="generation-a" action={ACTIONS[0]} instanceUrl="https://ha.example.com" token="tok" />
        <ActionButton snapshotEpoch="generation-a" action={EVENING_ACTION} instanceUrl="https://ha.example.com" token="tok" />
      </>,
    )
    const movie = screen.getByRole('button', { name: 'Run Movie night' }) as HTMLButtonElement
    const evening = screen.getByRole('button', { name: 'Run Evening routine' }) as HTMLButtonElement

    fireEvent.click(movie)
    fireEvent.click(evening)
    expect(callHaService).toHaveBeenCalledTimes(2)
    expect(callHaService).toHaveBeenCalledWith('https://ha.example.com', 'tok', ACTIONS[0])
    expect(callHaService).toHaveBeenCalledWith('https://ha.example.com', 'tok', EVENING_ACTION)
    expect(movie.disabled).toBe(true)
    expect(evening.disabled).toBe(true)

    await act(async () => {
      movieCall.resolve(true)
    })
    expect(screen.getByText('Movie night completed.')).toBeTruthy()
    expect(screen.getByText('Running Evening routine…')).toBeTruthy()
    expect(movie.disabled).toBe(false)
    expect(evening.disabled).toBe(true)

    await act(async () => {
      eveningCall.resolve(false)
    })
    expect(screen.getByText("Couldn't run Evening routine. Try again.")).toBeTruthy()
    expect(screen.getByText('Movie night completed.')).toBeTruthy()
  })

  it('an action button generation change prevents A from overwriting or releasing pending B', async () => {
    const callA = deferred<boolean>()
    const callB = deferred<boolean>()
    vi.mocked(callHaService).mockReturnValueOnce(callA.promise).mockReturnValueOnce(callB.promise)
    const { rerender } = renderActionButton('generation-a')
    const button = screen.getByRole('button', { name: 'Run Movie night' }) as HTMLButtonElement
    fireEvent.click(button)
    expect(screen.getByText('Running Movie night…')).toBeTruthy()

    rerender(
      <ActionButton
        snapshotEpoch="generation-b"
        action={ACTIONS[0]}
        instanceUrl="https://ha.example.com"
        token="tok"
      />,
    )
    expect(button.disabled).toBe(false)
    expect(screen.queryByText('Running Movie night…')).toBeNull()
    fireEvent.click(button)
    expect(button.disabled).toBe(true)

    await act(async () => {
      callA.resolve(false)
    })
    expect(button.disabled).toBe(true)
    expect(button.getAttribute('aria-busy')).toBe('true')
    expect(screen.getByText('Running Movie night…')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(callHaService).toHaveBeenCalledTimes(2)

    await act(async () => {
      callB.resolve(true)
    })
    expect(button.disabled).toBe(false)
    expect(screen.getByText('Movie night completed.')).toBeTruthy()
  })

  it('an action button under StrictMode remains mounted for a post-mount completion', async () => {
    const call = deferred<boolean>()
    vi.mocked(callHaService).mockReturnValue(call.promise)
    render(
      <StrictMode>
        <ActionButton snapshotEpoch="generation-a" action={ACTIONS[0]} instanceUrl="https://ha.example.com" token="tok" />
      </StrictMode>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Run Movie night' }))

    await act(async () => {
      call.resolve(true)
    })

    expect(screen.getByRole('status').textContent).toBe('Movie night completed.')
  })

  it('an action button unmounts cleanly while its service promise is pending', async () => {
    const call = deferred<boolean>()
    vi.mocked(callHaService).mockReturnValue(call.promise)
    const { unmount } = renderActionButton()
    fireEvent.click(screen.getByRole('button', { name: 'Run Movie night' }))

    unmount()
    await act(async () => {
      call.resolve(true)
    })

    expect(screen.queryByRole('button', { name: 'Run Movie night' })).toBeNull()
    expect(screen.queryByText('Movie night completed.')).toBeNull()
  })
})

describe('remountKey — pure function', () => {
  it('changes when the picked ENTITY list changes', () => {
    const a = remountKey([{ id: 'sensor.a', name: 'A' }], [])
    const b = remountKey([{ id: 'sensor.b', name: 'B' }], [])
    expect(a).not.toBe(b)
  })

  it('changes when the picked ACTION list changes', () => {
    const a = remountKey([], [{ id: 'scene.a', name: 'A', domain: 'scene' }])
    const b = remountKey([], [{ id: 'scene.b', name: 'B', domain: 'scene' }])
    expect(a).not.toBe(b)
  })

  it('is stable for the identical picks (referentially different arrays, same content)', () => {
    const a = remountKey([{ id: 'sensor.a', name: 'A' }], [{ id: 'scene.a', name: 'A', domain: 'scene' }])
    const b = remountKey([{ id: 'sensor.a', name: 'A' }], [{ id: 'scene.a', name: 'A', domain: 'scene' }])
    expect(a).toBe(b)
  })
})
