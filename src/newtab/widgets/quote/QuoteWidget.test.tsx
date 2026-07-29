// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { act, render } from '@testing-library/react'
import { createStorage } from '../../../lib/storage/index'
import { memoryDriver } from '../../../lib/storage/driver'
import { StorageProvider } from '../../../lib/storage/context'
import { defaults } from '../../../lib/storage/schema'
import QuoteWidget from './QuoteWidget'

// Lean regression guard for the text-shadow legibility system (visual-quality
// overhaul): the quote + its attribution sit directly on the photo, so both
// MUST carry the .text-photo utility. See Clock.test.tsx for why this is a
// className assertion rather than a rendered-shadow assertion.
describe('QuoteWidget — text-photo legibility utility', () => {
  it('applies text-photo to both the quote text and its attribution', async () => {
    const storage = createStorage(memoryDriver())
    await storage.init()
    await storage.set('settings', defaults().settings) // widgets.quote defaults true
    const { container } = render(
      <StorageProvider storage={storage}>
        <QuoteWidget />
      </StorageProvider>,
    )
    await act(async () => {})

    const blockquote = container.querySelector('blockquote')
    const figcaption = container.querySelector('figcaption')
    expect(blockquote).toBeTruthy()
    expect(figcaption).toBeTruthy()
    expect(blockquote?.classList.contains('text-photo')).toBe(true)
    expect(figcaption?.classList.contains('text-photo')).toBe(true)
  })
})
