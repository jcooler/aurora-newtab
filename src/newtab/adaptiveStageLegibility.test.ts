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
    // CanvasItem still emits the board-item class and data-stage-variant.
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

describe('Adaptive Stage compact legibility contract', () => {
  it('sizes every persistent stage action from the resolved control target', () => {
    expect(indexCss).toMatch(/\.adaptive-stage \.settings-gear,\s*\.adaptive-stage \.utility-tray-trigger,\s*\.adaptive-stage button\[aria-label="New background photo"\]\s*\{/)
    const declarations = declarationBlock('.adaptive-stage button[aria-label="New background photo"]')
    expect(declarations).toMatch(/inline-size:\s*var\(--stage-control-target\)\s*;/)
    expect(declarations).toMatch(/block-size:\s*var\(--stage-control-target\)\s*;/)
  })

  it('fits the unconfigured Weather controls inside a compact finite allocation', () => {
    const wrapper = declarationBlock('.board-item[data-stage-variant="compact"][data-block-id="weather"] > section:has(input[aria-label="Search for a city"]) > div')
    expect(wrapper).toMatch(/padding:\s*4px\s*;/)
    expect(lastDeclarationBlock('.board-item[data-stage-variant="compact"][data-block-id="weather"] > section:has(input[aria-label="Search for a city"]) > div'))
      .toMatch(/padding-inline:\s*48px\s*;/)
    expect(declarationBlock('.board-item[data-stage-variant="compact"][data-block-id="weather"] > section:has(input[aria-label="Search for a city"]) > div > div > div'))
      .toMatch(/flex-direction:\s*column\s*;/)
    expect(declarationBlock('.board-item[data-stage-variant="compact"][data-block-id="weather"] [data-location-label="full"]'))
      .toMatch(/display:\s*none\s*;/)
    expect(declarationBlock('.board-item[data-stage-variant="compact"][data-block-id="weather"] [data-location-label="compact"]'))
      .toMatch(/display:\s*inline\s*;/)
  })

  it('keeps compact Canvas Weather condition, location, and disclosure visible', () => {
    const summary = declarationBlock('.board-item[data-stage-variant="compact"][data-block-id="weather"]:not(.z-30) > section > button > span')
    expect(summary).toMatch(/flex-wrap:\s*wrap\s*;/)
    const condition = declarationBlock('.board-item[data-stage-variant="compact"][data-block-id="weather"]:not(.z-30) > section > button > span > span:nth-child(3)')
    expect(condition).toMatch(/flex-basis:\s*100%\s*;/)
    expect(indexCss).not.toMatch(/span:nth-child\(3\),\s*\.board-item\[data-stage-variant="compact"\]\[data-block-id="weather"\]:not\(\.z-30\) > section > button > span > svg:last-child\s*\{\s*display:\s*none\s*;/)
  })

  it('sizes the Stage grid to the padded viewport and lets a content-tall first row push Dock into Stage scroll', () => {
    const declarations = declarationBlock('.adaptive-stage__grid')
    expect(declarations).toMatch(/height:\s*calc\(100dvh - var\(--stage-inset\) - var\(--stage-inset\)\)\s*;/)
    expect(declarations).toMatch(/min-height:\s*0\s*;/)
    expect(declarations).toMatch(/grid-template-rows:\s*minmax\(max-content,\s*1fr\) auto\s*;/)
  })

  it('keeps the open compact Weather setup in semantic flow at emergency heights', () => {
    const declarations = declarationBlock('.board-item[data-block-id="weather"].z-30')
    expect(declarations).toMatch(/position:\s*relative\s*;/)
    expect(declarations).toMatch(/inset:\s*auto\s*;/)
    expect(declarations).not.toMatch(/position:\s*fixed\s*;/)
  })

  it.each([
    '.board-item[data-stage-variant="compact"][data-block-id="links"] > section > div > span',
    '.board-item[data-stage-variant="compact"][data-block-id="homeassistant"] button[aria-label^="Run "]',
    '.board-item[data-stage-variant="compact"][data-block-id="crypto"] > section > div > span',
    '.board-item[data-stage-variant="compact"][data-block-id="monthCal"] td span:first-child',
    '.board-item[data-stage-variant="compact"][data-block-id="monthCal"] [data-monthcal-label]',
  ])('keeps ordinary glance text at the 14px floor for %s', (selector) => {
    expect(declarationBlock(selector)).toMatch(/font-size:\s*14px\s*;/)
  })

  it.each([
    '.board-item[data-stage-variant="compact"][data-block-id="monthCal"] [data-monthcal-header] > button',
    '.board-item[data-stage-variant="compact"][data-block-id="habits"] > div > button',
  ])('keeps routine controls on the resolved density target for %s', (selector) => {
    const declarations = declarationBlock(selector)
    expect(declarations).toMatch(/min-width:\s*var\(--stage-control-target\)\s*;/)
    expect(declarations).toMatch(/min-height:\s*var\(--stage-control-target\)\s*;/)
  })

  it('removes compact Month padding so complete controls own the finite track', () => {
    expect(declarationBlock('.board-item[data-stage-variant="compact"][data-block-id="monthCal"] > div'))
      .toMatch(/padding:\s*0\s*;/)
  })

  it('uses an accessible compact Month label and a complete seven-day week', () => {
    const row = declarationBlock('.board-item[data-stage-variant="compact"][data-block-id="monthCal"] [data-monthcal-header] > span')
    expect(row).toMatch(/display:\s*grid\s*;/)
    expect(row).toMatch(/grid-template-columns:\s*minmax\(0,\s*1fr\) auto\s*;/)
    expect(row).toMatch(/gap:\s*0\s*;/)
    expect(row).toMatch(/width:\s*100%\s*;/)
    expect(row).toMatch(/min-height:\s*var\(--stage-control-target\)\s*;/)
    const label = declarationBlock('.board-item[data-stage-variant="compact"][data-block-id="monthCal"] [data-monthcal-label]')
    expect(label).toMatch(/min-width:\s*0\s*;/)
    expect(label).toMatch(/white-space:\s*nowrap\s*;/)
    expect(label).toMatch(/overflow:\s*visible\s*;/)
    expect(label).toMatch(/text-overflow:\s*clip\s*;/)
    expect(label).toMatch(/line-height:\s*20px\s*;/)
    expect(declarationBlock('.board-item[data-stage-variant="compact"][data-block-id="monthCal"] [data-monthcal-label-full]'))
      .toMatch(/display:\s*none\s*;/)
    expect(declarationBlock('.board-item[data-stage-variant="compact"][data-block-id="monthCal"] [data-monthcal-label-short]::before'))
      .toMatch(/content:\s*attr\(data-label\)\s*;/)
    expect(declarationBlock('.board-item[data-stage-variant="compact"][data-block-id="monthCal"] table'))
      .toMatch(/margin-top:\s*0\s*;/)
    expect(indexCss).not.toContain('.board-item[data-stage-variant="compact"][data-block-id="monthCal"] tbody tr > td:nth-child(n + 5) {')
    expect(indexCss).not.toMatch(/data-block-id="monthCal"\][\s\S]*grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)/)
  })

  it('stacks all compact Month actions in a complete target column below two target widths', () => {
    expect(indexCss).toContain('@container (inline-size < 72px)')
    const header = lastDeclarationBlock('.board-item[data-stage-variant="compact"][data-block-id="monthCal"] [data-monthcal-header]')
    expect(header).toMatch(/display:\s*grid\s*;/)
    expect(header).toMatch(/grid-template-columns:\s*var\(--stage-control-target\) minmax\(0,\s*1fr\)\s*;/)
    expect(header).toMatch(/grid-template-rows:\s*repeat\(3,\s*var\(--stage-control-target\)\)\s*;/)
    expect(lastDeclarationBlock('.board-item[data-stage-variant="compact"][data-block-id="monthCal"] [data-monthcal-header] > span'))
      .toMatch(/display:\s*contents\s*;/)
    expect(declarationBlock('.board-item[data-stage-variant="compact"][data-block-id="monthCal"] [data-monthcal-header] button[aria-label="Back to today"]'))
      .toMatch(/grid-row:\s*3\s*;/)
  })

  it.each(['compact', 'standard'] as const)('condenses %s Crypto only on the Board, never in Dock', (variant) => {
    const firstHiddenCell = variant === 'compact' ? 2 : 3
    const dockExemptSelector = `.board-item[data-stage-variant="${variant}"]:not(.board-item--dock)[data-block-id="crypto"] > section > div > span:nth-child(n + ${firstHiddenCell})`
    expect(declarationBlock(dockExemptSelector)).toMatch(/display:\s*none\s*;/)
    expect(indexCss).not.toContain(
      `.board-item[data-stage-variant="${variant}"][data-block-id="crypto"] > section > div > span:nth-child(n + ${firstHiddenCell}) {`,
    )
  })

  it('stacks complete 14px Board Crypto values inside their finite one-track allocation', () => {
    expect(declarationBlock('.board-item:not(.board-item--dock)[data-block-id="crypto"] > section > div'))
      .toMatch(/flex-direction:\s*column\s*;/)
    const cell = declarationBlock('.board-item:not(.board-item--dock)[data-block-id="crypto"] > section > div > span')
    expect(cell).toMatch(/display:\s*grid\s*;/)
    expect(cell).toMatch(/line-height:\s*20px\s*;/)
  })

  it('gives untruncated Dock Crypto glyphs a complete 20px line box without changing its row layout', () => {
    const dockCell = declarationBlock('.board-item.board-item--dock[data-block-id="crypto"] > section > div > span')
    expect(dockCell).toMatch(/line-height:\s*20px\s*;/)
    expect(dockCell).not.toMatch(/display:\s*grid/)
  })

  it('reserves readable edge tracks for Weather metadata and unit glyphs at narrow Stage widths', () => {
    const grid = declarationBlock('.adaptive-stage .board-item[data-block-id="weather"] [data-weather-hourly-grid]')
    expect(grid).toMatch(/grid-template-columns:\s*minmax\(29px,\s*1fr\) repeat\(4,\s*minmax\(0,\s*1fr\)\) minmax\(29px,\s*1fr\)\s*;/)
  })

  it('fits the compact Vercel summary and one complete action in its finite Board row', () => {
    const section = declarationBlock('.adaptive-stage .board-item[data-stage-variant="compact"]:not(.board-item--dock)[data-block-id="vercel"] > section')
    expect(section).toMatch(/padding-block:\s*0\s*;/)
  })

  it('keeps the Quick Link removal target below the primary link center', () => {
    const remove = lastDeclarationBlock('.adaptive-stage .board-item[data-block-id="links"] button[aria-label^="Remove "]')
    expect(remove).toMatch(/top:\s*calc\(var\(--stage-control-target\) - 8px\)\s*;/)
    expect(remove).toMatch(/width:\s*var\(--stage-control-target\)\s*;/)
    expect(remove).toMatch(/height:\s*var\(--stage-control-target\)\s*;/)
  })

  it('keeps every Now launcher label on a readable 80px measure across variants', () => {
    const tile = lastDeclarationBlock('.stage-zone--now .board-item[data-block-id="links"] > section > div')
    expect(tile).toMatch(/width:\s*80px\s*;/)
    expect(tile).toMatch(/min-width:\s*80px\s*;/)
    expect(lastDeclarationBlock('.stage-zone--now .board-item[data-block-id="links"] > section > div > span'))
      .toMatch(/width:\s*80px\s*;/)
  })

  it('lets the Dock surface shrink to its real content instead of painting its planner reservation', () => {
    const dock = declarationBlock('.stage-zone--dock')
    expect(dock).toMatch(/min-block-size:\s*0\s*;/)
    expect(dock).not.toMatch(/min-block-size:\s*var\(--stage-dock-block-size\)/)
  })

  it('keeps the fixed-width Habits stack on the centered Now axis', () => {
    expect(declarationBlock('.stage-zone--now .board-item[data-block-id="habits"] > div'))
      .toMatch(/margin-inline:\s*auto\s*;/)
  })

  it('caps only the compact finite Board Clock by the short viewport block size', () => {
    const clock = declarationBlock('.board-item[data-stage-variant="compact"]:not(.board-item--dock)[data-block-id="clock"] time')
    expect(clock).toMatch(/font-size:\s*min\(var\(--clock-font\),\s*calc\(37\.6471cqi - 0\.7529px\),\s*17vh\)\s*;/)
  })
})
