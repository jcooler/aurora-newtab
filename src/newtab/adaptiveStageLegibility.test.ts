import { describe, expect, it } from 'vitest'
import indexCss from './index.css?raw'

function declarationBlock(selector: string): string {
  const start = indexCss.indexOf(`${selector} {`)
  expect(start, `missing selector ${selector}`).toBeGreaterThanOrEqual(0)
  const open = indexCss.indexOf('{', start)
  const close = indexCss.indexOf('}', open)
  expect(open).toBeGreaterThan(start)
  expect(close).toBeGreaterThan(open)
  return indexCss.slice(open + 1, close)
}

function lastDeclarationBlock(selector: string): string {
  const start = indexCss.lastIndexOf(`${selector} {`)
  expect(start, `missing selector ${selector}`).toBeGreaterThanOrEqual(0)
  const open = indexCss.indexOf('{', start)
  const close = indexCss.indexOf('}', open)
  expect(open).toBeGreaterThan(start)
  expect(close).toBeGreaterThan(open)
  return indexCss.slice(open + 1, close)
}

describe('Retired stage presentation must not restyle live Canvas bookmarks', () => {
  it('keeps no stage-variant bookmark rules that hide labels or force mark circles', () => {
    // These retired Adaptive Stage rules fired on the live Canvas because
    // CanvasItem emits canvas-item with data-canvas-size (the board-item and
    // With a compact-size bookmarks placement they hid every chip label at
    // ANY viewport width — the owner's 1408px-wide window showed only
    // ambiguous mark circles. Label collapse belongs to the `compact:`
    // width media variant alone (index.css, viewport width <= 720px).
    expect(indexCss).not.toContain('[data-stage-variant="compact"][data-block-id="bookmarks"]')
  })

  it('maps the CSS profile mirror by width only, never by viewport height', () => {
    // The JS selector no longer sends short-height desktop windows to the
    // phone document; the legacy harness cross-checks --stage-css-profile,
    // so the media mirror must agree.
    expect(indexCss).not.toMatch(/@media \(max-height: 699px\)[^\n]*--stage-css-profile: compact/)
  })
})

