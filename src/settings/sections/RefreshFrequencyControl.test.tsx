// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { createStorage } from '../../lib/storage'
import { StorageProvider } from '../../lib/storage/context'
import { memoryDriver } from '../../lib/storage/driver'
import RefreshFrequencyControl from './RefreshFrequencyControl'

describe('RefreshFrequencyControl', () => {
  it('stores a safe source-specific preset and supports manual refresh', async () => {
    const storage = createStorage(memoryDriver())
    await storage.init()
    const refreshNow = vi.fn(() => Promise.resolve())
    render(
      <StorageProvider storage={storage}>
        <RefreshFrequencyControl source="crypto" label="Crypto" storage={storage} preferences={{}} onRefreshNow={refreshNow} />
      </StorageProvider>,
    )

    const select = await screen.findByLabelText('Crypto refresh frequency')
    expect((select as HTMLSelectElement).value).toBe('5')
    await act(async () => {
      fireEvent.change(select, { target: { value: '1' } })
    })
    expect(await storage.get('refreshPreferences')).toEqual({ crypto: 1 })
    expect(screen.getByText(/only while Tab Two is visible/i)).toBeTruthy()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Refresh Crypto now' }))
    })
    expect(refreshNow).toHaveBeenCalledOnce()
  })

  it('renders no control for fixed daily holiday data', async () => {
    const storage = createStorage(memoryDriver())
    await storage.init()
    const { container } = render(
      <StorageProvider storage={storage}>
        <RefreshFrequencyControl source="publicHolidays" label="Public Holidays" storage={storage} preferences={{}} onRefreshNow={() => Promise.resolve()} />
      </StorageProvider>,
    )
    await act(async () => {})
    expect(container.textContent).toBe('')
  })
})
