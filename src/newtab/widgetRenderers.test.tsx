import type { ReactElement } from 'react'
import { describe, expect, it } from 'vitest'
import type { CanvasSize } from '../lib/layout/canvasTypes'
import { WIDGET_RENDERERS } from './widgetRenderers'

describe('time and productivity widget renderers', () => {
  it('keeps Month Standard-only and never threads a Docked presentation', () => {
    const element = WIDGET_RENDERERS.monthCal({ canvasSize: 'standard', docked: true }) as ReactElement<{
      canvasSize?: CanvasSize
      docked?: boolean
    }>
    expect(element.props.canvasSize).toBe('standard')
    expect(element.props.docked).toBeUndefined()
  })

  it.each(['sun', 'moon', 'habits', 'timer', 'tasks', 'notes'] as const)(
    'threads the exact canvasSize to %s',
    (id) => {
      const element = WIDGET_RENDERERS[id]({ canvasSize: 'compact' }) as ReactElement<{ canvasSize?: CanvasSize }>
      expect(element.props.canvasSize).toBe('compact')
    },
  )

  it.each(['sun', 'moon', 'habits', 'timer', 'tasks', 'notes'] as const)(
    'preserves the Docked branch for %s while threading presentation props',
    (id) => {
      const element = WIDGET_RENDERERS[id]({ canvasSize: 'compact', docked: true }) as ReactElement<{
        canvasSize?: CanvasSize
        docked?: boolean
      }>
      expect(element.props.docked).toBe(true)
    },
  )
})