describe('Retired stage machinery is deleted, not merely unreachable (NL-P2)', () => {
  it('no adaptive-stage, stage-zone, signal-dock, launcher-shelf, or board-item selector survives', () => {
    // These families were scoped under root classes no component has emitted
    // since the Canvas replaced the Adaptive Stage — vacuous at runtime, but
    // still restyling risk the moment a class name collides (the owner's
    // one-letter-bookmarks defect was exactly that). Named-layouts spec §3
    // deletes them once unreferenced; this pins the deletion.
    for (const token of ['.adaptive-stage', '.stage-zone', 'data-signal-dock', 'launcher-shelf', 'board-item', 'data-stage-variant']) {
      expect(indexCss, `retired token ${token} still present`).not.toContain(token)
    }
    // Nothing establishes a size container on the canvas anymore (inline-size
    // containment zeroes a max-content wrapper), so container queries and
    // container-relative units would be dead or viewport-fallback lies.
    for (const token of ['@container', 'cqi']) {
      expect(indexCss, `orphaned container token ${token} still present`).not.toContain(token)
    }
  })

  it('the formerly stage-var-driven control minimums are now literal 36px floors', () => {
    // --stage-control-target only ever existed as an inline root style the
    // retired stage JS wrote, and useCanvasViewport deletes those properties
    // at boot — so every var() reference resolved to invalid-at-computed-
    // value and the declared minimums silently never applied. NL-P2
    // materializes the documented 36px control floor instead.
    expect(indexCss).not.toContain('var(--stage-control-target)')
  })

  it('fits the unconfigured Weather controls inside a compact finite allocation', () => {
    const wrapper = declarationBlock('.canvas-item[data-canvas-size="compact"][data-block-id="weather"] > section:has(input[aria-label="Search for a city"]) > div')
    expect(wrapper).toMatch(/padding:\s*4px\s*;/)
    expect(lastDeclarationBlock('.canvas-item[data-canvas-size="compact"][data-block-id="weather"] > section:has(input[aria-label="Search for a city"]) > div'))
      .toMatch(/padding-inline:\s*48px\s*;/)
    expect(declarationBlock('.canvas-item[data-canvas-size="compact"][data-block-id="weather"] > section:has(input[aria-label="Search for a city"]) > div > div > div'))
      .toMatch(/flex-direction:\s*column\s*;/)
    expect(declarationBlock('.canvas-item[data-canvas-size="compact"][data-block-id="weather"] [data-location-label="full"]'))
      .toMatch(/display:\s*none\s*;/)
    expect(declarationBlock('.canvas-item[data-canvas-size="compact"][data-block-id="weather"] [data-location-label="compact"]'))
      .toMatch(/display:\s*inline\s*;/)
  })

  it('keeps compact Canvas Weather condition, location, and disclosure visible', () => {
    const summary = declarationBlock('.canvas-item[data-canvas-size="compact"][data-block-id="weather"]:not(.z-30) > section > button > span')
    expect(summary).toMatch(/flex-wrap:\s*wrap\s*;/)
    const condition = declarationBlock('.canvas-item[data-canvas-size="compact"][data-block-id="weather"]:not(.z-30) > section > button > span > span:nth-child(3)')
    expect(condition).toMatch(/flex-basis:\s*100%\s*;/)
    expect(indexCss).not.toMatch(/span:nth-child\(3\),\s*\.board-item\[data-stage-variant="compact"\]\[data-block-id="weather"\]:not\(\.z-30\) > section > button > span > svg:last-child\s*\{\s*display:\s*none\s*;/)
  })

  it('keeps the open compact Weather setup in semantic flow at emergency heights', () => {
    const declarations = declarationBlock('.canvas-item[data-block-id="weather"].z-30')
    expect(declarations).toMatch(/position:\s*relative\s*;/)
    expect(declarations).toMatch(/inset:\s*auto\s*;/)
    expect(declarations).not.toMatch(/position:\s*fixed\s*;/)
  })

  it.each([
    '.canvas-item[data-canvas-size="compact"][data-block-id="links"] > section > div > span',
    '.canvas-item[data-canvas-size="compact"][data-block-id="homeassistant"] button[aria-label^="Run "]',
    '.canvas-item[data-canvas-size="compact"][data-block-id="crypto"] > section > div > span',
    '.canvas-item[data-canvas-size="compact"][data-block-id="monthCal"] td span:first-child',
    '.canvas-item[data-canvas-size="compact"][data-block-id="monthCal"] [data-monthcal-label]',
  ])('keeps ordinary glance text at the 14px floor for %s', (selector) => {
    expect(declarationBlock(selector)).toMatch(/font-size:\s*14px\s*;/)
  })

  it.each([
    '.canvas-item[data-canvas-size="compact"][data-block-id="monthCal"] [data-monthcal-header] > button',
    '.canvas-item[data-canvas-size="compact"][data-block-id="habits"] > div > button',
  ])('keeps routine controls on the resolved density target for %s', (selector) => {
    const declarations = declarationBlock(selector)
    expect(declarations).toMatch(/min-width:\s*36px\s*;/)
    expect(declarations).toMatch(/min-height:\s*36px\s*;/)
  })

  it('removes compact Month padding so complete controls own the finite track', () => {
    expect(declarationBlock('.canvas-item[data-canvas-size="compact"][data-block-id="monthCal"] > div'))
      .toMatch(/padding:\s*0\s*;/)
  })

  it('uses an accessible compact Month label and a complete seven-day week', () => {
    const row = declarationBlock('.canvas-item[data-canvas-size="compact"][data-block-id="monthCal"] [data-monthcal-header] > span')
    expect(row).toMatch(/display:\s*grid\s*;/)
    expect(row).toMatch(/grid-template-columns:\s*minmax\(0,\s*1fr\) auto\s*;/)
    expect(row).toMatch(/gap:\s*0\s*;/)
    expect(row).toMatch(/width:\s*100%\s*;/)
    expect(row).toMatch(/min-height:\s*36px\s*;/)
    const label = declarationBlock('.canvas-item[data-canvas-size="compact"][data-block-id="monthCal"] [data-monthcal-label]')
    expect(label).toMatch(/min-width:\s*0\s*;/)
    expect(label).toMatch(/white-space:\s*nowrap\s*;/)
    expect(label).toMatch(/overflow:\s*visible\s*;/)
    expect(label).toMatch(/text-overflow:\s*clip\s*;/)
    expect(label).toMatch(/line-height:\s*20px\s*;/)
    expect(declarationBlock('.canvas-item[data-canvas-size="compact"][data-block-id="monthCal"] [data-monthcal-label-full]'))
      .toMatch(/display:\s*none\s*;/)
    expect(declarationBlock('.canvas-item[data-canvas-size="compact"][data-block-id="monthCal"] [data-monthcal-label-short]::before'))
      .toMatch(/content:\s*attr\(data-label\)\s*;/)
    expect(declarationBlock('.canvas-item[data-canvas-size="compact"][data-block-id="monthCal"] table'))
      .toMatch(/margin-top:\s*0\s*;/)
    expect(indexCss).not.toContain('.canvas-item[data-canvas-size="compact"][data-block-id="monthCal"] tbody tr > td:nth-child(n + 5) {')
    expect(indexCss).not.toMatch(/data-block-id="monthCal"\][\s\S]*grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)/)
  })

  // The <72px Month action-stacking and its @container siblings were
  // emergency-fit rules for the deleted imposed boxes; with content-tight
  // wrappers and no size container they could never match and are deleted
  // (the orphaned-container-token check above pins that). The NL-P5 tier
  // catalog owns any designed tiny-tier Month composition.

  it.each(['compact', 'standard'] as const)('condenses %s Crypto only on the Board, never in Dock', (variant) => {
    const firstHiddenCell = variant === 'compact' ? 2 : 3
    const dockExemptSelector = `.canvas-item[data-canvas-size="${variant}"]:not([data-canvas-mode="docked"])[data-block-id="crypto"] > section > div > span:nth-child(n + ${firstHiddenCell})`
    expect(declarationBlock(dockExemptSelector)).toMatch(/display:\s*none\s*;/)
    expect(indexCss).not.toContain(
      `.canvas-item[data-canvas-size="${variant}"][data-block-id="crypto"] > section > div > span:nth-child(n + ${firstHiddenCell}) {`,
    )
  })

  it('stacks complete 14px Board Crypto values inside their finite one-track allocation', () => {
    expect(declarationBlock('.canvas-item:not([data-canvas-mode="docked"])[data-block-id="crypto"] > section > div'))
      .toMatch(/flex-direction:\s*column\s*;/)
    const cell = declarationBlock('.canvas-item:not([data-canvas-mode="docked"])[data-block-id="crypto"] > section > div > span')
    expect(cell).toMatch(/display:\s*grid\s*;/)
    expect(cell).toMatch(/line-height:\s*20px\s*;/)
  })

  it('gives untruncated Dock Crypto glyphs a complete 20px line box without changing its row layout', () => {
    const dockCell = declarationBlock('.canvas-item[data-canvas-mode="docked"][data-block-id="crypto"] > section > div > span')
    expect(dockCell).toMatch(/line-height:\s*20px\s*;/)
    expect(dockCell).not.toMatch(/display:\s*grid/)
  })

  it('caps only the compact finite Board Clock by the short viewport block size', () => {
    const clock = declarationBlock('.canvas-item[data-canvas-size="compact"]:not([data-canvas-mode="docked"])[data-block-id="clock"] time')
    expect(clock).toMatch(/font-size:\s*min\(var\(--clock-font\),\s*17vh\)\s*;/)
  })
})
