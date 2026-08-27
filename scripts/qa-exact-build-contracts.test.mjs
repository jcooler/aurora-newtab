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

  const productionCatalogEvidence = [
    ' M docs/superpowers/catalog/widget-redesign/production/clock-quote-dark-clock.png',
    ' M docs/superpowers/catalog/widget-redesign/production/clock-quote-dark-quote.png',
    ' M docs/superpowers/catalog/widget-redesign/production/clock-quote-light-clock.png',
    ' M docs/superpowers/catalog/widget-redesign/production/clock-quote-light-quote.png',
    ' M docs/superpowers/catalog/widget-redesign/production/clock-quote-saturated-clock.png',
    ' M docs/superpowers/catalog/widget-redesign/production/clock-quote-saturated-quote.png',
    ' M docs/superpowers/catalog/widget-redesign/production/evidence.json',
    ' M docs/superpowers/catalog/widget-redesign/production/github-calendar-dark-calendar.png',
    ' M docs/superpowers/catalog/widget-redesign/production/github-calendar-dark-github.png',
    ' M docs/superpowers/catalog/widget-redesign/production/github-calendar-light-calendar.png',
    ' M docs/superpowers/catalog/widget-redesign/production/github-calendar-light-github.png',
    ' M docs/superpowers/catalog/widget-redesign/production/github-calendar-saturated-calendar.png',
    ' M docs/superpowers/catalog/widget-redesign/production/github-calendar-saturated-github.png',
    ' M docs/superpowers/catalog/widget-redesign/production/jira-sentry-dark-jira.png',
    ' M docs/superpowers/catalog/widget-redesign/production/jira-sentry-dark-sentry.png',
    ' M docs/superpowers/catalog/widget-redesign/production/jira-sentry-light-jira.png',
    ' M docs/superpowers/catalog/widget-redesign/production/jira-sentry-light-sentry.png',
    ' M docs/superpowers/catalog/widget-redesign/production/jira-sentry-saturated-jira.png',
    ' M docs/superpowers/catalog/widget-redesign/production/jira-sentry-saturated-sentry.png',
    ' M docs/superpowers/catalog/widget-redesign/production/owner-visible-canvas-clock-edit.png',
    ' M docs/superpowers/catalog/widget-redesign/production/owner-visible-canvas.png',
    ' M docs/superpowers/catalog/widget-redesign/production/tasks-notes-dark-notes.png',
    ' M docs/superpowers/catalog/widget-redesign/production/tasks-notes-dark-tasks.png',
    ' M docs/superpowers/catalog/widget-redesign/production/tasks-notes-light-notes.png',
    ' M docs/superpowers/catalog/widget-redesign/production/tasks-notes-light-tasks.png',
    ' M docs/superpowers/catalog/widget-redesign/production/tasks-notes-saturated-notes.png',
    ' M docs/superpowers/catalog/widget-redesign/production/tasks-notes-saturated-tasks.png',
    ' M docs/superpowers/catalog/widget-redesign/production/weather-on-this-day-dark-onThisDay.png',
    ' M docs/superpowers/catalog/widget-redesign/production/weather-on-this-day-dark-weather.png',
    ' M docs/superpowers/catalog/widget-redesign/production/weather-on-this-day-light-onThisDay.png',
    ' M docs/superpowers/catalog/widget-redesign/production/weather-on-this-day-light-weather.png',
    ' M docs/superpowers/catalog/widget-redesign/production/weather-on-this-day-saturated-onThisDay.png',
    ' M docs/superpowers/catalog/widget-redesign/production/weather-on-this-day-saturated-weather.png',
  ].join('\n')
  assert.doesNotThrow(() => buildContracts.assertExactBuildTrackedStatus(productionCatalogEvidence))

  for (const dirtyInput of [
    ' M src/newtab/widgets/github/GithubWidget.tsx',
    'M  scripts/qa-github-tiers.mjs',
    ' M package.json',
    ' M docs/superpowers/TAKEOVER-2026-08-24-WIDGET-UI-RECOVERY.md',
    ' M docs/superpowers/qa/ui-recovery/acceptance/not-generated-by-the-gate.png',
    ' M docs/superpowers/catalog/widget-redesign/production/not-generated-by-the-catalog.png',
  ]) {
    assert.throws(
      () => buildContracts.assertExactBuildTrackedStatus(dirtyInput),
      /tracked inputs.*HEAD/i,
      dirtyInput,
    )
  }
})
