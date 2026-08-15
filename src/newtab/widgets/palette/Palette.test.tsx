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

async function renderPaletteWithLink(url: string) {
  const storage = createStorage(memoryDriver())
  await storage.init()
  await storage.set('links', [{ id: 'long-link', title: 'Long link', url }])
  render(
    <StorageProvider storage={storage}>
      <Palette onClose={vi.fn()} onOpenSettings={vi.fn()} />
    </StorageProvider>,
  )
  await screen.findByRole('combobox')
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

describe('Palette narrow and short viewport ownership', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    Reflect.deleteProperty(Element.prototype, 'scrollIntoView')
  })

  it('bounds the whole dialog, removes the fixed short-viewport offset, and gives only results flexible scroll ownership', async () => {
    await renderPalette()
    const dialog = screen.getByRole('dialog', { name: 'Command palette' })
    const wrapper = dialog.parentElement!
    const listbox = screen.getByRole('listbox', { name: 'Commands' })

    expect(wrapper.classList.contains('pt-[18vh]')).toBe(true)
    expect(wrapper.classList.contains('[@media(max-height:300px)]:p-2')).toBe(true)
    expect(dialog.classList.contains('max-h-[calc(100dvh-1rem)]')).toBe(true)
    expect(dialog.classList.contains('flex')).toBe(true)
    expect(dialog.classList.contains('flex-col')).toBe(true)
    expect(dialog.querySelectorAll('.overflow-y-auto')).toHaveLength(1)
    expect(listbox.classList.contains('min-h-0')).toBe(true)
    expect(listbox.classList.contains('flex-1')).toBe(true)
    expect(listbox.classList.contains('max-h-80')).toBe(true)
    expect(listbox.classList.contains('[@media(max-height:300px)]:max-h-20')).toBe(true)
  })

  it('keeps focus on the combobox and scrolls each active descendant fully into the results owner', async () => {
    const scrollIntoView = vi.fn()
    Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, value: scrollIntoView })
    const input = await renderPalette()
    input.focus()

    fireEvent.keyDown(input, { key: 'ArrowDown' })

    expect(document.activeElement).toBe(input)
    expect(input.getAttribute('aria-activedescendant')).toBeTruthy()
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' })
  })

  it('lets a long valid Quick Link URL hint shrink within a bounded result width', async () => {
    const longUrl = `https://example.com/${'unbroken'.repeat(80)}`
    await renderPaletteWithLink(longUrl)

    const hint = screen.getByText(longUrl)
    expect(hint.classList.contains('shrink-0')).toBe(false)
    expect(hint.classList.contains('min-w-0')).toBe(true)
    expect(hint.classList.contains('max-w-[50%]')).toBe(true)
  })
})
