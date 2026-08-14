// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createStorage } from '../../lib/storage/index'
import { memoryDriver } from '../../lib/storage/driver'
import { StorageProvider } from '../../lib/storage/context'
import FocusLine from './FocusLine'

const localDay = vi.hoisted(() => ({
  sample: { key: '2026-07-26', timeZone: 'America/New_York', now: new Date('2026-07-26T12:00:00Z') },
}))
vi.mock('../../lib/hooks/useLocalDay', () => ({ useLocalDay: () => localDay.sample }))

describe('FocusLine local-day rollover', () => {
  beforeEach(() => {
    localDay.sample = {
      key: '2026-07-26', timeZone: 'America/New_York', now: new Date('2026-07-26T12:00:00Z'),
    }
  })

  it('expires yesterday\'s focus in an already-open tab', async () => {
    const storage = createStorage(memoryDriver({
      focus: { text: 'Ship W1-P7', date: '2026-07-26', done: false },
    }))
    const view = render(<StorageProvider storage={storage}><FocusLine /></StorageProvider>)
    await act(async () => {})
    expect(screen.getByText('Ship W1-P7')).toBeTruthy()

    localDay.sample = {
      key: '2026-07-27', timeZone: 'America/New_York', now: new Date('2026-07-27T04:00:01Z'),
    }
    view.rerender(<StorageProvider storage={storage}><FocusLine /></StorageProvider>)
    expect(screen.queryByText('Ship W1-P7')).toBeNull()
    expect(screen.getByText(/main focus today/i)).toBeTruthy()
  })
})
