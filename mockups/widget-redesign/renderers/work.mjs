import { escapeHtml, renderFrame, renderStateSurface } from './shared.mjs'

const safe = (value) => escapeHtml(value ?? '')
const LABELS = Object.freeze({ github: 'GitHub', gitlab: 'GitLab', jira: 'Jira', vercel: 'Vercel', status: 'Service Status', linear: 'Linear', sentry: 'Sentry', todoist: 'Todoist' })

const graph = (id, tier, fixture) => {
  const cells = tier === 'compact' ? 42 : tier === 'standard' ? 84 : 140
  return `<div class="contribution-graph contribution-graph--${tier}" aria-label="Contribution activity">${Array.from({ length: cells }, (_, index) => `<i data-contribution-cell data-level="${(index * 7 + index % 5 + fixture.count) % 5}"></i>`).join('')}</div>`
}

const contributionBody = (id, tier, fixture) => {
  if (tier === 'docked') return `<div class="work-dock" data-work-signature="${id}"><strong>${fixture.count}</strong><span>contributions</span><i>${fixture.reviews} reviews</i></div>`
  return `<div class="contribution-face" data-work-signature="${id}" ${tier === 'full' ? 'data-full-detail' : ''}><header><strong>${fixture.count}</strong><span>contributions</span><small>${fixture.streak} day streak</small></header>${graph(id, tier, fixture)}<footer><span>${fixture.reviews} reviews</span><span>${fixture.prs} ${id === 'gitlab' ? 'merge requests' : 'pull requests'}</span>${tier === 'full' ? `<span>${fixture.issues} issues</span><span>${fixture.notifications} notifications</span>` : ''}</footer></div>`
}

const issueRows = (issues, kind, limit) => `<div class="work-rows">${issues.slice(0, limit).map((issue) => `<article><b ${kind === 'jira' ? 'data-issue-key' : ''}>${safe(issue.key)}</b><div><strong>${safe(issue.title)}</strong><span>${safe(issue.state)}${issue.team ? ` · ${safe(issue.team)}` : ''}</span></div><small>${safe(issue.priority ?? '')}</small></article>`).join('')}</div>`

const jiraBody = (tier, fixture) => tier === 'docked'
  ? `<div class="work-dock" data-work-signature="jira"><strong>${fixture.assigned}</strong><span>assigned</span><i>${fixture.due} due</i></div>`
  : `<div class="issue-face" data-work-signature="jira" ${tier === 'full' ? 'data-full-detail' : ''}><div class="issue-distribution"><span><b>${fixture.assigned}</b> assigned</span><span><b>${fixture.due}</b> due</span><i style="width:72%"></i></div>${tier === 'compact' ? '' : issueRows(fixture.issues, 'jira', tier === 'full' ? 3 : 2)}</div>`

const vercelBody = (tier, fixture) => {
  if (tier === 'docked') return `<div class="work-dock" data-work-signature="vercel"><strong>● ${safe(fixture.state)}</strong><span>${safe(fixture.project)}</span><i>${safe(fixture.age)}</i></div>`
  const rows = tier === 'compact' ? fixture.deployments.slice(0, 1) : fixture.deployments
  return `<div class="deployment-face" data-work-signature="vercel" ${tier === 'full' ? 'data-full-detail' : ''}>${rows.map((item) => `<article data-deployment-state="${safe(item.state)}"><i></i><div><strong>${safe(item.project)}</strong><span>${safe(item.branch)}</span></div><small>${safe(item.state)} · ${safe(item.age)}</small></article>`).join('')}${tier === 'full' ? `<footer>Latest build ${safe(fixture.duration)} · ${safe(fixture.branch)}</footer>` : ''}</div>`
}

const statusBody = (tier, fixture) => {
  const services = tier === 'docked' ? fixture.services.slice(0, 1) : tier === 'compact' ? fixture.services.slice(0, 2) : fixture.services
  return `<div class="status-face status-face--${tier}" data-work-signature="status">${services.map((service) => `<article data-service-state="${safe(service.state)}"><i></i><strong>${safe(service.name)}</strong><span>${safe(service.state)}</span></article>`).join('')}</div>`
}

