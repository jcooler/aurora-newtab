import type { ReactElement } from 'react'
import { describe, expect, expectTypeOf, it } from 'vitest'
import type { CanvasSize } from '../lib/layout/canvasTypes'
import indexCss from './index.css?raw'
import { WIDGET_RENDERERS, type WidgetPresentationMode, type WidgetRendererProps } from './widgetRenderers'

describe('time and productivity widget renderers', () => {
  it('exposes one explicit free, stack, or docked presentation context', () => {
    expectTypeOf<WidgetRendererProps['presentation']>().toEqualTypeOf<WidgetPresentationMode | undefined>()
  })

  it.each(['clock', 'worldClocks', 'countdown', 'search', 'focus', 'links', 'quote', 'habits', 'timer', 'tasks', 'notes'] as const)(
    'threads stack presentation through the %s renderer',
    (id) => {
      const element = WIDGET_RENDERERS[id]({ canvasSize: 'standard', presentation: 'stack' }) as ReactElement<{
        canvasSize?: CanvasSize
        presentation?: WidgetPresentationMode
      }>
      expect(element.props.canvasSize).toBe('standard')
      expect(element.props.presentation).toBe('stack')
    },
  )

  it.each(['clock', 'worldClocks', 'countdown', 'search', 'focus', 'links', 'quote'] as const)(
    'uses the approved redesigned %s face on the standalone canvas',
    (id) => {
      const element = WIDGET_RENDERERS[id]({ canvasSize: 'standard', presentation: 'free' }) as ReactElement<{
        canvasSize?: CanvasSize
        presentation?: WidgetPresentationMode
      }>
      expect(element.props.canvasSize).toBe('standard')
      expect(element.props.presentation).toBe('stack')
    },
  )

  it('keeps Greeting and Bookmarks on their established intrinsic renderers', () => {
    const greeting = WIDGET_RENDERERS.greeting({ canvasSize: 'compact', presentation: 'stack' }) as ReactElement<{
      canvasSize?: CanvasSize
      presentation?: WidgetPresentationMode
    }>
    const bookmarks = WIDGET_RENDERERS.bookmarks({ canvasSize: 'standard', presentation: 'stack', docked: true }) as ReactElement<{
      canvasSize?: CanvasSize
      presentation?: WidgetPresentationMode
      docked?: boolean
    }>
    expect(greeting.props.canvasSize).toBeUndefined()
    expect(greeting.props.presentation).toBeUndefined()
    expect(bookmarks.props.canvasSize).toBe('standard')
    expect(bookmarks.props.presentation).toBeUndefined()
    expect(bookmarks.props.docked).toBeUndefined()
  })

  it('lets redesigned Standard Quote and Quick Links frames own their exact width', () => {
    expect(indexCss).toMatch(/\.canvas-item\[data-canvas-size="standard"\]:not\(\[data-canvas-mode="docked"\]\):is\([\s\S]*?\) > :not\(\.tier-frame\)\s*\{/)
    expect(indexCss).not.toMatch(/\.canvas-item\[data-canvas-size="standard"\]:not\(\[data-canvas-mode="docked"\]\):is\([\s\S]*?\) > \*\s*\{/)
    expect(indexCss).not.toMatch(/\[data-block-id="links"\] > section(?!:not\(\.tier-frame\))/)
  })

  it('keeps Month Standard-only and never threads a Docked presentation', () => {
    const element = WIDGET_RENDERERS.monthCal({ canvasSize: 'standard', docked: true }) as ReactElement<{
      canvasSize?: CanvasSize
      docked?: boolean
    }>
    expect(element.props.canvasSize).toBe('standard')
    expect(element.props.docked).toBeUndefined()
  })

  it('threads the active layout id to the canonical Calendar renderer', () => {
    const element = WIDGET_RENDERERS.ics({ canvasSize: 'standard', layoutId: 'work' }) as ReactElement<{
      canvasSize?: CanvasSize
      layoutId?: string
    }>
    expect(element.props.canvasSize).toBe('standard')
    expect(element.props.layoutId).toBe('work')
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
