// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { StageAllocation } from '../../lib/layout/adaptiveStage'
import { WIDGET_REGISTRY } from '../widgetRegistry'
import BoardItem from './BoardItem'

function allocation(overrides: Partial<StageAllocation> = {}): StageAllocation {
  return {
    id: 'weather', zone: 'day', order: 0, variant: 'standard', priority: 'automatic',
    colSpan: 2, rowSpan: 2,
    rect: { colStart: 1, rowStart: 1, colSpan: 2, rowSpan: 2 },
    ...overrides,
  }
}

const weather = WIDGET_REGISTRY.find((row) => row.id === 'weather')!
const search = WIDGET_REGISTRY.find((row) => row.id === 'search')!
const focus = WIDGET_REGISTRY.find((row) => row.id === 'focus')!
const links = WIDGET_REGISTRY.find((row) => row.id === 'links')!
const bookmarks = WIDGET_REGISTRY.find((row) => row.id === 'bookmarks')!
const monthCal = WIDGET_REGISTRY.find((row) => row.id === 'monthCal')!
const greeting = WIDGET_REGISTRY.find((row) => row.id === 'greeting')!
const quote = WIDGET_REGISTRY.find((row) => row.id === 'quote')!
const rss = WIDGET_REGISTRY.find((row) => row.id === 'rss')!
const crypto = WIDGET_REGISTRY.find((row) => row.id === 'crypto')!
const ics = WIDGET_REGISTRY.find((row) => row.id === 'ics')!
const github = WIDGET_REGISTRY.find((row) => row.id === 'github')!
const gitlab = WIDGET_REGISTRY.find((row) => row.id === 'gitlab')!
const jira = WIDGET_REGISTRY.find((row) => row.id === 'jira')!
const homeassistant = WIDGET_REGISTRY.find((row) => row.id === 'homeassistant')!
const status = WIDGET_REGISTRY.find((row) => row.id === 'status')!
const vercel = WIDGET_REGISTRY.find((row) => row.id === 'vercel')!

