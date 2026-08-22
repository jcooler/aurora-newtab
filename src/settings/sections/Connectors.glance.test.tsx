// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { useStoredKey } from '../../lib/hooks/useStoredKey'
import { createStorage, type AuroraStorage } from '../../lib/storage'
import { StorageProvider } from '../../lib/storage/context'
import { memoryDriver } from '../../lib/storage/driver'
import Connectors from './Connectors'

beforeAll(() => {
  vi.stubGlobal('chrome', {
    permissions: {
      getAll: vi.fn(async () => ({ origins: [] })),
      request: vi.fn(async () => true),
      contains: vi.fn(async () => true),
      remove: vi.fn(async () => false),
      onAdded: { addListener: vi.fn() },
      onRemoved: { addListener: vi.fn() },
    },
  })
})

afterAll(() => vi.unstubAllGlobals())

function Harness({ storage }: { storage: AuroraStorage }) {
  const [connectors] = useStoredKey('connectors')
  return <Connectors connectors={connectors} storage={storage} reportPendingCleanup={vi.fn()} />
}

describe('At a glance Settings', () => {
  it('enables On This Day without a permission request and clears only its snapshot', async () => {
    const storage = createStorage(memoryDriver())
    await storage.init()
    await storage.set('connectorSnapshots', {
      onThisDay: { fetchedAt: 1, data: { old: true } },
      crypto: { fetchedAt: 2, data: { coins: [] } },
    })
    render(<StorageProvider storage={storage}><Harness storage={storage} /></StorageProvider>)

    fireEvent.click(await screen.findByRole('button', { name: 'Set up On This Day' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add On This Day to canvas' }))

    await waitFor(async () => expect((await storage.get('connectors')).onThisDay).toEqual({ enabled: true }))
    expect((await storage.get('connectorSnapshots')).onThisDay).toBeUndefined()
    expect((await storage.get('connectorSnapshots')).crypto).toBeTruthy()
    expect(chrome.permissions.request).not.toHaveBeenCalled()
  })

  it('loads the country catalog only while Public Holidays setup is open and saves one validated country', async () => {
    const storage = createStorage(memoryDriver())
    await storage.init()
    await storage.set('connectorSnapshots', {
      publicHolidays: { fetchedAt: 1, data: { old: true } },
      crypto: { fetchedAt: 2, data: { coins: [] } },
    })
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify([
      { countryCode: 'CA', name: 'Canada' },
      { countryCode: 'US', name: 'United States' },
    ]), { status: 200 }))
    render(<StorageProvider storage={storage}><Harness storage={storage} /></StorageProvider>)

    expect(fetchSpy).not.toHaveBeenCalled()
    fireEvent.click(await screen.findByRole('button', { name: 'Set up Public Holidays' }))
    const picker = await screen.findByRole('combobox', { name: 'Country' })
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    fireEvent.change(picker, { target: { value: 'US' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add Public Holidays to canvas' }))

    await waitFor(async () => expect((await storage.get('connectors')).publicHolidays).toEqual({
      enabled: true,
      countryCode: 'US',
    }))
    expect((await storage.get('connectorSnapshots')).publicHolidays).toBeUndefined()
    expect((await storage.get('connectorSnapshots')).crypto).toBeTruthy()
    expect(chrome.permissions.request).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })

  it('enables Aurora & Kp without a credential or permission transaction', async () => {
    const storage = createStorage(memoryDriver())
    await storage.init()
    await storage.set('connectorSnapshots', {
      auroraKp: { fetchedAt: 1, data: { old: true } },
      crypto: { fetchedAt: 2, data: { coins: [] } },
    })
    render(<StorageProvider storage={storage}><Harness storage={storage} /></StorageProvider>)

    fireEvent.click(await screen.findByRole('button', { name: 'Set up Aurora & Kp' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add Aurora & Kp to canvas' }))

    await waitFor(async () => expect((await storage.get('connectors')).auroraKp).toEqual({ enabled: true }))
    expect((await storage.get('connectorSnapshots')).auroraKp).toBeUndefined()
    expect((await storage.get('connectorSnapshots')).crypto).toBeTruthy()
    expect(chrome.permissions.request).not.toHaveBeenCalled()
  })
})
