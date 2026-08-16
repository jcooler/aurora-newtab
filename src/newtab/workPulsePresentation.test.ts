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

  it('progressively reveals summary, rows, and detail from Compact through Expanded', () => {
    expect(css).toMatch(/data-stage-variant="compact"[^}]+data-work-pulse-rows[\s\S]*?display: none;/)
    expect(css).toMatch(/data-stage-variant="compact"[^}]+data-work-pulse-detail[\s\S]*?display: none;/)
    expect(css).toMatch(/data-stage-variant="standard"[^}]+data-work-pulse-detail[\s\S]*?display: none;/)
    expect(css).toMatch(/data-stage-variant="expanded"[^}]+data-work-pulse-detail[\s\S]*?display: block;/)
    expect(statusSource).toContain('data-work-pulse-status-dots')
    expect(css).toMatch(/data-block-id="status"[^}]+data-stage-variant="standard"[^}]+data-work-pulse-status-dots[\s\S]*?display: flex;/)
    expect(css).toMatch(/data-block-id="status"[^}]+data-stage-variant="standard"[^}]+data-work-pulse-rows[\s\S]*?display: block;/)
  })

  it('uses the existing Pulse zone as one shared surface without changing geometry authority', () => {
    expect(css).toMatch(/\.stage-zone--pulse\s*\{[^}]+grid-area: pulse;/)
    expect(css).toMatch(/\.stage-zone--pulse \.board-item > section\s*\{[\s\S]*?background: transparent;[\s\S]*?box-shadow: none;/)
    expect(css).not.toMatch(/\.stage-zone--pulse[^}]+(?:position:\s*(?:absolute|fixed)|transform:\s*scale|\bvh\b|\bvw\b)/)
  })
})
