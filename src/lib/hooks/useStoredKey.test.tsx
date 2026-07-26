// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { createStorage } from '../storage/index'
import { memoryDriver } from '../storage/driver'
import { StorageProvider } from '../storage/context'
import { useStoredKey } from './useStoredKey'

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
})
