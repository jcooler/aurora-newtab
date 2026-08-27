// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { createStorage } from '../storage/index'
import { memoryDriver } from '../storage/driver'
import { StorageProvider } from '../storage/context'
import { useStoredKey } from './useStoredKey'
import { defaults } from '../storage/schema'

function Probe() {
  const [settings, save] = useStoredKey('settings')
  if (!settings) return <p>loading</p>
  return (
    <button onClick={() => save({ ...settings, name: 'Jon' })}>
      name:{settings.name === '' ? '(unset)' : settings.name}
    </button>
  )
}

describe('useStoredKey', () => {
  it('loads the stored value, saves updates, and reflects them', async () => {
    const storage = createStorage(memoryDriver())
    await storage.init()
    render(
      <StorageProvider storage={storage}>
        <Probe />
      </StorageProvider>,
    )
    const button = await screen.findByText('name:(unset)')
    await act(async () => {
      button.click()
    })
    await screen.findByText('name:Jon')
    expect((await storage.get('settings')).name).toBe('Jon')
  })

  it('second subscriber sees a write made through storage directly', async () => {
    const storage = createStorage(memoryDriver())
    await storage.init()
    render(
      <StorageProvider storage={storage}>
        <Probe />
      </StorageProvider>,
    )
    await screen.findByText('name:(unset)')
    await act(async () => {
      await storage.set('settings', {
        ...(await storage.get('settings')),
        name: 'Ada',
      })
    })
    await screen.findByText('name:Ada')
  })

  it('subscribe-before-get: fresh write via onChanged wins over stale initial read', async () => {
    // Test that a subscribed update arriving while the initial get() is in-flight
    // clobbers the stale get() result, not the other way around.
    // Key: the hook calls subscribe BEFORE get, so an onChanged fired during get's flight
    // should update the hook state first. The gotUpdate flag ensures the stale get() is ignored.

    // Setup: track when hook's get() is called and delay it.
    let resolveHookGet: ((v: Record<string, unknown>) => void) | null = null
    const base = memoryDriver()
    // Initialize the backing store before delaying keyed reads. Storage init
    // now verifies its own writes with keyed reads; delaying every keyed read
    // from an empty store would block init rather than the hook read this test
    // is meant to control.
    await createStorage(base).init()
    const delayedDriver = {
      ...base,
      read: (keys: string[] | null) => {
        // Allow first read (init: keys=null) to complete normally.
        if (keys === null) {
          return base.read(keys)
        }
        // For hook reads, delay and capture resolver.
        return new Promise<Record<string, unknown>>((resolve) => {
          resolveHookGet = resolve
        })
      },
    }

    const storage = createStorage(delayedDriver)
    await storage.init()

    render(
      <StorageProvider storage={storage}>
        <Probe />
      </StorageProvider>,
    )

    // Hook mounted and subscribed, but its get() is blocked.
    // Trigger a write, which fires onChanged before get() resolves.
    await act(async () => {
      await storage.set('settings', { ...defaults().settings, name: 'Fresh' })
    })

    // Subscription callback should have fired via onChanged.
    await screen.findByText('name:Fresh')

    // Now resolve the hook's blocked get() with a stale value.
    // Because gotUpdate === true, the hook should ignore this.
    // Use async act and flush microtasks so the hook's .then() chain completes.
    await act(async () => {
      if (resolveHookGet) {
        resolveHookGet({ settings: { name: 'STALE' } })
      }
      // Flush native-Promise microtasks so the promise chain completes:
      // driver.read resolution → async get() await → hook's .then() callback
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })

    // Verify we still see 'Fresh', not 'STALE'.
    expect(screen.getByText('name:Fresh')).toBeTruthy()
  })
})
