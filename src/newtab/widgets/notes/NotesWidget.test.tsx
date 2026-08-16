// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { createStorage } from '../../../lib/storage/index'
import { memoryDriver, type StorageDriver } from '../../../lib/storage/driver'
import { StorageProvider } from '../../../lib/storage/context'
import { anchorPanel, hugHorizontal } from '../../../lib/layout/anchor'
import NotesWidget, { NOTES_CORNER_HUG_PX, NOTES_PANEL_SIZE } from './NotesWidget'
import type { UtilityCloseGuard, UtilityTrayBridge } from '../../components/utilityTrayBridge'

async function renderWidget({
  onOpenChange,
  storage: suppliedStorage,
}: { onOpenChange?: (open: boolean) => void; storage?: ReturnType<typeof createStorage> } = {}) {
  const storage = suppliedStorage ?? createStorage(memoryDriver())
  if (!suppliedStorage) await storage.init()
  const view = render(
    <StorageProvider storage={storage}>
      <NotesWidget onOpenChange={onOpenChange} />
    </StorageProvider>,
  )
  await act(async () => {})
  return { storage, view }
}

describe('NotesWidget', () => {
  it('keeps a disabled Tray note mounted until its registered save guard flushes', async () => {
    const storage = createStorage(memoryDriver())
    await storage.init()
    const host = document.createElement('div')
    document.body.append(host)
    const registerCloseGuard = vi.fn()
    const bridge: UtilityTrayBridge = {
      activeTool: 'notes',
      host,
      requestTool: vi.fn(),
      close: vi.fn(),
      registerCloseGuard,
    }
    const view = render(
      <StorageProvider storage={storage}>
        <NotesWidget utilityTray={bridge} />
      </StorageProvider>,
    )
    const note = await screen.findByRole('textbox', { name: 'Scratchpad' })
    fireEvent.change(note, { target: { value: 'Protected Tray draft' } })

    const settings = await storage.get('settings')
    await act(async () => storage.set('settings', {
      ...settings,
      widgets: { ...settings.widgets, notes: false },
    }))
    expect(screen.getByRole('textbox', { name: 'Scratchpad' })).toBeTruthy()

    const guard = [...registerCloseGuard.mock.calls].reverse().find(([, candidate]) => candidate)?.[1] as UtilityCloseGuard
    await act(async () => expect(await guard()).toBe(true))
    expect((await storage.get('notes')).text).toBe('Protected Tray draft')

    view.rerender(
      <StorageProvider storage={storage}>
        <NotesWidget utilityTray={{ ...bridge, activeTool: null }} />
      </StorageProvider>,
    )
    expect(screen.queryByRole('textbox', { name: 'Scratchpad' })).toBeNull()
    host.remove()
  })

  it('keeps a dirty panel open until a pill-close flush fulfills', async () => {
    const base = memoryDriver()
    let defer = false
    let release = () => {}
    const driver: StorageDriver = {
      read: (keys) => base.read(keys),
      onChanged: (cb) => base.onChanged(cb),
      write: async (patch) => {
        if (!defer || !Object.prototype.hasOwnProperty.call(patch, 'notes')) {
          await base.write(patch)
          return
        }
        defer = false
        await new Promise<void>((resolve) => {
          release = async () => {
            await base.write(patch)
            resolve()
          }
        })
      },
    }
    const storage = createStorage(driver, base.authority)
    await storage.init()
    defer = true
    await renderWidget({ storage })

    const pill = screen.getByRole('button', { name: 'Notes' })
    await act(async () => { fireEvent.click(pill) })
    fireEvent.change(await screen.findByRole('textbox'), { target: { value: 'Close only after save' } })
    await act(async () => {
      fireEvent.click(pill)
      await Promise.resolve()
    })

    expect(pill.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByRole('dialog', { name: 'Notes' })).toBeTruthy()
    expect(screen.getByRole('status').textContent).toBe('Saving…')

    await act(async () => {
      release()
      await Promise.resolve()
    })
    expect(screen.queryByRole('dialog', { name: 'Notes' })).toBeNull()
    expect((await storage.get('notes')).text).toBe('Close only after save')
  })

  it('keeps a rejected pill close recoverable and retries the latest edit', async () => {
    const base = memoryDriver()
    let rejectNextNotes = false
    const driver: StorageDriver = {
      read: (keys) => base.read(keys),
      onChanged: (cb) => base.onChanged(cb),
      write: async (patch) => {
        if (rejectNextNotes && Object.prototype.hasOwnProperty.call(patch, 'notes')) {
          rejectNextNotes = false
          throw new Error('configured failure')
        }
        await base.write(patch)
      },
    }
    const storage = createStorage(driver, base.authority)
    await storage.init()
    await renderWidget({ storage })

    const pill = screen.getByRole('button', { name: 'Notes' })
    fireEvent.click(pill)
    const textarea = await screen.findByRole('textbox') as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: 'Rejected draft' } })
    rejectNextNotes = true
    await act(async () => { fireEvent.click(pill); await Promise.resolve() })

    expect(pill.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByRole('alert').textContent).toContain('Your note is still here')
    expect(textarea.value).toBe('Rejected draft')
    expect(screen.getByRole('button', { name: 'Retry save' }).classList.contains('min-h-9')).toBe(true)

    fireEvent.change(textarea, { target: { value: 'Latest retry' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Retry save' })) })
    expect((await storage.get('notes')).text).toBe('Latest retry')
    await act(async () => { fireEvent.click(pill) })
    expect(screen.queryByRole('dialog', { name: 'Notes' })).toBeNull()
  })

  it('hides a disabled dirty pill but keeps its panel until persistence succeeds, then re-enables cleanly', async () => {
    const base = memoryDriver()
    let deferNotes = false
    let release = () => {}
    const driver: StorageDriver = {
      read: (keys) => base.read(keys),
      onChanged: (cb) => base.onChanged(cb),
      write: async (patch) => {
        if (!deferNotes || !Object.prototype.hasOwnProperty.call(patch, 'notes')) {
          await base.write(patch)
          return
        }
        deferNotes = false
        await new Promise<void>((resolve) => {
          release = async () => { await base.write(patch); resolve() }
        })
      },
    }
    const storage = createStorage(driver, base.authority)
    await storage.init()
    await renderWidget({ storage })

    fireEvent.click(screen.getByRole('button', { name: 'Notes' }))
    fireEvent.change(await screen.findByRole('textbox'), { target: { value: 'Survive disable' } })
    deferNotes = true
    const settings = await storage.get('settings')
    await act(async () => {
      await storage.set('settings', {
        ...settings,
        widgets: { ...settings.widgets, notes: false },
      })
      await Promise.resolve()
    })

    expect(screen.queryByRole('button', { name: 'Notes' })).toBeNull()
    expect(screen.getByRole('dialog', { name: 'Notes' })).toBeTruthy()
    await act(async () => { release(); await Promise.resolve() })
    expect(screen.queryByRole('dialog', { name: 'Notes' })).toBeNull()

    await act(async () => {
      await storage.set('settings', {
        ...settings,
        widgets: { ...settings.widgets, notes: true },
      })
    })
    expect(screen.getByRole('button', { name: 'Notes' }).getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(screen.getByRole('button', { name: 'Notes' }))
    expect((await screen.findByRole('textbox') as HTMLTextAreaElement).value).toBe('Survive disable')
  })

  it('renders the pill with no fixed-position class of its own (placement now lives on the App-level PositionedBlock wrapper)', async () => {
    await renderWidget()
    const pill = screen.getByRole('button', { name: 'Notes' })
    expect(pill.classList.contains('fixed')).toBe(false)
  })

  it("measures the pill's rect on open and positions the panel exactly at anchorPanel's output for that rect (corner-hug adjusted)", async () => {
    // Pin to the real 1600x900 viewport the pixel-parity check was verified
    // against — jsdom's default 1024x768 is narrow enough that anchorPanel's
    // 8px-margin clamp swallows any x delta a wrong offset would introduce,
    // which would let this test pass even with a broken hug adjustment.
    const widthSpy = vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1600)
    const heightSpy = vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(900)

    await renderWidget()
    const pill = screen.getByRole('button', { name: 'Notes' })

    const pillRect = {
      left: 64,
      top: 846,
      right: 127,
      bottom: 884,
      width: 63,
      height: 38,
      x: 64,
      y: 846,
      toJSON() {},
    }
    const rectSpy = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockReturnValue(pillRect as DOMRect)

    await act(async () => {
      fireEvent.click(pill)
    })

    const dialog = await screen.findByRole('dialog', { name: 'Notes' })

    // Same adjustment NotesWidget applies internally: the pill sits 48px
    // further from the corner than the panel did in the pre-anchorPanel
    // fixed layout, so the rect fed to anchorPanel is shifted to compensate.
    const hugged = hugHorizontal(pillRect, NOTES_CORNER_HUG_PX, window.innerWidth)
    const expected = anchorPanel(hugged, NOTES_PANEL_SIZE, {
      w: window.innerWidth,
      h: window.innerHeight,
    })
    if (!('bottom' in expected)) throw new Error('expected a bottom-anchored result — this pill is in the bottom half')

    expect(dialog.style.position).toBe('fixed')
    expect(dialog.style.left).toBe(`${expected.left}px`)
    // Notes' default pill sits in the bottom half — anchorPanel opens the
    // panel UPWARD from there, which review fix I1 anchors via `bottom` (not
    // `top`); Notes itself is fixed-height so this never clips, but it must
    // still render the shape it's actually given.
    expect(dialog.style.bottom).toBe(`${expected.bottom}px`)
    expect(dialog.style.top).toBe('')

    rectSpy.mockRestore()
    widthSpy.mockRestore()
    heightSpy.mockRestore()
  })

  it('hugs the corner it is ACTUALLY nearest to, not a corner hardcoded to Notes’ own default (left) placement — the position-agnostic requirement a dragged pill relies on', async () => {
    const widthSpy = vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1600)
    const heightSpy = vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(900)

    await renderWidget()
    const pill = screen.getByRole('button', { name: 'Notes' })

    // Notes' pill dragged across the vertical centerline into the RIGHT
    // half (mirrors TodoWidget's default-quadrant rect) — today's Notes
    // hardcoded a permanent -48 shift, which would misplace this by 96px.
    const pillRect = {
      left: 1478,
      top: 846,
      right: 1541,
      bottom: 884,
      width: 63,
      height: 38,
      x: 1478,
      y: 846,
      toJSON() {},
    }
    const rectSpy = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockReturnValue(pillRect as DOMRect)

    await act(async () => {
      fireEvent.click(pill)
    })

    const dialog = await screen.findByRole('dialog', { name: 'Notes' })

    const hugged = hugHorizontal(pillRect, NOTES_CORNER_HUG_PX, window.innerWidth)
    const expected = anchorPanel(hugged, NOTES_PANEL_SIZE, {
      w: window.innerWidth,
      h: window.innerHeight,
    })
    if (!('bottom' in expected)) throw new Error('expected a bottom-anchored result — this pill is in the bottom half')
    expect(dialog.style.left).toBe(`${expected.left}px`)
    expect(dialog.style.bottom).toBe(`${expected.bottom}px`)

    // Prove this ISN'T today's hardcoded "-48" sign: that would have shifted
    // the rect further LEFT (away from the corner it's actually nearest to),
    // landing at a different spot than the dynamically-hugged one above.
    const oldHardcodedHug = {
      ...pillRect,
      left: pillRect.left - NOTES_CORNER_HUG_PX,
      right: pillRect.right - NOTES_CORNER_HUG_PX,
    }
    const oldExpected = anchorPanel(oldHardcodedHug, NOTES_PANEL_SIZE, {
      w: window.innerWidth,
      h: window.innerHeight,
    })
    expect(dialog.style.left).not.toBe(`${oldExpected.left}px`)

    rectSpy.mockRestore()
    widthSpy.mockRestore()
    heightSpy.mockRestore()
  })
})

