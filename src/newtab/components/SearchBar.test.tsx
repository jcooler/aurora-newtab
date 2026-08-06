// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { createStorage } from '../../lib/storage/index'
import { memoryDriver } from '../../lib/storage/driver'
import { StorageProvider } from '../../lib/storage/context'
import { searchWeb } from '../../services/search'
import SearchBar from './SearchBar'

// Red Argon remediation: SearchBar no longer builds a provider URL itself
// (src/lib/search.ts is gone) — it hands the raw query to the shared
// searchWeb() service (src/services/search.ts), which is the only thing
// that touches chrome.search. Mocked here the same way BookmarksBar.test.tsx
// mocks services/bookmarks.
vi.mock('../../services/search', () => ({ searchWeb: vi.fn() }))

async function renderSearchBar() {
  const storage = createStorage(memoryDriver())
  await storage.init() // seeds defaults(), including widgets.search: true
  render(
    <StorageProvider storage={storage}>
      <SearchBar />
    </StorageProvider>,
  )
  return screen.findByRole('searchbox', { name: 'Search the web' })
}

describe('SearchBar', () => {
  afterEach(() => {
    vi.mocked(searchWeb).mockClear()
  })

  it('submitting a query calls searchWeb with the trimmed text', async () => {
    const input = await renderSearchBar()
    fireEvent.change(input, { target: { value: '  hello world  ' } })
    fireEvent.submit(screen.getByRole('search'))

    expect(searchWeb).toHaveBeenCalledTimes(1)
    expect(searchWeb).toHaveBeenCalledWith('hello world')
  })

  it('does not call searchWeb for an empty query', async () => {
    const input = await renderSearchBar()
    fireEvent.change(input, { target: { value: '' } })
    fireEvent.submit(screen.getByRole('search'))

    expect(searchWeb).not.toHaveBeenCalled()
  })

  it('does not call searchWeb for a whitespace-only query', async () => {
    const input = await renderSearchBar()
    fireEvent.change(input, { target: { value: '    ' } })
    fireEvent.submit(screen.getByRole('search'))

    expect(searchWeb).not.toHaveBeenCalled()
  })
})
