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

  it('keeps the selected inspector above the compact fixed edit toolbar', () => {
    const inspector = declarationBlock('.edit-inspector')
    expect(inspector).toMatch(/z-index:\s*70\s*;/)
    expect(inspector).toMatch(/pointer-events:\s*none\s*;/)
    expect(declarationBlock('.edit-inspector :is(button, input, select, textarea, a, summary)'))
      .toMatch(/pointer-events:\s*auto\s*;/)
  })

  it('fits the unconfigured Weather controls inside a compact finite allocation', () => {
    const wrapper = declarationBlock('.canvas-item[data-canvas-size="compact"]:not([data-canvas-mode="docked"])[data-block-id="weather"] > section:has(input[aria-label="Search for a city"]) > div')
    expect(wrapper).toMatch(/padding:\s*4px\s*;/)
    expect(lastDeclarationBlock('.canvas-item[data-canvas-size="compact"]:not([data-canvas-mode="docked"])[data-block-id="weather"] > section:has(input[aria-label="Search for a city"]) > div'))
      .toMatch(/padding-inline:\s*48px\s*;/)
    expect(declarationBlock('.canvas-item[data-canvas-size="compact"]:not([data-canvas-mode="docked"])[data-block-id="weather"] > section:has(input[aria-label="Search for a city"]) > div > div > div'))
      .toMatch(/flex-direction:\s*column\s*;/)
    expect(declarationBlock('.canvas-item[data-canvas-size="compact"]:not([data-canvas-mode="docked"])[data-block-id="weather"] [data-location-label="full"]'))
      .toMatch(/display:\s*none\s*;/)
    expect(declarationBlock('.canvas-item[data-canvas-size="compact"]:not([data-canvas-mode="docked"])[data-block-id="weather"] [data-location-label="compact"]'))
      .toMatch(/display:\s*inline\s*;/)
  })

  it('the compact bookmarks SIZE opts into single-letter marks everywhere, including the dock (owner-confirmed 2026-08-18)', () => {
    // The exemption now rides on the docked DEFAULT size (standard = full
    // readable bar); an explicit compact size wears the marks in the strip
    // too, so the rules are no longer fenced out of docked mode.
    expect(declarationBlock('.canvas-item[data-canvas-size="compact"][data-block-id="bookmarks"] [data-bookmark-mark="monogram"]'))
      .toMatch(/display:\s*inline\s*;/)
    expect(declarationBlock('.canvas-item[data-canvas-size="compact"][data-block-id="bookmarks"] [data-bookmark-mark="folder"]'))
      .toMatch(/display:\s*none\s*;/)
    expect(declarationBlock('.canvas-item[data-canvas-size="compact"][data-block-id="bookmarks"] [data-chip-label]'))
      .toMatch(/clip:\s*rect\(0, 0, 0, 0\)\s*;/)
  })

  it('pins the compact chip scale letter to the 12px metadata floor (batch-1 owner review)', () => {
    expect(declarationBlock('.canvas-item[data-canvas-size="compact"]:not([data-canvas-mode="docked"])[data-block-id="weather"]:not(.z-30) > section > button > span > span:nth-child(2) > span'))
      .toMatch(/font-size:\s*12px\s*;/)
  })

  it('keeps compact forge headings at the 11px metadata floor', () => {
    expect(indexCss).toMatch(/\.canvas-item\[data-canvas-size="compact"\]:is\([\s\S]*?\) > section > div:first-child > h2\s*\{[\s\S]*?font-size:\s*11px\s*;/)
    expect(indexCss).toMatch(/\.canvas-item\[data-canvas-size="compact"\]:is\([\s\S]*?\) > section > div:first-child > span\s*\{[\s\S]*?font-size:\s*11px\s*;/)
    expect(indexCss).toMatch(/\.canvas-item\[data-canvas-size="compact"\]:is\(\[data-block-id="github"\], \[data-block-id="gitlab"\]\) \[role="img"\] ~ p\s*\{[\s\S]*?font-size:\s*11px\s*;/)
  })

  it('keeps the Compact GitLab contribution graph paintable', () => {
    const graphHideRules = indexCss.match(/\.canvas-item\[data-canvas-size="compact"\]\[data-block-id="gitlab"\] \[role="img"\][^{]*\{[^}]*\}/g) ?? []
    expect(graphHideRules.some((rule) => /display:\s*none\s*;/.test(rule))).toBe(false)
  })

  it('keeps compact Canvas Weather condition, location, and disclosure visible', () => {
    const summary = declarationBlock('.canvas-item[data-canvas-size="compact"]:not([data-canvas-mode="docked"])[data-block-id="weather"]:not(.z-30) > section > button > span')
    expect(summary).toMatch(/flex-wrap:\s*wrap\s*;/)
    const condition = declarationBlock('.canvas-item[data-canvas-size="compact"]:not([data-canvas-mode="docked"])[data-block-id="weather"]:not(.z-30) > section > button > span > span:nth-child(3)')
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
    '.canvas-item[data-canvas-size="compact"][data-block-id="links"] > section:not(.tier-frame) > div > span',
    '.canvas-item[data-canvas-size="compact"][data-block-id="homeassistant"] button[aria-label^="Run "]',
  ])('keeps ordinary glance text at the 14px floor for %s', (selector) => {
    expect(declarationBlock(selector)).toMatch(/font-size:\s*14px\s*;/)
  })

  it('the compact Month tier is fully removed (batch-2 owner review)', () => {
    // "The compact month is a joke... just remove it" — Month's only tier is
    // the complete month. No compact-tier Month rule may survive.
    expect(indexCss).not.toContain('[data-canvas-size="compact"][data-block-id="monthCal"]')
  })

  // The <72px Month action-stacking and its @container siblings were
  // emergency-fit rules for the deleted imposed boxes; with content-tight
  // wrappers and no size container they could never match and are deleted
  // (the orphaned-container-token check above pins that). The NL-P5 tier
  // catalog owns any designed tiny-tier Month composition.

  it('caps only the compact finite Board Clock by the short viewport block size', () => {
    const clock = declarationBlock('.canvas-item[data-canvas-size="compact"]:not([data-canvas-mode="docked"])[data-block-id="clock"] time')
    expect(clock).toMatch(/font-size:\s*min\(calc\(var\(--clock-font\) \* 0\.62\),\s*14vh\)\s*;/)
  })
})
