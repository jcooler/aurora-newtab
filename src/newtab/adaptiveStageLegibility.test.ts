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

describe('Adaptive Stage compact legibility contract', () => {
  it('sizes the Stage grid to the padded viewport content box without intrinsic growth', () => {
    const declarations = declarationBlock('.adaptive-stage__grid')
    expect(declarations).toMatch(/height:\s*calc\(100dvh - var\(--stage-inset\) - var\(--stage-inset\)\)\s*;/)
    expect(declarations).toMatch(/min-height:\s*0\s*;/)
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

  it('keeps both compact Month navigation targets on one row at the narrowest standard track', () => {
    expect(declarationBlock('.board-item[data-stage-variant="compact"][data-block-id="monthCal"] > div'))
      .toMatch(/padding:\s*0\s*;/)
  })

  it('reflows the complete compact Month label, Today action, and seven days without clipping them', () => {
    const row = declarationBlock('.board-item[data-stage-variant="compact"][data-block-id="monthCal"] [data-monthcal-header] > span')
    expect(row).toMatch(/display:\s*grid\s*;/)
    expect(row).toMatch(/grid-template-columns:\s*minmax\(0,\s*1fr\) auto\s*;/)
    expect(row).toMatch(/gap:\s*0\s*;/)
    expect(row).toMatch(/width:\s*100%\s*;/)
    const label = declarationBlock('.board-item[data-stage-variant="compact"][data-block-id="monthCal"] [data-monthcal-label]')
    expect(label).toMatch(/min-width:\s*0\s*;/)
    expect(label).toMatch(/white-space:\s*normal\s*;/)
    expect(label).toMatch(/overflow-wrap:\s*anywhere\s*;/)
    expect(label).toMatch(/overflow:\s*visible\s*;/)
    expect(label).toMatch(/text-overflow:\s*clip\s*;/)
    expect(label).toMatch(/line-height:\s*15px\s*;/)
    expect(declarationBlock('.board-item[data-stage-variant="compact"][data-block-id="monthCal"] table'))
      .toMatch(/margin-top:\s*0\s*;/)
    const week = declarationBlock('.board-item[data-stage-variant="compact"][data-block-id="monthCal"] tbody tr:first-child,\n.board-item[data-stage-variant="compact"][data-block-id="monthCal"] tbody tr[data-current-week]')
    expect(week).toMatch(/display:\s*grid\s*;/)
    expect(week).toMatch(/grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)\s*;/)
  })

  it('places compact Month navigation beside its readable label below two target widths', () => {
    expect(indexCss).toContain('@container (inline-size < 72px)')
    const header = lastDeclarationBlock('.board-item[data-stage-variant="compact"][data-block-id="monthCal"] [data-monthcal-header]')
    expect(header).toMatch(/display:\s*grid\s*;/)
    expect(header).toMatch(/grid-template-columns:\s*var\(--stage-control-target\) minmax\(0,\s*1fr\)\s*;/)
    const labelColumn = lastDeclarationBlock('.board-item[data-stage-variant="compact"][data-block-id="monthCal"] [data-monthcal-header] > span')
    expect(labelColumn).toMatch(/grid-template-columns:\s*minmax\(0,\s*1fr\)\s*;/)
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

  it('caps only the compact finite Board Clock by the short viewport block size', () => {
    const clock = declarationBlock('.board-item[data-stage-variant="compact"]:not(.board-item--dock)[data-block-id="clock"] time')
    expect(clock).toMatch(/font-size:\s*min\(var\(--clock-font\),\s*calc\(37\.6471cqi - 0\.7529px\),\s*17vh\)\s*;/)
  })
})
