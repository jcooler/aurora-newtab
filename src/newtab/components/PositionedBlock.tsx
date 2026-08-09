import { useContext, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import type { BlockId, BlockPos } from '../../lib/layout/types'
import { clampCenterPct, type Size } from '../../lib/layout/clamp'
import { DraftLayoutContext } from '../arrange/draftLayout'

interface Props {
  id: BlockId
  pos: BlockPos | undefined // stored position; undefined = default placement
  className?: string // default-placement classes ONLY (dropped on the arranged branch): corner peripherals pass their `fixed …` classes; rail widgets (Task 64) pass width/visibility classes (`short:hidden`, the `.rail-col2` container-query marker) or none and flow inside their zone; centred-stack children pass none
  children: ReactNode
}

/** Corrupt/partial entries (non-finite axis) fall back to the default
 *  placement rather than rendering at NaN%. */
function sanitize(pos: BlockPos | undefined): BlockPos | undefined {
  if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.y)) return undefined
  return pos
}

export default function PositionedBlock({ id, pos, className, children }: Props): ReactNode {
  // Arrange mode's live-drag override (Task 36) — populated only while THIS
  // block is being dragged, and only ever a render-time channel (never
  // written to storage). Falls back to the default `{}` context value (no
  // <DraftLayoutContext.Provider> in scope, e.g. every existing test) so
  // this is a no-op everywhere the provider doesn't wrap the tree.
  const draft = useContext(DraftLayoutContext)
  const valid = sanitize(draft[id] ?? pos)
  const ref = useRef<HTMLDivElement>(null)
  const [display, setDisplay] = useState<BlockPos | undefined>(valid)
  // Measured px size of the positioned div, used to convert the percent
  // center into a pixel `calc()` offset below — see the containing-block
  // comment on `style` for why this replaced a `translate: -50% -50%`.
  const [size, setSize] = useState<Size | undefined>(undefined)

  useLayoutEffect(() => {
    if (!valid) {
      setDisplay(undefined)
      setSize(undefined)
      return
    }
    setDisplay(valid) // reset to the raw stored pos before re-measuring below

    const el = ref.current
    if (!el) return

    const recalc = () => {
      const rect = el.getBoundingClientRect()
      // jsdom (and a not-yet-laid-out element) reports 0x0 — skip clamping
      // rather than clamp against a bogus zero size.
      if (rect.width === 0 && rect.height === 0) return
      setSize({ w: rect.width, h: rect.height })
      setDisplay(
        clampCenterPct(
          valid,
          { w: rect.width, h: rect.height },
          { w: window.innerWidth, h: window.innerHeight },
        ),
      )
    }
    recalc()
    window.addEventListener('resize', recalc)

    // The child can still be hydrating when the synchronous measurement
    // above runs — e.g. Clock renders nothing on its own FIRST render
    // (its own useStoredKey('settings') hasn't resolved yet, a tick behind
    // App's own already-resolved settings gating this whole tree), so a
    // fresh page load can genuinely measure a real 0x0 box here. `resize`
    // only fires for VIEWPORT changes, not the element's own content
    // filling in afterward, so without this, `size` stays permanently
    // unset and the block renders top-left-anchored forever instead of
    // centered (found via a real-browser reload probe, not caught by any
    // jsdom test — jsdom has no ResizeObserver either, hence the guard).
    // ResizeObserver re-fires whenever the observed element's rendered box
    // actually changes size, for any reason, self-healing that gap.
    let resizeObserver: ResizeObserver | undefined
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(recalc)
      resizeObserver.observe(el)
    }

    return () => {
      window.removeEventListener('resize', recalc)
      resizeObserver?.disconnect()
    }
  }, [valid?.x, valid?.y])

  if (!valid) {
    return (
      <div data-block-id={id} className={className}>
        {children}
      </div>
    )
  }

  const shown = display ?? valid
  // Centering without `translate`/`transform`: either one establishes a new
  // containing block for `position: fixed` DESCENDANTS (CSS Transforms
  // spec), which would break any dragged block whose own children need
  // viewport-relative fixed positioning — concretely, Notes/Todo/Timer's
  // popup panels, which position themselves with inline `position: fixed`
  // relative to the true viewport (see NotesWidget.tsx et al.). Before
  // arrange mode this was inert (no block ever had a stored `pos`); dragging
  // (Task 36) makes it reachable, so it's fixed here once, for every current
  // and future fixed-position descendant, rather than patching each panel.
  // `calc()` with a mixed percent/px expression reproduces the exact same
  // centered box a transform would, without creating that containing block.
  // Before the first real measurement (`size` still undefined — jsdom's
  // default 0x0, a not-yet-laid-out element, or a child still hydrating; see
  // the ResizeObserver comment above), there's no size to subtract yet, so
  // this briefly renders top-left-anchored; useLayoutEffect corrects it (via
  // `setSize`/`setDisplay`) before the browser paints whenever the FIRST
  // measurement succeeds (same no-flash guarantee the pre-existing clamp
  // correction relied on), and ResizeObserver corrects it shortly after
  // otherwise (a brief, self-healing flash instead of a permanent miss).
  const style: CSSProperties = {
    position: 'fixed',
    left: size ? `calc(${shown.x}% - ${size.w / 2}px)` : `${shown.x}%`,
    top: size ? `calc(${shown.y}% - ${size.h / 2}px)` : `${shown.y}%`,
  }

  return (
    <div ref={ref} data-block-id={id} style={style}>
      {children}
    </div>
  )
}
