import { escapeHtml, renderFrame, renderStateSurface } from './shared.mjs'

const safe = (value) => escapeHtml(value ?? '')
const LABELS = Object.freeze({ readingList: 'Reading List', recentlyClosed: 'Recently Closed', downloads: 'Downloads', tabGroups: 'Tab Groups', homeassistant: 'Home Assistant', rss: 'Headlines', crypto: 'Crypto' })
const limits = (tier, compact, standard, full) => tier === 'docked' ? 1 : tier === 'compact' ? compact : tier === 'standard' ? standard : full

const readingBody = (tier, f) => tier === 'docked'
  ? `<div class="resource-dock" data-resource-signature="readingList"><strong>${f.unread} unread</strong><span class="resource-dock__primary">${safe(f.items[0].title)}</span><small>${safe(f.items[0].domain)}</small></div>`
  : `<div class="resource-face reading-face" data-resource-signature="readingList"><header><strong>${f.unread}</strong><span>unread</span></header>${f.items.slice(0, limits(tier, 1, 3, 6)).map((x) => `<article data-reading-row><div><strong>${safe(x.title)}</strong><span>${safe(x.domain)}</span></div><small>${safe(x.age)} · ${safe(x.state)}</small></article>`).join('')}</div>`
const closedBody = (tier, f) => tier === 'docked'
  ? `<div class="resource-dock" data-resource-signature="recentlyClosed"><strong>▣ ${f.items.length} recent</strong><span class="resource-dock__primary">${safe(f.items[0].title)}</span><small>${safe(f.items[0].age)}</small></div>`
  : `<div class="resource-face closed-face" data-resource-signature="recentlyClosed">${f.items.slice(0, limits(tier, 1, 3, 4)).map((x) => `<article data-restore-type="${safe(x.type)}"><b>${x.type === 'window' ? '▣' : x.type === 'group' ? '▤' : '□'}</b><div><strong>${safe(x.title)}</strong><span>${safe(x.type)} · ${x.count} item${x.count === 1 ? '' : 's'}</span></div><small>${safe(x.age)}</small></article>`).join('')}</div>`
const downloadBody = (tier, f) => tier === 'docked'
  ? `<div class="resource-dock resource-dock--download" data-resource-signature="downloads"><strong>1 active</strong><span class="resource-dock__primary">${safe(f.items[0].name)}</span><i data-download-progress><b style="width:${f.items[0].progress}%"></b></i><small>${f.items[0].progress}%</small></div>`
  : `<div class="resource-face download-face" data-resource-signature="downloads">${f.items.slice(0, limits(tier, 1, 3, 4)).map((x) => `<article><div><strong>${safe(x.name)}</strong><span>${safe(x.state)} · ${safe(x.size)}</span></div><small>${x.progress}%</small><i data-download-progress><b style="width:${x.progress}%"></b></i></article>`).join('')}</div>`
const groupsBody = (tier, f) => `<div class="groups-face" data-resource-signature="tabGroups">${f.windows.slice(0, tier === 'full' ? 2 : 1).map((win) => `<section data-browser-window><header><strong>${safe(win.name)}</strong><span>${win.groups.reduce((n, g) => n + g.tabs, 0)} tabs</span></header>${win.groups.slice(0, tier === 'compact' ? 1 : 2).map((g) => `<article data-group-color="${safe(g.color)}"><i></i><b>${safe(g.name)}</b><span>${g.tabs} tabs</span></article>`).join('')}</section>`).join('')}</div>`
const homeBody = (tier, f) => tier === 'docked'
  ? `<div class="resource-dock" data-resource-signature="homeassistant"><strong>Home</strong><span class="resource-dock__primary">${safe(f.entities[0].name)}</span><small>${safe(f.entities[0].state)}</small></div>`
  : `<div class="home-face" data-resource-signature="homeassistant">${f.entities.slice(0, limits(tier, 1, 3, 4)).map((x) => `<article data-entity-state><div><strong>${safe(x.name)}</strong><span>${safe(x.detail)}</span></div><b>${safe(x.state)}</b>${tier === 'standard' || tier === 'full' ? '<button type="button">Open</button>' : ''}</article>`).join('')}</div>`
const rssBody = (tier, f) => `<div class="rss-face" data-resource-signature="rss">${f.stories.slice(0, limits(tier, 1, 3, 4)).map((x, i) => `<article ${i === 0 ? 'data-headline-lead' : ''}><strong>${safe(x.title)}</strong><span>${safe(x.source)} · ${safe(x.age)}</span></article>`).join('')}</div>`
const cryptoBody = (tier, f) => `<div class="crypto-face crypto-face--${tier}" data-resource-signature="crypto">${(tier === 'standard' ? f.coins : f.coins.slice(0, 1)).map((x) => `<article data-coin-row data-direction="${safe(x.direction)}"><strong>${safe(x.symbol)}</strong><b>${safe(x.price)}</b><span>${safe(x.change)}</span><i aria-hidden="true"></i></article>`).join('')}</div>`

export function renderResourceWidget(capture, fixture) {
  let body
  if (capture.state === 'permission') body = `<div data-resource-signature="${safe(capture.id)}">${renderStateSurface({ title: capture.id === 'tabGroups' ? 'Allow tab access' : 'Permission required', detail: 'Aurora needs browser access for this local view.', action: 'Review permission' })}</div>`
  else if (capture.state !== 'ready') body = `<div data-resource-signature="${safe(capture.id)}">${renderStateSurface({ title: `${LABELS[capture.id]} unavailable`, detail: 'Retained data is shown when it is safe to do so.', action: 'Try again' })}</div>`
  else if (capture.id === 'readingList') body = readingBody(capture.tier, fixture)
  else if (capture.id === 'recentlyClosed') body = closedBody(capture.tier, fixture)
  else if (capture.id === 'downloads') body = downloadBody(capture.tier, fixture)
  else if (capture.id === 'tabGroups') body = groupsBody(capture.tier, fixture)
  else if (capture.id === 'homeassistant') body = homeBody(capture.tier, fixture)
  else if (capture.id === 'rss') body = rssBody(capture.tier, fixture)
  else if (capture.id === 'crypto') body = cryptoBody(capture.tier, fixture)
  else throw new Error(`Unsupported resource widget: ${capture.id}`)
  return renderFrame({ tier: capture.tier, theme: capture.theme, state: capture.state, label: LABELS[capture.id], widget: capture.id, className: `resource-widget resource-widget--${capture.id}`, body })
}
