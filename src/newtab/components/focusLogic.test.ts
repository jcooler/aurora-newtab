import { describe, expect, it } from 'vitest'
import { currentFocus, setFocusText } from './focusLogic'

describe('currentFocus', () => {
  it('returns the focus when it is from today', () => {
    const f = { text: 'Ship it', date: '2026-07-26', done: false }
    expect(currentFocus(f, '2026-07-26')).toEqual(f)
  })
  it('drops a stale focus from a previous day', () => {
    expect(currentFocus({ text: 'Old', date: '2026-07-25', done: true }, '2026-07-26')).toBeNull()
  })
  it('handles null', () => {
    expect(currentFocus(null, '2026-07-26')).toBeNull()
  })
})

describe('setFocusText', () => {
  it('creates an undone focus for today from trimmed text', () => {
    expect(setFocusText('  Ship it  ', '2026-07-26')).toEqual({
      text: 'Ship it',
      date: '2026-07-26',
      done: false,
    })
  })
  it('clears the focus when the text is blank', () => {
    expect(setFocusText('   ', '2026-07-26')).toBeNull()
  })
})
