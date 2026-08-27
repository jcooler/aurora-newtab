// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { createStorage } from '../../lib/storage/index'
import { memoryDriver } from '../../lib/storage/driver'
import { StorageProvider } from '../../lib/storage/context'
import { searchWeb } from '../../services/search'
import SearchBar from './SearchBar'
import { projectSearchSafeGeometry } from './SearchBar'

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

  it('fits Compact Search before the fixed utility controls with focus-outline clearance', () => {
    expect(projectSearchSafeGeometry({
      viewportWidth: 375,
      centerX: 187.5,
      requestedWidth: 280,
      utilityStart: 275,
    })).toEqual({ width: 251, translateX: -50, left: 12, right: 263 })
  })

  it('leaves a roomy centered Search unchanged while still reserving the utility zone', () => {
    expect(projectSearchSafeGeometry({
      viewportWidth: 1920,
      centerX: 960,
      requestedWidth: 320,
      utilityStart: 1820,
    })).toEqual({ width: 320, translateX: 0, left: 800, right: 1120 })
  })

  it('moves a user-placed Search inward when its focus outline would touch the controls', () => {
    const geometry = projectSearchSafeGeometry({
      viewportWidth: 1920,
      centerX: 1730,
      requestedWidth: 320,
      utilityStart: 1820,
    })
    expect(geometry.right).toBe(1808)
    expect(geometry.translateX).toBeLessThan(0)
  })

  it('publishes the safe-zone hook and a visible focus outline', async () => {
    const input = await renderSearchBar()
    expect(screen.getByRole('search').hasAttribute('data-search-safe-zone')).toBe(true)
    expect(screen.getByRole('search').dataset.searchPresentation).toBe('free')
    expect(input.classList.contains('focus-visible:outline-2')).toBe(true)
    expect(input.classList.contains('focus-visible:outline-offset-2')).toBe(true)
  })

  it('keeps free Search transparent and line-led instead of painting a card', async () => {
    const input = await renderSearchBar()
    expect(screen.getByTestId('free-search-icon')).toBeTruthy()
    for (const token of ['rounded-panel', 'bg-panel-solid', 'shadow-lg', 'backdrop-blur-[var(--panel-blur)]']) {
      expect(input.classList.contains(token)).toBe(false)
    }
    expect(input.classList.contains('border-b')).toBe(true)
  })

  it('keeps the real search action inside an exact Standard stack face', async () => {
    const storage = createStorage(memoryDriver())
    await storage.init()
    render(
      <StorageProvider storage={storage}>
        <SearchBar canvasSize="standard" presentation="stack" />
      </StorageProvider>,
    )
    await screen.findByRole('searchbox', { name: 'Search the web' })
    expect(screen.getByRole('region', { name: 'Search' }).dataset.tierFrame).toBe('standard')
    expect(screen.getByRole('search')).toBeTruthy()
    expect(screen.getByPlaceholderText('Search the web')).toBeTruthy()
    expect(screen.getByText('Enter')).toBeTruthy()
  })
})
