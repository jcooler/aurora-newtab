// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createStorage } from '../../../lib/storage/index'
import { memoryDriver } from '../../../lib/storage/driver'
import { StorageProvider } from '../../../lib/storage/context'
import { defaults } from '../../../lib/storage/schema'
import CountdownLine from './CountdownLine'

const localDay = vi.hoisted(() => ({
  sample: { key: '2026-07-26', timeZone: 'America/New_York', now: new Date('2026-07-26T12:00:00Z') },
  hook: vi.fn(),
}))
vi.mock('../../../lib/hooks/useLocalDay', () => ({ useLocalDay: () => {
  localDay.hook()
  return localDay.sample
} }))

async function renderCountdown({ enabled = true, countdowns = [{ id: 'launch', name: 'Launch', date: '2026-07-27' }] } = {}) {
  const settings = defaults().settings
  settings.widgets.countdown = enabled
  const storage = createStorage(memoryDriver({
    settings,
    countdowns,
  }))
  const view = render(<StorageProvider storage={storage}><CountdownLine /></StorageProvider>)
  await act(async () => {})
  return { storage, ...view }
}

describe('CountdownLine local-day rollover', () => {
  beforeEach(() => {
    localDay.hook.mockReset()
    localDay.sample = {
      key: '2026-07-26', timeZone: 'America/New_York', now: new Date('2026-07-26T12:00:00Z'),
    }
  })

  it('updates its day phrase at local midnight without a reload', async () => {
    const { storage, rerender } = await renderCountdown()
    expect(screen.getByText('1 day to Launch.')).toBeTruthy()
    localDay.sample = {
      key: '2026-07-27', timeZone: 'America/New_York', now: new Date('2026-07-27T04:00:01Z'),
    }
    rerender(<StorageProvider storage={storage}><CountdownLine /></StorageProvider>)
    expect(screen.getByText(/Launch.*today/i)).toBeTruthy()
  })

  it('does not schedule a local-day timer while disabled', async () => {
    const { container } = await renderCountdown({ enabled: false })
    expect(container.firstChild).toBeNull()
    expect(localDay.hook).not.toHaveBeenCalled()
  })

  it('does not mount the local-day lifecycle for an empty countdown list', async () => {
    const { container } = await renderCountdown({ countdowns: [] })
    expect(container.firstChild).toBeNull()
    expect(localDay.hook).not.toHaveBeenCalled()
  })
})
