import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const CATALOG = JSON.parse(await readFile(path.join(ROOT, 'docs', 'superpowers', 'catalog', 'expansion', 'candidates.json'), 'utf8'))

const EXPECTED_ORIGINS = {
  readingList: [], recentlyClosed: [], downloads: [], tabGroups: [],
  linear: ['https://api.linear.app/*'],
  sentry: ['https://sentry.io/*'],
  todoist: ['https://api.todoist.com/*'],
  onThisDay: ['https://api.wikimedia.org/*'],
  publicHolidays: ['https://date.nager.at/*'],
  severeWeather: [],
  auroraKp: ['https://services.swpc.noaa.gov/*'],
  notion: ['https://api.notion.com/*'],
  slack: ['https://slack.com/*'],
  spotify: ['https://accounts.spotify.com/*', 'https://api.spotify.com/*'],
  topSites: [], historyDigest: [],
  githubActions: ['https://api.github.com/*'],
  gitlabPipelines: ['https://gitlab.com/*'],
  pagerDuty: ['https://api.pagerduty.com/*'],
  datadog: ['https://api.datadoghq.com/*'],
  cloudflareAnalytics: ['https://api.cloudflare.com/*'],
  buildkite: ['https://api.buildkite.com/*'],
  jenkins: ['https://*/*'],
  asana: ['https://app.asana.com/*'],
  trello: ['https://api.trello.com/*'],
  clickUp: ['https://api.clickup.com/*'],
  microsoftTodo: ['https://graph.microsoft.com/*', 'https://login.microsoftonline.com/*'],
  googleCalendar: ['https://accounts.google.com/*', 'https://www.googleapis.com/*'],
  earthquakes: ['https://earthquake.usgs.gov/*'],
  spaceLaunches: ['https://ll.thespacedevs.com/*'],
  issTracker: ['https://api.wheretheiss.at/*'],
  wordOfDay: ['https://www.dictionaryapi.com/*'],
  dailyTrivia: ['https://opentdb.com/*'],
  sportsScores: ['https://www.thesportsdb.com/*'],
  transitCommute: ['https://*/*'],
  packageUpdates: ['https://registry.npmjs.org/*'],
  uptime: ['https://*/*'],
  emailInbox: ['https://accounts.google.com/*', 'https://gmail.googleapis.com/*'],
  habitInsights: [], currentEvents: [],
}

test('pins every researched runtime origin independently from documentation hosts', () => {
  assert.deepEqual(Object.keys(EXPECTED_ORIGINS), CATALOG.candidates.map(({ id }) => id))
  for (const candidate of CATALOG.candidates) {
    assert.deepEqual(candidate.access.origins, EXPECTED_ORIGINS[candidate.id], candidate.id)
    for (const origin of candidate.access.origins) {
      assert.match(origin, /^https:\/\/(?:\*|[^/*]+)\/\*$/, `${candidate.id}: ${origin}`)
    }
  }
})

test('uses candidate-specific tier and cache research instead of label-substituted boilerplate', () => {
  const genericFragments = [
    'source-appropriate minimum interval',
    'primary fact with no filler',
    'summary with one useful supporting detail',
    'detail that uses added space for context rather than whitespace',
    'Open source detail or settings without changing layout placement',
  ]
  const presentationSignatures = new Set()
  for (const candidate of CATALOG.candidates) {
    const researched = JSON.stringify({ cache: candidate.cache, presentation: candidate.presentation })
    genericFragments.forEach((fragment) => assert.equal(researched.includes(fragment), false, `${candidate.id}: ${fragment}`))
    presentationSignatures.add(JSON.stringify(candidate.presentation))
  }
  assert.equal(presentationSignatures.size, CATALOG.candidates.length)
})

test('records browser warnings and Uptime network truth explicitly', () => {
  const byId = Object.fromEntries(CATALOG.candidates.map((candidate) => [candidate.id, candidate]))
  assert.deepEqual(byId.readingList.access.userWarnings, ['Read and change entries in the reading list.'])
  assert.deepEqual(byId.downloads.access.userWarnings, ['Manage your downloads.'])
  assert.deepEqual(byId.tabGroups.access.userWarnings, ['View and manage your tab groups.'])
  assert.equal(byId.uptime.privacy.sends.some((value) => /health-check request/i.test(value)), true)
  assert.equal(byId.uptime.privacy.receives.some((value) => /status|latency|response/i.test(value)), true)
  assert.equal(byId.uptime.access.userWarnings.some((value) => /selected endpoint/i.test(value)), true)
})
