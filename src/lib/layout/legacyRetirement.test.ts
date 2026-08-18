import { describe, expect, it } from 'vitest'
import v2Source from './v2.ts?raw'
import typesSource from './types.ts?raw'
import githubSource from '../../newtab/widgets/github/GithubWidget.tsx?raw'
import gitlabSource from '../../newtab/widgets/gitlab/GitlabWidget.tsx?raw'
import vercelSource from '../../newtab/widgets/vercel/VercelWidget.tsx?raw'
import indexCss from '../../newtab/index.css?raw'

const retiredModules = import.meta.glob([
  '../../newtab/components/PositionedBlock.tsx',
  '../../newtab/arrange/draftLayout.ts',
  './snap.ts',
  './pillPlacement.ts',
  './clamp.ts',
], { eager: true, query: '?raw', import: 'default' })

// NL-P2 (named-layouts spec §3): the automatic profile machinery, derived
// slot catalogs, hidden coordinate planes, fixed widget boxes, and the
// Arrange artboard are deleted files. An eager glob that matches nothing
// proves no file returned under these paths.
const nlp2RetiredModules = import.meta.glob([
  '../../newtab/arrange/ArrangeController.tsx',
  '../../newtab/arrange/ArrangeArtboard.tsx',
  '../../newtab/arrange/arrangePreview.ts',
  '../../newtab/arrange/arrangeViewport.ts',
  '../../newtab/arrange/canvasDraft.ts',
  '../../newtab/arrange/profileEditor.ts',
  '../../newtab/components/SignalDockEntry.tsx',
  './canvasDefaults.ts',
  './canvasGeometry.ts',
], { eager: true, query: '?raw', import: 'default' })

// Live source that must no longer reference the deleted machinery. Test
// files and this file are excluded; the *live* consumers are what matter.
const liveSource = import.meta.glob([
  '../../**/*.{ts,tsx}',
  '!../../**/*.test.{ts,tsx}',
  '!./legacyRetirement.test.ts',
], { eager: true, query: '?raw', import: 'default' }) as Record<string, string>

describe('W3-P4 legacy retirement boundary', () => {
  it('has no production percentage renderer, drag geometry, or draft context modules', () => {
    expect(retiredModules).toEqual({})
  })

  it('keeps legacy data as validation/migration provenance without a live edit seam', () => {
    expect(v2Source).toContain('validateLegacyLayout')
    expect(v2Source).toContain('layoutV2FromLegacy')
    expect(v2Source).not.toContain('withLegacyBlockPosition')
    expect(v2Source).not.toContain('legacyLayoutOf')
    expect(typesSource).not.toContain('export type Layout = LegacyLayout')
  })

  it('does not height-hide an entire enabled connector section', () => {
    expect(githubSource).not.toContain('const sectionTier')
    expect(gitlabSource).not.toContain('const sectionTier')
    expect(vercelSource).not.toContain('const summaryTier')
    expect(indexCss).not.toMatch(/\[data-zone=['"](?:left|right)['"]\]/)
    expect(indexCss).not.toMatch(/\.(?:rail-primary|rail-col2|quote-gate|tier-fade)\s*\{/)
    expect(indexCss).not.toMatch(/> section\.hidden\s*\{/)
  })
})

describe('NL-P2 named-layouts retirement boundary', () => {
  it('the automatic profile machinery files are gone', () => {
    expect(nlp2RetiredModules).toEqual({})
  })

  it('no live source references the deleted machinery', () => {
    const forbidden = [
      'selectCanvasProfile',
      'SMALL_CANVAS_COORDINATE_HEIGHT',
      'resolveCanvasProfile',
      'canvasMinimumHeight',
      'canvasBoxFor',
      'fitCanvasProfile',
      'ITEM_BOXES',
      'BASE_BOXES',
      'CANVAS_PROFILE_LABELS',
      'ArrangeController',
      'ArrangeArtboard',
      'data-stage-variant',
      "'board-item",
      'board-item ',
    ]
    for (const [path, source] of Object.entries(liveSource)) {
      for (const token of forbidden) {
        expect(source, `${path} still references ${token}`).not.toContain(token)
      }
    }
    // The scan is real: it must have seen the live rendering path.
    const paths = Object.keys(liveSource)
    expect(paths.some((path) => path.endsWith('App.tsx'))).toBe(true)
    expect(paths.some((path) => path.endsWith('CanvasSurface.tsx'))).toBe(true)
  })
})
