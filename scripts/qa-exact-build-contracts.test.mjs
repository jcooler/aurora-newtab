import assert from 'node:assert/strict'
import test from 'node:test'

import * as buildContracts from './build-contracts.mjs'

test('exact-build QA allows only its generated evidence to differ from HEAD', () => {
  assert.equal(
    typeof buildContracts.assertExactBuildTrackedStatus,
    'function',
    'the shared exact-build tracked-status guard is missing',
  )

  const allowedEvidence = [
    ' M docs/superpowers/qa/ui-recovery/acceptance/calendar-settings-close.png',
    ' M docs/superpowers/qa/ui-recovery/acceptance/calendar-settings.png',
    ' M docs/superpowers/qa/ui-recovery/acceptance/canvas-1408x445.png',
    ' M docs/superpowers/qa/ui-recovery/acceptance/canvas-1600x900.png',
    ' M docs/superpowers/qa/ui-recovery/acceptance/evidence.json',
    ' M docs/superpowers/qa/ui-recovery/github-tiers/evidence.json',
    ' M docs/superpowers/qa/ui-recovery/github-tiers/github-compact.png',
    ' M docs/superpowers/qa/ui-recovery/github-tiers/github-full.png',
    ' M docs/superpowers/qa/ui-recovery/github-tiers/github-standard.png',
    ' M docs/superpowers/qa/ui-recovery/github-tiers/gitlab-compact.png',
    ' M docs/superpowers/qa/ui-recovery/github-tiers/gitlab-full.png',
    ' M docs/superpowers/qa/ui-recovery/github-tiers/gitlab-standard.png',
  ].join('\n')
  assert.doesNotThrow(() => buildContracts.assertExactBuildTrackedStatus(allowedEvidence))

  for (const dirtyInput of [
    ' M src/newtab/widgets/github/GithubWidget.tsx',
    'M  scripts/qa-github-tiers.mjs',
    ' M package.json',
    ' M docs/superpowers/TAKEOVER-2026-08-24-WIDGET-UI-RECOVERY.md',
    ' M docs/superpowers/qa/ui-recovery/acceptance/not-generated-by-the-gate.png',
  ]) {
    assert.throws(
      () => buildContracts.assertExactBuildTrackedStatus(dirtyInput),
      /tracked inputs.*HEAD/i,
      dirtyInput,
    )
  }
})
