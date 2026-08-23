import { TARGET_WIDGETS } from './catalog-model.mjs'
import { fixtureFor } from './fixtures.mjs'
import { renderCalendarConsolidation } from './renderers/calendar-sky.mjs'
import { renderWidgetFace } from './renderers/index.mjs'
import { escapeHtml, renderStack } from './renderers/shared.mjs'

const byId = new Map(TARGET_WIDGETS.map((target) => [target.id, target]))

const slugify = (value) => String(value)
  .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')

export function captureFilename(capture) {
  const slug = slugify(capture.key)
  if (!slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error(`Unsafe capture filename: ${capture.key}`)
  return `${slug}.png`
}

const fixtureScenario = (capture) => capture.state === 'empty' ? 'sparse' : 'dense'
const face = (id, tier, capture, extra = {}) => renderWidgetFace(
  { id, tier, state: capture.state, theme: capture.theme, ...extra },
  fixtureFor(id, fixtureScenario(capture), extra),
)

const partnerFor = (id, tier) => TARGET_WIDGETS.find((target) => target.id !== id && target.stackTiers.includes(tier))

const stackFace = (capture, members) => renderStack({
  tier: capture.tier,
  theme: capture.theme,
  label: members.map((id) => byId.get(id).label).join(' & '),
  members: members.map((id) => ({
    id,
    label: byId.get(id).label,
    html: face(id, capture.tier, capture),
  })),
})

export function renderCatalogCapture(capture) {
  let html
  let label = ''
  if (capture.kind === 'migration') {
    html = renderCalendarConsolidation(fixtureFor('calendar', 'dense'))
  } else if (capture.kind === 'comparison') {
    html = `<section class="capture-comparison" data-essential>${capture.views.map((view) => face(capture.widget, capture.tier, capture, { view })).join('')}</section>`
  } else if (capture.kind === 'mixed-stack') {
    label = capture.members.map((id) => byId.get(id).label).join(' + ')
    html = stackFace(capture, capture.members)
  } else if (capture.kind === 'stack-face') {
    const partner = partnerFor(capture.widget, capture.tier)
    if (!partner) throw new Error(`No stack partner for ${capture.widget} at ${capture.tier}`)
    html = stackFace(capture, [capture.widget, partner.id])
  } else if (capture.kind === 'interaction') {
    label = capture.interaction.replaceAll('-', ' ')
    html = `<div class="interaction-surface" data-interaction="${escapeHtml(capture.interaction)}">${face(capture.widget, capture.tier, capture)}</div>`
  } else {
    html = face(capture.widget, capture.tier, capture)
  }
  return `<div class="catalog-capture" data-capture-key="${escapeHtml(capture.key)}">${label ? `<span class="catalog-capture__label">${escapeHtml(label)}</span>` : ''}${html}</div>`
}