// Final-review fix wave, Fix 1 — mirrors WeatherWidget.test.tsx's own
// onExpandedChange describe block exactly (same idiom, same reason): jsdom
// can't verify real stacking/paint order (that's scripts/preview.mjs's own
// panel-vs-connector probe's job — it's what caught the Notes panel
// painting under Vercel's card in the first place), but it CAN verify the
// mechanism App.tsx's conditional `z-30` depends on: the callback fires
// true on open, false on close, and false again on unmount, never a stale
// value.
describe('NotesWidget onOpenChange (final-review fix wave, Fix 1)', () => {
  it('calls onOpenChange(true) on open and onOpenChange(false) on close', async () => {
    const onOpenChange = vi.fn()
    await renderWidget({ onOpenChange })

    expect(onOpenChange).toHaveBeenLastCalledWith(false)
    onOpenChange.mockClear()

    const pill = screen.getByRole('button', { name: 'Notes' })
    await act(async () => {
      fireEvent.click(pill)
    })
    expect(onOpenChange).toHaveBeenLastCalledWith(true)

    await act(async () => {
      fireEvent.click(pill)
    })
    expect(onOpenChange).toHaveBeenLastCalledWith(false)
  })

  // Same rationale as WeatherWidget's own unmount-cleanup test: without
  // this, App's mirrored `notesOpen` state would stick at `true` forever if
  // NotesWidget ever unmounts while open (e.g. the widget toggle is
  // switched off mid-session), permanently outranking every connector
  // card's own z-index:auto wrapper.
  it('calls onOpenChange(false) on unmount, even while open', async () => {
    const onOpenChange = vi.fn()
    const { view } = await renderWidget({ onOpenChange })
    const pill = screen.getByRole('button', { name: 'Notes' })
    await act(async () => {
      fireEvent.click(pill)
    })
    expect(onOpenChange).toHaveBeenLastCalledWith(true)

    onOpenChange.mockClear()
    view.unmount()
    expect(onOpenChange).toHaveBeenCalledTimes(1)
    expect(onOpenChange).toHaveBeenLastCalledWith(false)
  })
})
