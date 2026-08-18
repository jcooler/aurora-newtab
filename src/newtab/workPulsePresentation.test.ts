import { describe, expect, it } from 'vitest'
import css from './index.css?raw'
import githubSource from './widgets/github/GithubWidget.tsx?raw'
import gitlabSource from './widgets/gitlab/GitlabWidget.tsx?raw'
import jiraSource from './widgets/jira/JiraWidget.tsx?raw'
import statusSource from './widgets/status/StatusWidget.tsx?raw'
import summarySource from './widgets/shared/WorkPulseSummary.tsx?raw'
import vercelSource from './widgets/vercel/VercelWidget.tsx?raw'

const sources = [
  githubSource,
  gitlabSource,
  jiraSource,
  vercelSource,
  statusSource,
]

describe('W4-P3 Work Pulse presentation boundary', () => {
  it('gives every attention connector explicit summary, row, and detail anatomy', () => {
    for (const source of sources) {
      expect(source).toContain('<WorkPulseSummary')
      expect(source).toContain('data-work-pulse-rows')
      expect(source).toContain('data-work-pulse-detail')
    }
    expect(summarySource).not.toMatch(/\bfetch\s*\(/)
    expect(summarySource).not.toContain('storage.set')
    expect(summarySource).not.toContain('useConnectorSnapshot')
  })

  it('keeps the summary/rows/detail anatomy for the tier catalog without retired zone CSS', () => {
    // The stage-zone--pulse reveal rules were scoped under a root class no
    // component has emitted since the Canvas replaced the Adaptive Stage —
    // vacuous at runtime — and were deleted with the named-layouts rebuild
    // (NL-P2, spec §3). Tier-progressive reveals are owned in-component via
    // the canvasSize prop (Canvas-P5 truthful size contracts) and NL-P5's
    // designed tiers build on this same anatomy.
    expect(statusSource).toContain('data-work-pulse-status-dots')
    expect(css).not.toContain('stage-zone')
    expect(css).not.toContain('data-stage-variant')
  })
})
