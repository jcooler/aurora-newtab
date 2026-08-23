const TIERS = new Set(['docked', 'compact', 'standard', 'full'])
const THEMES = new Set(['dark', 'light', 'pink', 'blue', 'green'])

export function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

const assertOption = (set, value, name) => {
  if (!set.has(value)) throw new Error(`Unsupported ${name}: ${value}`)
}

export function renderFrame({
  tier,
  theme = 'dark',
  label,
  state = 'ready',
  body,
  actions = '',
  widget = 'calibration',
  className = '',
  surface = 'card',
}) {
  assertOption(TIERS, tier, 'tier')
  assertOption(THEMES, theme, 'theme')
  if (tier === 'docked') return renderDockLine({ theme, label, body, widget, state })
  return `
    <article
      class="widget-frame ${className}"
      data-tier-frame="${escapeHtml(tier)}"
      data-theme="${escapeHtml(theme)}"
      data-state="${escapeHtml(state)}"
      data-widget-id="${escapeHtml(widget)}"
      data-surface="${escapeHtml(surface)}"
      aria-label="${escapeHtml(label)}"
    >
      <div class="widget-frame__wash" aria-hidden="true"></div>
      <header class="widget-frame__header">
        <span class="widget-frame__label">${escapeHtml(label)}</span>
        ${actions}
      </header>
      <div class="widget-frame__body" data-essential>${body}</div>
    </article>
  `
}

export function renderDockLine({ theme = 'dark', label, body, widget, state = 'ready' }) {
  assertOption(THEMES, theme, 'theme')
  return `
    <div
      class="dock-line"
      data-tier-frame="docked"
      data-theme="${escapeHtml(theme)}"
      data-state="${escapeHtml(state)}"
      data-widget-id="${escapeHtml(widget)}"
      aria-label="${escapeHtml(label)}"
    >
      <span class="dock-line__label">${escapeHtml(label)}</span>
      <div class="dock-line__body" data-essential>${body}</div>
    </div>
  `
}

export function renderStateSurface({ title, detail, action }) {
  return `
    <div class="state-surface" data-essential>
      <strong>${escapeHtml(title)}</strong>
      <span>${escapeHtml(detail)}</span>
      ${action ? `<button type="button">${escapeHtml(action)}</button>` : ''}
    </div>
  `
}

export function renderStack({ tier, theme = 'dark', label, members, active = 0 }) {
  if (!Array.isArray(members) || members.length < 2) throw new Error('A stack needs at least two members.')
  return `
    <section class="stack-shell" data-stack data-tier="${escapeHtml(tier)}" aria-label="${escapeHtml(label)}">
      <div class="stack-shell__members">
        ${members.map((member, index) => `<div data-stack-member="${escapeHtml(member.id)}" data-stack-active="${index === active}">${member.html}</div>`).join('')}
      </div>
      <nav class="stack-shell__navigation" aria-label="Stack pages">
        <button type="button" aria-label="Previous widget">&#8249;</button>
        <span>${members.map((member, index) => `<button type="button" aria-label="Show ${escapeHtml(member.label)}" aria-current="${index === active ? 'true' : 'false'}"></button>`).join('')}</span>
        <button type="button" aria-label="Next widget">&#8250;</button>
      </nav>
  </section>
`
}
