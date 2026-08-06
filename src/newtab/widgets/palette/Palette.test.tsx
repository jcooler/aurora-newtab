// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { createStorage } from '../../../lib/storage/index'
import { memoryDriver } from '../../../lib/storage/driver'
import { StorageProvider } from '../../../lib/storage/context'
import { searchWeb } from '../../../services/search'
import Palette from './Palette'

// Red Argon remediation: the palette's "Search the web for…" fallback
// command must route through the shared searchWeb() service
// (src/services/search.ts), not build a provider URL itself. Mocked here
// the same way SearchBar.test.tsx mocks the same module.
vi.mock('../../../services/search', () => ({ searchWeb: vi.fn() }))

async function renderPalette() {
  const storage = createStorage(memoryDriver())
  await storage.init()
  render(
    <StorageProvider storage={storage}>
      <Palette onClose={vi.fn()} onOpenSettings={vi.fn()} />
    </StorageProvider>,
  )
  return screen.findByRole('combobox')
}

describe('Palette — web search fallback', () => {
  afterEach(() => {
    vi.mocked(searchWeb).mockClear()
  })

  it('running the web-search fallback (Enter, sole result for a non-matching query) calls searchWeb with the query', async () => {
    const input = await renderPalette()
    fireEvent.change(input, { target: { value: 'zzzznomatch' } })

    expect(await screen.findByText('Search the web for “zzzznomatch”')).toBeTruthy()

    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter' })
    })

    expect(searchWeb).toHaveBeenCalledTimes(1)
    expect(searchWeb).toHaveBeenCalledWith('zzzznomatch')
  })

  it('clicking the web-search fallback option also calls searchWeb with the query', async () => {
    const input = await renderPalette()
    fireEvent.change(input, { target: { value: 'cats' } })

    const option = await screen.findByText('Search the web for “cats”')
    fireEvent.click(option)

    expect(searchWeb).toHaveBeenCalledWith('cats')
  })
})
