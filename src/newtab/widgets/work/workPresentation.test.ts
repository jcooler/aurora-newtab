import { describe, expect, it } from 'vitest'
import { compactFacts, workPresentationState, workRowClass } from './workPresentation'

describe('workPresentation', () => {
  it('derives every truthful resource state without treating retained data as a hard failure', () => {
    expect(workPresentationState(false, { operation: 'idle', freshness: 'unknown', hasData: false }, false)).toBe('setup')
    expect(workPresentationState(true, { operation: 'pending', freshness: 'unknown', hasData: false }, false)).toBe('loading')
    expect(workPresentationState(true, { operation: 'error', freshness: 'unknown', hasData: false }, false)).toBe('hard-error')
    expect(workPresentationState(true, { operation: 'error', freshness: 'fresh', hasData: true }, false)).toBe('retained-error')
    expect(workPresentationState(true, { operation: 'success', freshness: 'stale', hasData: true }, false)).toBe('stale')
    expect(workPresentationState(true, { operation: 'success', freshness: 'fresh', hasData: true }, true)).toBe('empty')
    expect(workPresentationState(true, { operation: 'success', freshness: 'fresh', hasData: true }, false)).toBe('ready')
  })

  it('drops empty dock facts instead of reserving whitespace', () => {
    expect(compactFacts(['3 assigned', '', null, false, '1 due'])).toEqual(['3 assigned', '1 due'])
    expect(compactFacts(['', null, undefined, false])).toEqual([])
  })

  it('keeps metadata soft at rest and legible on row hover or keyboard focus', () => {
    expect(workRowClass).toContain('text-fg-muted')
    expect(workRowClass).toContain('group-hover:text-fg')
    expect(workRowClass).toContain('group-focus-within:text-fg')
  })
})
