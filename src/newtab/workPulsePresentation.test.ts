import { describe, expect, it } from 'vitest'
import css from './index.css?raw'
import githubSource from './widgets/github/GithubWidget.tsx?raw'
import gitlabSource from './widgets/gitlab/GitlabWidget.tsx?raw'
import jiraSource from './widgets/jira/JiraWidget.tsx?raw'
import statusSource from './widgets/status/StatusWidget.tsx?raw'
import summarySource from './widgets/shared/WorkPulseSummary.tsx?raw'
import vercelSource from './widgets/vercel/VercelWidget.tsx?raw'

// Status is deliberately ABSENT from this list (owner direction
// 2026-08-21). Every other attention connector answers "how are things?"
// with a sentence, so it renders WorkPulseSummary. Status answers with
// COLOUR — a row of dots is the whole readout — and the summary sentence it
// used to print above them ("All operational", "4 services") restated the
// dots and cost a row of height. Its summary now lives as screen-reader-only
// text, asserted separately below, so the meaning survives for anyone who
// cannot see the colours.
const sources = [
  githubSource,
  gitlabSource,
  jiraSource,
  vercelSource,
]

describe('W4-P3 Work Pulse presentation boundary', () => {
  it('gives every attention connector explicit summary, row, and detail anatomy', () => {
    for (const source of sources) {
      expect(source).toContain('<WorkPulseSummary')
      expect(source).toContain('data-work-pulse-rows')
      expect(source).toContain('data-work-pulse-detail')
    }
    // Status keeps the DETAIL anatomy and trades the summary sentence for
    // an accessible-only equivalent — never dropping the meaning, only the
    // duplicated pixels.
    expect(statusSource).toContain('data-work-pulse-detail')
    expect(statusSource).not.toContain('<WorkPulseSummary')
    expect(statusSource).toContain('data-status-summary')
    expect(statusSource).toContain('sr-only')
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
