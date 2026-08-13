// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
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
import HomeAssistantWidget, { chipCopy, remountKey } from './HomeAssistantWidget'

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
  it('selection B wins when pending selection A resolves after B', async () => {
    const selectedA: HomeAssistantConfig = {
      ...CONNECTED,
      entities: [PICKED[0]],
      actions: [],
    }
    const selectedB: HomeAssistantConfig = {
      ...CONNECTED,
      entities: [PICKED[1]],
      actions: [],
    }
    let resolveA!: (value: HomeAssistantData) => void
    let resolveB!: (value: HomeAssistantData) => void
    vi.mocked(fetchHomeAssistant)
      .mockReturnValueOnce(new Promise((resolve) => (resolveA = resolve)))
      .mockReturnValueOnce(new Promise((resolve) => (resolveB = resolve)))
    const storage = await seededStorage(selectedA, null)
    mount(storage)
    await waitFor(() => expect(fetchHomeAssistant).toHaveBeenCalledTimes(1))

    await act(async () => {
      await storage.set('connectors', { homeassistant: selectedB })
    })
    await waitFor(() => expect(fetchHomeAssistant).toHaveBeenCalledTimes(2))

    await act(async () => {
      resolveB({ entities: [PORCH] })
      await Promise.resolve()
      await Promise.resolve()
      resolveA({ entities: [KITCHEN] })
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(screen.queryByText('Kitchen 21.5°C')).toBeNull()
    expect(screen.getByText('Porch light on')).toBeTruthy()
    const stored = (await storage.get('connectorSnapshots')).homeassistant
    expect(stored?.scope).toBe(await connectorSnapshotScope('homeassistant', selectedB))
    expect(stored?.data).toEqual({ entities: [PORCH] })
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

  it('press calls callHaService with the picked action, instanceUrl and token, and immediately flashes the pressed tint', async () => {
    let resolvePress!: (ok: boolean) => void
    vi.mocked(callHaService).mockReturnValue(
      new Promise((resolve) => {
        resolvePress = resolve
      }),
    )
    const storage = await seededStorage(CONNECTED)
    mount(storage)
    const button = await screen.findByRole('button', { name: 'Run Movie night' })

    fireEvent.click(button)
    // Synchronous, before the awaited callHaService promise ever resolves.
    expect(button.className).toContain('scale-95')
    expect(button.className).toContain('brightness-125')
    expect(callHaService).toHaveBeenCalledWith('https://ha.example.com', 'tok', ACTIONS[0])

    await act(async () => {
      resolvePress(true)
    })
    expect(button.className).not.toContain('scale-95')
    expect(button.className).not.toContain('text-red-400')
  })

  // Fake timers block testing-library's setTimeout-polled findBy/waitFor
  // (LocationSetup.test.tsx's own documented caveat) — scoped to just this
  // describe block so every OTHER test above keeps using real-timer
  // findBy/screen queries unaffected. Every assertion below reads the DOM
  // synchronously right after an awaited `act` + `advanceTimersByTimeAsync`.
  describe('with fake timers', () => {
    afterEach(() => vi.useRealTimers())

    it('a failed press applies the error tint, which auto-clears back to idle after exactly 1200ms', async () => {
      vi.mocked(callHaService).mockResolvedValue(false)
      const storage = await seededStorage(CONNECTED)
      mount(storage)
      const button = await screen.findByRole('button', { name: 'Run Movie night' })
      vi.useFakeTimers()

      await act(async () => {
        fireEvent.click(button)
        await vi.advanceTimersByTimeAsync(0) // let the awaited callHaService promise settle
      })
      expect(button.className).toContain('text-red-400')

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1199)
      })
      expect(button.className).toContain('text-red-400') // still one ms short

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1)
      })
      expect(button.className).not.toContain('text-red-400')
      expect(button.className).toContain('text-fg') // back to the idle tint
    })

    it('clears any pending error-clear timeout on unmount (no stale setState-after-unmount)', async () => {
      vi.mocked(callHaService).mockResolvedValue(false)
      const storage = await seededStorage(CONNECTED)
      const { unmount } = mount(storage)
      const button = await screen.findByRole('button', { name: 'Run Movie night' })
      vi.useFakeTimers()

      await act(async () => {
        fireEvent.click(button)
        await vi.advanceTimersByTimeAsync(0)
      })
      expect(button.className).toContain('text-red-400')

      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      unmount()
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1200) // the pending clearTimeout must have fired; nothing left to run
      })
      expect(errorSpy).not.toHaveBeenCalled()
      errorSpy.mockRestore()
    })
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
