// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { createStorage } from '../../../lib/storage/index'
import { memoryDriver } from '../../../lib/storage/driver'
import { StorageProvider } from '../../../lib/storage/context'
import { anchorPanel, hugHorizontal } from '../../../lib/layout/anchor'
import TodoWidget, { TODO_CORNER_HUG_PX, TODO_PANEL_SIZE } from './TodoWidget'
import type { CanvasSize } from '../../../lib/layout/canvasTypes'
import type { TodoList } from '../../../lib/storage/schema'

async function renderWidget({
  onOpenChange,
  canvasSize = 'compact',
  docked = false,
  todoLists,
}: { onOpenChange?: (open: boolean) => void; canvasSize?: CanvasSize; docked?: boolean; todoLists?: TodoList[] } = {}) {
  const storage = createStorage(memoryDriver())
  await storage.init()
  if (todoLists) await storage.set('todoLists', todoLists)
  const view = render(
    <StorageProvider storage={storage}>
      <TodoWidget onOpenChange={onOpenChange} canvasSize={canvasSize} docked={docked} />
    </StorageProvider>,
  )
  await act(async () => {})
  return { storage, view }
}

describe('TodoWidget', () => {
  it('renders the Tasks direct action in the exact Compact ready TierFrame', async () => {
    await renderWidget({ canvasSize: 'compact' })
    const frame = screen.getByRole('region', { name: 'Tasks card' })
    expect(frame.getAttribute('data-tier-frame')).toBe('compact')
    expect(frame.getAttribute('data-tier-frame-state')).toBe('empty')
    expect(frame.classList.contains('tier-frame--compact')).toBe(true)
    expect(frame.className).not.toContain('overflow-y')
    expect(frame.querySelector('[class*="overflow-y"]')).toBeNull()
    expect(screen.getByRole('button', { name: 'Tasks' })).toBeTruthy()
    expect(screen.getByText('Open tasks')).toBeTruthy()
  })

  it('keeps Docked Tasks content-tight instead of mounting the Compact frame', async () => {
    await renderWidget({ docked: true })
    expect(screen.queryByRole('region', { name: 'Tasks card' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Tasks' }).classList.contains('rounded-panel')).toBe(true)
  })

  it('shows two actionable tasks in Compact without opening the panel', async () => {
    const { storage } = await renderWidget({
      todoLists: [{
        id: 'today',
        name: 'Today',
        items: [
          { id: 'one', text: 'Review the calendar spacing', done: false },
          { id: 'two', text: 'Send the release notes', done: false },
          { id: 'three', text: 'Archive old layouts', done: false },
        ],
      }],
    })

    const actions = screen.getAllByRole('checkbox')
    expect(actions).toHaveLength(2)
    expect(screen.queryByText('Archive old layouts')).toBeNull()

    fireEvent.click(actions[0]!)
    await act(async () => {})
    expect((await storage.get('todoLists'))[0]?.items[0]?.done).toBe(true)
    expect(screen.queryByRole('dialog', { name: 'Tasks' })).toBeNull()
  })

  it('renders the pill with no fixed-position class of its own (placement now lives on the App-level PositionedBlock wrapper)', async () => {
    await renderWidget()
    const pill = screen.getByRole('button', { name: 'Tasks' })
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
    const pill = screen.getByRole('button', { name: 'Tasks' })

    const pillRect = {
      left: 1478,
      top: 846,
      right: 1536,
      bottom: 884,
      width: 58,
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

    const dialog = await screen.findByRole('dialog', { name: 'Tasks' })

    // Same adjustment TodoWidget applies internally: the pill sits 48px
    // further from the corner than the panel did in the pre-anchorPanel
    // fixed layout, so the rect fed to anchorPanel is shifted to compensate.
    const hugged = hugHorizontal(pillRect, TODO_CORNER_HUG_PX, window.innerWidth)
    const expected = anchorPanel(hugged, TODO_PANEL_SIZE, {
      w: window.innerWidth,
      h: window.innerHeight,
    })
    if (!('bottom' in expected)) throw new Error('expected a bottom-anchored result — this pill is in the bottom half')

    expect(dialog.style.position).toBe('fixed')
    expect(dialog.style.left).toBe(`${expected.left}px`)
    // Todo's default pill sits in the bottom half — anchorPanel opens the
    // panel UPWARD from there, which review fix I1 anchors via `bottom` (not
    // `top`) so the add-task form + Clear-done row grow up into free space
    // instead of clipping off-screen once the list passes ~5 tasks.
    expect(dialog.style.bottom).toBe(`${expected.bottom}px`)
    expect(dialog.style.top).toBe('')

    rectSpy.mockRestore()
    widthSpy.mockRestore()
    heightSpy.mockRestore()
  })

  it('hugs the corner it is ACTUALLY nearest to, not a corner hardcoded to Todo’s own default (right) placement — the position-agnostic requirement a dragged pill relies on', async () => {
    const widthSpy = vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1600)
    const heightSpy = vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(900)

    await renderWidget()
    const pill = screen.getByRole('button', { name: 'Tasks' })

    // Tasks' pill dragged across the vertical centerline into the LEFT
    // half (mirrors NotesWidget's default-quadrant rect) — today's Todo
    // hardcoded a permanent +48 shift, which would misplace this by 96px.
    const pillRect = {
      left: 64,
      top: 846,
      right: 122,
      bottom: 884,
      width: 58,
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

    const dialog = await screen.findByRole('dialog', { name: 'Tasks' })

    const hugged = hugHorizontal(pillRect, TODO_CORNER_HUG_PX, window.innerWidth)
    const expected = anchorPanel(hugged, TODO_PANEL_SIZE, {
      w: window.innerWidth,
      h: window.innerHeight,
    })
    if (!('bottom' in expected)) throw new Error('expected a bottom-anchored result — this pill is in the bottom half')
    expect(dialog.style.left).toBe(`${expected.left}px`)
    expect(dialog.style.bottom).toBe(`${expected.bottom}px`)

    // Prove this ISN'T today's hardcoded "+48" sign: that would have shifted
    // the rect further RIGHT (away from the corner it's actually nearest
    // to), landing at a different spot than the dynamically-hugged one above.
    const oldHardcodedHug = {
      ...pillRect,
      left: pillRect.left + TODO_CORNER_HUG_PX,
      right: pillRect.right + TODO_CORNER_HUG_PX,
    }
    const oldExpected = anchorPanel(oldHardcodedHug, TODO_PANEL_SIZE, {
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
// panel-vs-connector probe's job — it's what caught the Tasks panel
// painting under Jira's card in the first place), but it CAN verify the
// mechanism App.tsx's conditional `z-30` depends on: the callback fires
// true on open, false on close, and false again on unmount, never a stale
// value.
describe('TodoWidget onOpenChange (final-review fix wave, Fix 1)', () => {
  it('calls onOpenChange(true) on open and onOpenChange(false) on close', async () => {
    const onOpenChange = vi.fn()
    await renderWidget({ onOpenChange })

    expect(onOpenChange).toHaveBeenLastCalledWith(false)
    onOpenChange.mockClear()

    const pill = screen.getByRole('button', { name: 'Tasks' })
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
  // this, App's mirrored `tasksOpen` state would stick at `true` forever if
  // TodoWidget ever unmounts while open (e.g. the widget toggle is
  // switched off mid-session — TodoWidget's own outer gate now unmounts
  // TodoInner on exactly that transition, see its own comment), permanently
  // outranking every connector card's own z-index:auto wrapper.
  it('calls onOpenChange(false) on unmount, even while open', async () => {
    const onOpenChange = vi.fn()
    const { view } = await renderWidget({ onOpenChange })
    const pill = screen.getByRole('button', { name: 'Tasks' })
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