const linearBody = (tier, fixture) => {
  const progress = Math.round((fixture.completed / fixture.total) * 100)
  if (tier === 'docked') return `<div class="work-dock" data-work-signature="linear"><strong>${fixture.assigned}</strong><span>assigned</span><i>${fixture.due} due</i></div>`
  return `<div class="linear-face" data-work-signature="linear" ${tier === 'full' ? 'data-full-detail' : ''}><header data-cycle-progress><strong>${safe(fixture.cycle)}</strong><span>${fixture.completed}/${fixture.total} · ${progress}%</span><i><b style="width:${progress}%"></b></i></header>${tier === 'compact' ? '' : issueRows(fixture.issues, 'linear', tier === 'full' ? 3 : 2)}</div>`
}

const sentryBody = (tier, fixture) => {
  if (tier === 'docked') return `<div class="work-dock" data-work-signature="sentry"><strong>${fixture.unresolved}</strong><span>unresolved</span><i>${safe(fixture.issues[0].title)}</i></div>`
  const limit = tier === 'compact' ? 1 : tier === 'standard' ? 2 : 3
  return `<div class="sentry-face" data-work-signature="sentry" ${tier === 'full' ? 'data-full-detail' : ''}><header><strong>${fixture.unresolved}</strong><span>unresolved issues</span></header>${fixture.issues.slice(0, limit).map((issue) => `<article><i data-level="${safe(issue.level)}"></i><div><strong>${safe(issue.title)}</strong><span>${issue.events} events · ${safe(issue.age)}</span>${tier === 'full' ? `<code data-issue-fingerprint>${safe(issue.fingerprint)}</code>` : ''}</div></article>`).join('')}</div>`
}

const todoistBody = (tier, fixture) => {
  if (tier === 'docked') return `<div class="work-dock" data-work-signature="todoist"><strong>${fixture.due}</strong><span>due today</span><i>${fixture.overdue} overdue</i></div>`
  const tasks = tier === 'compact' ? fixture.tasks.slice(0, 1) : tier === 'standard' ? fixture.tasks.slice(0, 3) : fixture.tasks
  return `<div class="todoist-face" data-work-signature="todoist" ${tier === 'full' ? 'data-full-detail' : ''}><header><strong>${fixture.due} due</strong><span>${fixture.overdue} overdue</span></header><div>${tasks.map((task) => `<article data-due-lane="${safe(task.lane)}"><i></i><div><strong>${safe(task.title)}</strong><span>${safe(task.lane)} · ${safe(task.project)}</span></div><small>${safe(task.priority)}</small></article>`).join('')}</div></div>`
}

export function renderWorkWidget(capture, fixture) {
  let body
  if (capture.state !== 'ready') body = `<div data-work-signature="${safe(capture.id)}">${renderStateSurface({ title: `${LABELS[capture.id]} unavailable`, detail: 'Connector data could not be refreshed.', action: 'Try again' })}</div>`
  else if (capture.id === 'github' || capture.id === 'gitlab') body = contributionBody(capture.id, capture.tier, fixture)
  else if (capture.id === 'jira') body = jiraBody(capture.tier, fixture)
  else if (capture.id === 'vercel') body = vercelBody(capture.tier, fixture)
  else if (capture.id === 'status') body = statusBody(capture.tier, fixture)
  else if (capture.id === 'linear') body = linearBody(capture.tier, fixture)
  else if (capture.id === 'sentry') body = sentryBody(capture.tier, fixture)
  else if (capture.id === 'todoist') body = todoistBody(capture.tier, fixture)
  else throw new Error(`Unsupported work widget: ${capture.id}`)
  return renderFrame({ tier: capture.tier, theme: capture.theme, state: capture.state, label: LABELS[capture.id], widget: capture.id, className: `work-widget work-widget--${capture.id}`, body })
}
