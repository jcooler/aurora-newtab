// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { createStorage } from '../lib/storage/index'
import { memoryDriver } from '../lib/storage/driver'
import { StorageProvider } from '../lib/storage/context'
import SettingsPanel from './SettingsPanel'

// No jest-dom matchers are registered in this project (see vitest.config.ts),
// so attribute checks go through getAttribute() + toBe() like the rest of the
// suite (e.g. Background.test.tsx's querySelector/toBeNull checks) rather
// than toHaveAttribute().
function attr(el: Element, name: string) {
  return el.getAttribute(name)
}

async function renderPanel() {
  const storage = createStorage(memoryDriver())
  await storage.init()
  render(
    <StorageProvider storage={storage}>
      <SettingsPanel />
    </StorageProvider>,
  )
  // Settings resolves asynchronously (useStoredKey's storage.get().then(...)),
  // so the radiogroup isn't there on the synchronous first render.
  await screen.findAllByRole('radio')
  return storage
}

function themeGroup() {
  return screen.getByRole('radiogroup', { name: 'Theme' })
}

describe('SettingsPanel theme radiogroup (APG roving-tabindex pattern)', () => {
  it('only the selected theme (default: Aurora) is a tab stop; the rest are -1', async () => {
    await renderPanel()
    const radios = screen.getAllByRole('radio')
    expect(radios.map((r) => r.textContent)).toEqual(['Aurora', 'Glass', 'Mono'])

    const aurora = screen.getByRole('radio', { name: 'Aurora' })
    expect(attr(aurora, 'tabindex')).toBe('0')
    expect(attr(aurora, 'aria-checked')).toBe('true')

    for (const name of ['Glass', 'Mono']) {
      const radio = screen.getByRole('radio', { name })
      expect(attr(radio, 'tabindex')).toBe('-1')
      expect(attr(radio, 'aria-checked')).toBe('false')
    }
  })

  it('ArrowRight moves selection AND applies it: persists, updates aria-checked/tabindex, and moves focus', async () => {
    const storage = await renderPanel()

    await act(async () => {
      fireEvent.keyDown(themeGroup(), { key: 'ArrowRight' })
    })

    const glass = await screen.findByRole('radio', { name: 'Glass' })
    expect(attr(glass, 'aria-checked')).toBe('true')
    expect(attr(glass, 'tabindex')).toBe('0')
    expect(document.activeElement).toBe(glass)

    const aurora = screen.getByRole('radio', { name: 'Aurora' })
    expect(attr(aurora, 'aria-checked')).toBe('false')
    expect(attr(aurora, 'tabindex')).toBe('-1')

    expect((await storage.get('settings')).theme).toBe('glass')
  })

  it('ArrowLeft wraps from the first theme (Aurora) to the last (Mono)', async () => {
    const storage = await renderPanel()

    await act(async () => {
      fireEvent.keyDown(themeGroup(), { key: 'ArrowLeft' })
    })

    const mono = await screen.findByRole('radio', { name: 'Mono' })
    expect(attr(mono, 'aria-checked')).toBe('true')
    expect(attr(mono, 'tabindex')).toBe('0')
    expect(document.activeElement).toBe(mono)

    expect((await storage.get('settings')).theme).toBe('mono')
  })

  it('End selects the last theme, Home returns to the first', async () => {
    const storage = await renderPanel()

    await act(async () => {
      fireEvent.keyDown(themeGroup(), { key: 'End' })
    })
    const mono = await screen.findByRole('radio', { name: 'Mono' })
    expect(attr(mono, 'aria-checked')).toBe('true')
    expect(document.activeElement).toBe(mono)
    expect((await storage.get('settings')).theme).toBe('mono')

    await act(async () => {
      fireEvent.keyDown(themeGroup(), { key: 'Home' })
    })
    const aurora = await screen.findByRole('radio', { name: 'Aurora' })
    expect(attr(aurora, 'aria-checked')).toBe('true')
    expect(document.activeElement).toBe(aurora)
    expect((await storage.get('settings')).theme).toBe('aurora')
  })
})
