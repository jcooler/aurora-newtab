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