describe('BoardItem', () => {
  it('owns semantic data attributes, finite CSS spans, container semantics, and child rendering', () => {
    render(
      <BoardItem entry={weather} allocation={allocation()} profile="standard">
        <button type="button">Weather action</button>
      </BoardItem>,
    )
    const item = document.querySelector('[data-block-id="weather"]') as HTMLElement
    expect(item.getAttribute('data-block-id')).toBe('weather')
    expect(item.getAttribute('data-stage-profile')).toBe('standard')
    expect(item.getAttribute('data-stage-zone')).toBe('day')
    expect(item.getAttribute('data-stage-variant')).toBe('standard')
    expect(item.getAttribute('data-stage-priority')).toBe('automatic')
    expect(item.classList.contains('board-item')).toBe(true)
    expect(item.classList.contains('board-item--day')).toBe(true)
    expect(item.style.getPropertyValue('--board-col-span')).toBe('2')
    expect(item.style.getPropertyValue('--board-row-span')).toBe('2')
    expect(item.style.gridColumn).toBe('1 / span 2')
    expect(item.style.gridRow).toBe('1 / span 2')
    expect(item.style.containerType).toBe('inline-size')
    expect(screen.getByRole('button', { name: 'Weather action' })).toBeTruthy()
  })

  it('flows from planner order while retaining its finite planner spans', () => {
    render(
      <BoardItem entry={weather} allocation={allocation()} profile="standard" placement="flow">
        content
      </BoardItem>,
    )
    const item = document.querySelector('[data-block-id="weather"]') as HTMLElement
    expect(item.style.getPropertyValue('--board-col-span')).toBe('2')
    expect(item.style.getPropertyValue('--board-row-span')).toBe('2')
    expect(item.style.gridColumn).toBe('span 2')
    expect(item.style.gridRow).toBe('span 2')
  })

  it('keeps malformed board/Dock span inputs finite with inline container ownership and explicit Dock sizing', () => {
    const { rerender } = render(
      <BoardItem entry={weather} allocation={allocation({ zone: 'dock', colSpan: Infinity, rowSpan: NaN, rect: null })} profile="compact">
        content
      </BoardItem>,
    )
    let item = document.querySelector('[data-block-id="weather"]') as HTMLElement
    expect(item.style.getPropertyValue('--board-col-span')).toBe('1')
    expect(item.style.getPropertyValue('--board-row-span')).toBe('1')
    expect(item.style.gridColumn).toBe('span 1')
    expect(item.style.gridRow).toBe('span 1')
    expect(item.style.containerType).toBe('inline-size')
    expect(item.style.inlineSize).toBe('var(--stage-track-min)')

    rerender(
      <BoardItem entry={weather} allocation={allocation({ colSpan: -2.5, rowSpan: 4.8 })} profile="display">
        content
      </BoardItem>,
    )
    item = document.querySelector('[data-block-id="weather"]') as HTMLElement
    expect(item.style.getPropertyValue('--board-col-span')).toBe('1')
    expect(item.style.getPropertyValue('--board-row-span')).toBe('4')
    expect(item.style.position).toBe('')
    expect(item.style.transform).toBe('')
    expect(item.style.contain).toBe('')
  })

  it('sizes a finite multi-track Dock item from its normalized span, track, and gaps', () => {
    render(
      <BoardItem entry={weather} allocation={allocation({ zone: 'dock', colSpan: 3, rowSpan: 1, rect: null })} profile="display">
        content
      </BoardItem>,
    )
    const item = document.querySelector('[data-block-id="weather"]') as HTMLElement
    expect(item.style.containerType).toBe('inline-size')
    expect(item.style.inlineSize).toBe(
      'calc(var(--stage-track-min) + var(--stage-track-min) + var(--stage-track-min) + var(--stage-gap) + var(--stage-gap))',
    )
  })

  it('uses a local current-renderer compatibility floor without multiplying it by Dock span', () => {
    render(
      <BoardItem entry={search} allocation={allocation({ id: 'search', zone: 'dock', colSpan: 2, rowSpan: 1, rect: null })} profile="standard">
        content
      </BoardItem>,
    )
    const item = document.querySelector('[data-block-id="search"]') as HTMLElement
    expect(item.style.containerType).toBe('inline-size')
    expect(item.style.inlineSize).toBe(
      'max(calc(var(--stage-track-min) + var(--stage-track-min) + var(--stage-gap)), 20rem)',
    )
  })

  it('publishes the measured inline floors that keep the current Focus and Links Dock renderers on one row', () => {
    const { rerender } = render(
      <BoardItem entry={focus} allocation={allocation({ id: 'focus', zone: 'dock', colSpan: 1, rowSpan: 1, rect: null })} profile="compact">
        content
      </BoardItem>,
    )
    let item = document.querySelector('[data-block-id="focus"]') as HTMLElement
    expect(item.style.inlineSize).toBe('max(var(--stage-track-min), 15rem)')

    rerender(
      <BoardItem entry={links} allocation={allocation({ id: 'links', zone: 'dock', colSpan: 1, rowSpan: 1, rect: null })} profile="compact">
        content
      </BoardItem>,
    )
    item = document.querySelector('[data-block-id="links"]') as HTMLElement
    expect(item.style.inlineSize).toBe('max(var(--stage-track-min), 5rem)')
  })

  it('publishes variant-aware Bookmarks Dock floors that contain all nine visible chips', () => {
    const { rerender } = render(
      <BoardItem entry={bookmarks} allocation={allocation({ id: 'bookmarks', zone: 'dock', variant: 'compact', colSpan: 1, rowSpan: 1, rect: null })} profile="compact">
        content
      </BoardItem>,
    )
    let item = document.querySelector('[data-block-id="bookmarks"]') as HTMLElement
    expect(item.style.inlineSize).toBe('max(var(--stage-track-min), 26.375rem)')

    rerender(
      <BoardItem entry={bookmarks} allocation={allocation({ id: 'bookmarks', zone: 'dock', variant: 'standard', colSpan: 2, rowSpan: 1, rect: null })} profile="standard">
        content
      </BoardItem>,
    )
    item = document.querySelector('[data-block-id="bookmarks"]') as HTMLElement
    expect(item.style.inlineSize).toBe(
      'max(calc(var(--stage-track-min) + var(--stage-track-min) + var(--stage-gap)), 63.0625rem)',
    )

    rerender(
      <BoardItem entry={bookmarks} allocation={allocation({ id: 'bookmarks', zone: 'dock', variant: 'expanded', colSpan: 3, rowSpan: 1, rect: null })} profile="display">
        content
      </BoardItem>,
    )
    item = document.querySelector('[data-block-id="bookmarks"]') as HTMLElement
    expect(item.style.inlineSize).toBe(
      'max(calc(var(--stage-track-min) + var(--stage-track-min) + var(--stage-track-min) + var(--stage-gap) + var(--stage-gap)), 63.0625rem)',
    )
  })

  it('contains the current fixed-width Month Calendar card when it moves to the Dock', () => {
    render(
      <BoardItem entry={monthCal} allocation={allocation({ id: 'monthCal', zone: 'dock', colSpan: 1, rowSpan: 1, rect: null })} profile="compact">
        content
      </BoardItem>,
    )
    const item = document.querySelector('[data-block-id="monthCal"]') as HTMLElement
    expect(item.style.inlineSize).toBe('max(var(--stage-track-min), 12.5rem)')
  })

  it('keeps the current compact time-of-day Greeting readable when it moves to the Dock', () => {
    render(
      <BoardItem entry={greeting} allocation={allocation({ id: 'greeting', zone: 'dock', colSpan: 1, rowSpan: 1, rect: null })} profile="compact">
        content
      </BoardItem>,
    )
    const item = document.querySelector('[data-block-id="greeting"]') as HTMLElement
    expect(item.style.inlineSize).toBe('max(var(--stage-track-min), 12rem)')
  })

  it('keeps a Docked quote at a readable line measure', () => {
    render(
      <BoardItem entry={quote} allocation={allocation({ id: 'quote', zone: 'dock', colSpan: 1, rowSpan: 1, rect: null })} profile="standard">
        content
      </BoardItem>,
    )
    const item = document.querySelector('[data-block-id="quote"]') as HTMLElement
    expect(item.style.inlineSize).toBe('max(var(--stage-track-min), 14rem)')
  })

  it.each([
    ics, status, github, gitlab, jira, vercel, homeassistant, rss, crypto,
  ] as const)('uses the intentional compact Signal Dock floor for connector %s', (entry) => {
    render(
      <BoardItem entry={entry} allocation={allocation({ id: entry.id, zone: 'dock', colSpan: 1, rowSpan: 1, rect: null })} profile="compact">
        content
      </BoardItem>,
    )
    const item = document.querySelector(`[data-block-id="${entry.id}"]`) as HTMLElement
    expect(item.style.inlineSize).toBe('max(var(--stage-track-min), 14rem)')
  })
})
