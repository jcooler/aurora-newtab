// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render } from '@testing-library/react'
import { createStorage } from '../../../lib/storage/index'
import { memoryDriver } from '../../../lib/storage/driver'
import { StorageProvider } from '../../../lib/storage/context'
import { defaults } from '../../../lib/storage/schema'
import QuoteWidget from './QuoteWidget'

const localDay = vi.hoisted(() => ({
  sample: { key: '2026-07-26', timeZone: 'America/New_York', now: new Date('2026-07-26T12:00:00Z') },
  hook: vi.fn(),
}))
vi.mock('../../../lib/hooks/useLocalDay', () => ({ useLocalDay: () => {
  localDay.hook()
  return localDay.sample
} }))

describe('QuoteWidget', () => {
  beforeEach(() => {
    localDay.hook.mockReset()
    localDay.sample = {
      key: '2026-07-26', timeZone: 'America/New_York', now: new Date('2026-07-26T12:00:00Z'),
    }
  })

  it('applies text-photo to both the quote text and its attribution', async () => {
    const storage = createStorage(memoryDriver())
    await storage.init()
    await storage.set('settings', defaults().settings)
    const { container } = render(
      <StorageProvider storage={storage}><QuoteWidget /></StorageProvider>,
    )
    await act(async () => {})

    const blockquote = container.querySelector('blockquote')
    const figcaption = container.querySelector('figcaption')
    expect(blockquote).toBeTruthy()
    expect(figcaption).toBeTruthy()
    expect(blockquote?.classList.contains('text-photo')).toBe(true)
    expect(figcaption?.classList.contains('text-photo')).toBe(true)
  })

  it('marks only the attribution as glance metadata', async () => {
    const storage = createStorage(memoryDriver())
    await storage.init()
    await storage.set('settings', defaults().settings)
    const { container } = render(
      <StorageProvider storage={storage}><QuoteWidget /></StorageProvider>,
    )
    await act(async () => {})

    expect(container.querySelector('blockquote')?.getAttribute('data-stage-text-tier')).toBeNull()
    expect(container.querySelector('figcaption')?.getAttribute('data-stage-text-tier')).toBe('metadata')
  })

  it('selects a new daily quote after local midnight without a reload', async () => {
    const storage = createStorage(memoryDriver())
    await storage.init()
    const view = render(<StorageProvider storage={storage}><QuoteWidget /></StorageProvider>)
    await act(async () => {})
    const before = view.container.querySelector('blockquote')?.textContent

    localDay.sample = {
      key: '2026-07-27', timeZone: 'America/New_York', now: new Date('2026-07-27T04:00:01Z'),
    }
    view.rerender(<StorageProvider storage={storage}><QuoteWidget /></StorageProvider>)
    expect(view.container.querySelector('blockquote')?.textContent).not.toBe(before)
  })

  it('renders no daily scheduler while disabled', async () => {
    const storage = createStorage(memoryDriver())
    await storage.init()
    const settings = defaults().settings
    settings.widgets.quote = false
    await storage.set('settings', settings)
    const { container } = render(<StorageProvider storage={storage}><QuoteWidget /></StorageProvider>)
    await act(async () => {})

    expect(container.firstChild).toBeNull()
    expect(localDay.hook).not.toHaveBeenCalled()
  })
})
