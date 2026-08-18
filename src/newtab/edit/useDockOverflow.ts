import { useEffect, useState } from 'react'

export interface DockOverflowState {
  overflowing: boolean
  atStart: boolean
  atEnd: boolean
}

const AT_REST: DockOverflowState = { overflowing: false, atStart: true, atEnd: true }

/** Measured TRUE-overflow state for a dock strip's scroller (named-layouts
 *  spec 2.4): the fade masks and scroll affordances key on
 *  scrollWidth > clientWidth, never on static state. Re-measures on member
 *  changes, element scroll, and window resize. */
export function useDockOverflow(
  ref: React.RefObject<HTMLElement | null>,
  memberCount: number,
): DockOverflowState {
  const [state, setState] = useState<DockOverflowState>(AT_REST)

  useEffect(() => {
    const element = ref.current
    if (!element) {
      setState(AT_REST)
      return
    }
    const measure = () => {
      const overflowing = element.scrollWidth > element.clientWidth + 1
      setState({
        overflowing,
        atStart: !overflowing || element.scrollLeft <= 1,
        atEnd: !overflowing || element.scrollLeft >= element.scrollWidth - element.clientWidth - 1,
      })
    }
    measure()
    element.addEventListener('scroll', measure, { passive: true })
    window.addEventListener('resize', measure)
    return () => {
      element.removeEventListener('scroll', measure)
      window.removeEventListener('resize', measure)
    }
  }, [memberCount, ref])

  return state
}
