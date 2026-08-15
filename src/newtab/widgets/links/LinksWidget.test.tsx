// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defaults } from '../../../lib/storage/schema'
import { createStorage } from '../../../lib/storage'
import { memoryDriver } from '../../../lib/storage/driver'
import { StorageProvider } from '../../../lib/storage/context'
import LinksWidget from './LinksWidget'

function setup() {
  const base = defaults()
  const driver = memoryDriver({
    settings: { ...base.settings, widgets: { ...base.settings.widgets, links: true } },
    links: [],
  })
  const storage = createStorage(driver)
  render(<StorageProvider storage={storage}><LinksWidget /></StorageProvider>)
  return { driver }
}

async function openEditor() {
  const invoker = await screen.findByRole('button', { name: 'Add quick link' })
  fireEvent.click(invoker)
  return {
    invoker,
    title: screen.getByRole('textbox', { name: 'Link title' }),
    url: screen.getByRole('textbox', { name: 'Link URL' }),
  }
}

describe('LinksWidget add editor', () => {
  beforeEach(() => {
    vi.stubGlobal('chrome', { runtime: { getURL: (path: string) => `chrome-extension://test${path}` } })
  })

  afterEach(() => vi.unstubAllGlobals())

  it('keeps an unsafe URL focused and relates it to exactly one atomic alert without writing', async () => {
    const { driver } = setup()
    let writes = 0
    const unsubscribe = driver.onChanged((changes) => {
      if ('links' in changes) writes += 1
    })
    const { url } = await openEditor()
    fireEvent.change(url, { target: { value: 'javascript:do-not-repeat-me' } })
    fireEvent.submit(url.closest('form')!)

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBe('Enter a valid address.')
    expect(alert.getAttribute('aria-atomic')).toBe('true')
    expect(document.querySelectorAll('[role="alert"]')).toHaveLength(1)
    expect(url.getAttribute('aria-invalid')).toBe('true')
    expect(url.getAttribute('aria-describedby')).toBe(alert.id)
    expect(document.activeElement).toBe(url)
    expect(document.body.textContent).not.toContain('javascript:do-not-repeat-me')
    expect(driver.dump().links).toEqual([])
    expect(writes).toBe(0)
    unsubscribe()
  })

  it('clears invalid semantics on correction and persists the normalized HTTP(S) URL on submit', async () => {
    const { driver } = setup()
    const { url } = await openEditor()
    fireEvent.change(url, { target: { value: 'https:/malformed.example.com' } })
    fireEvent.submit(url.closest('form')!)
    expect(await screen.findByRole('alert')).toBeTruthy()

    fireEvent.change(url, { target: { value: 'example.com/path' } })
    expect(screen.queryByRole('alert')).toBeNull()
    expect(url.getAttribute('aria-invalid')).toBeNull()
    expect(url.getAttribute('aria-describedby')).toBeNull()
    fireEvent.submit(url.closest('form')!)

    await waitFor(() => expect(driver.dump().links).toEqual([
      expect.objectContaining({ title: 'example.com', url: 'https://example.com/path' }),
    ]))
    const invoker = await screen.findByRole('button', { name: 'Add quick link' })
    await waitFor(() => expect(document.activeElement).toBe(invoker))
  })

  it.each([
    ['Escape', (url: HTMLElement) => fireEvent.keyDown(url, { key: 'Escape', code: 'Escape' })],
    ['Cancel', () => fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))],
  ])('%s closes without writing and restores the Add quick link invoker', async (_name, close) => {
    const { driver } = setup()
    let writes = 0
    const unsubscribe = driver.onChanged((changes) => {
      if ('links' in changes) writes += 1
    })
    const { url } = await openEditor()
    fireEvent.change(url, { target: { value: 'example.com/not-saved' } })
    close(url)

    const invoker = await screen.findByRole('button', { name: 'Add quick link' })
    await waitFor(() => expect(document.activeElement).toBe(invoker))
    expect(driver.dump().links).toEqual([])
    expect(writes).toBe(0)
    unsubscribe()
  })

  it('gives the invoker, inputs, Add, and Cancel local 36px target floors', async () => {
    setup()
    const { invoker, title, url } = await openEditor()
    expect(invoker.className).toContain('size-12')
    expect(title.className).toContain('min-h-9')
    expect(url.className).toContain('min-h-9')
    for (const name of ['Add', 'Cancel']) {
      const button = screen.getByRole('button', { name })
      expect(button.className).toContain('min-h-9')
      expect(button.className).toContain('min-w-9')
    }
  })
})
