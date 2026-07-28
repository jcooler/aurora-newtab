import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import type { BlockId, BlockPos } from '../../lib/layout/types'
import { clampCenterPct } from '../../lib/layout/clamp'

interface Props {
  id: BlockId
  pos: BlockPos | undefined // stored position; undefined = default placement
  className?: string // default-placement classes (peripherals pass their old fixed classes; stack children pass none)
  children: ReactNode
}

/** Corrupt/partial entries (non-finite axis) fall back to the default
 *  placement rather than rendering at NaN%. */
function sanitize(pos: BlockPos | undefined): BlockPos | undefined {
  if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.y)) return undefined
  return pos
}

export default function PositionedBlock({ id, pos, className, children }: Props): ReactNode {
  const valid = sanitize(pos)
  const ref = useRef<HTMLDivElement>(null)
  const [display, setDisplay] = useState<BlockPos | undefined>(valid)

  useLayoutEffect(() => {
    if (!valid) {
      setDisplay(undefined)
      return
    }
    setDisplay(valid) // reset to the raw stored pos before re-measuring below

    const recalc = () => {
      const el = ref.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      // jsdom (and a not-yet-laid-out element) reports 0x0 — skip clamping
      // rather than clamp against a bogus zero size.
      if (rect.width === 0 && rect.height === 0) return
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
    return () => window.removeEventListener('resize', recalc)
  }, [valid?.x, valid?.y])

  if (!valid) {
    return (
      <div data-block-id={id} className={className}>
        {children}
      </div>
    )
  }

  const shown = display ?? valid
  const style: CSSProperties = {
    position: 'fixed',
    left: `${shown.x}%`,
    top: `${shown.y}%`,
    translate: '-50% -50%',
  }

  return (
    <div ref={ref} data-block-id={id} style={style}>
      {children}
    </div>
  )
}
