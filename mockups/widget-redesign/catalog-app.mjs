import {
  LEGACY_TARGET_MAP,
  SOURCE_WIDGET_IDS,
  TARGET_WIDGETS,
} from './catalog-model.mjs'
import { fixtureFor } from './fixtures.mjs'
import { renderFrame } from './renderers/shared.mjs'
import { renderWidgetFace } from './renderers/index.mjs'

const root = document.querySelector('#catalog-root')
const params = new URLSearchParams(location.search)
const view = params.get('view') ?? 'gallery'

const calibrationBody = (tier, measure, description) => `
  <div class="calibration" data-essential>
    <span class="calibration__measure">${measure}</span>
    <strong>${tier}</strong>
    <p>${description}</p>
  </div>
`

const runway = () => `
  <section class="runway" aria-labelledby="runway-title">
    <div class="section-heading">
      <div>
        <span class="eyebrow">External geometry</span>
        <h2 id="runway-title">The tier runway</h2>
      </div>
      <p>Three fixed canvases on one measured baseline. Useful information must earn every added pixel.</p>
    </div>
    <div class="runway__track">
      ${renderFrame({ tier: 'compact', label: 'Compact calibration', body: calibrationBody('Compact', '216 x 132', 'One signature, one glance.'), className: 'calibration-frame' })}
      ${renderFrame({ tier: 'standard', label: 'Standard calibration', body: calibrationBody('Standard', '320 x 200', 'A complete working view.'), className: 'calibration-frame' })}
      ${renderFrame({ tier: 'full', label: 'Full calibration', body: calibrationBody('Full', '460 x 284', 'A materially richer instrument.'), className: 'calibration-frame' })}
    </div>
  </section>
`

const inventory = () => `
  <section class="inventory" aria-labelledby="inventory-title">
    <div class="section-heading">
      <div>
        <span class="eyebrow">Coverage authority</span>
        <h2 id="inventory-title">36 live sources. 34 target identities.</h2>
      </div>
      <p>Calendar, Month, and Public Holidays resolve into one owner-approved Calendar candidate.</p>
    </div>
    <div class="inventory__grid">
      ${TARGET_WIDGETS.map((target) => `
        <article class="inventory-row" data-family="${target.family}" data-search="${target.label.toLowerCase()}">
          <span class="inventory-row__family">${target.family.replace('-', ' & ')}</span>
          <strong>${target.label}</strong>
          <span>${target.sourceIds.join(' + ')}</span>
          <span>${target.tiers.join(' / ')}</span>
        </article>
      `).join('')}
    </div>
  </section>
`

const coreGallery = () => {
  const targets = TARGET_WIDGETS.filter(({ family }) => family === 'core')
  return `
    <section class="family-gallery" aria-labelledby="core-title" data-family-section="core">
      <div class="section-heading">
        <div>
          <span class="eyebrow">Core instruments · 13 identities</span>
          <h2 id="core-title">Useful before decorative.</h2>
        </div>
        <p>Each tier has a distinct information budget. Docked forms carry weight, compact forms preserve a signature, and larger frames add working context.</p>
      </div>
      <div class="showcase-list">
        ${targets.map((target, index) => `
          <article
            class="widget-showcase"
            data-core-showcase="${target.id}"
            data-family="${target.family}"
            data-search="${target.label.toLowerCase()}"
          >
            <header class="widget-showcase__heading">
              <span>${String(index + 1).padStart(2, '0')}</span>
              <div><h3>${target.label}</h3><p>${target.budgets[target.primaryTier].purpose}</p></div>
              <small>${target.presentation}</small>
            </header>
            <div class="capture-run" aria-label="${target.label} tier comparison">
              ${target.tiers.map((tier) => `
                <div class="capture-stage capture-stage--${tier}">
                  <span>${tier}</span>
                  ${renderWidgetFace(
                    { id: target.id, tier, state: 'ready', theme: 'dark' },
                    fixtureFor(target.id, target.id === 'timer' ? 'running' : 'dense'),
                  )}
                </div>
              `).join('')}
            </div>
          </article>
        `).join('')}
      </div>
    </section>
  `
}

const shell = `
  <div class="catalog" data-catalog-app>
    <header class="catalog-hero">
      <div class="catalog-hero__copy">
        <span class="eyebrow">Owner review instrument</span>
        <h1>Aurora widgets, rebuilt around what matters.</h1>
        <p>Not a screenshot dump. A measured catalog for judging hierarchy, density, contrast, states, and stack parity before production changes.</p>
      </div>
      <div class="inventory-seal" data-catalog-inventory="36-to-34" aria-label="36 live source identities mapped to 34 target identities">
        <strong>36</strong>
        <span>source identities</span>
        <i aria-hidden="true"></i>
        <strong>34</strong>
        <span>target designs</span>
      </div>
    </header>
    <nav class="catalog-toolbar" aria-label="Catalog filters">
      <a href="?view=gallery" aria-current="${view === 'gallery' ? 'page' : 'false'}">Gallery</a>
      <a href="?view=inventory" aria-current="${view === 'inventory' ? 'page' : 'false'}">Inventory</a>
      <label>
        <span>Find a widget</span>
        <input type="search" placeholder="Calendar, GitHub, Weather" data-catalog-search>
      </label>
      <label>
        <span>Family</span>
        <select data-family-filter>
          <option value="all">All families</option>
          <option value="core">Core</option>
          <option value="calendar-sky">Calendar & sky</option>
          <option value="work">Work</option>
          <option value="resources">Resources</option>
        </select>
      </label>
    </nav>
    ${view === 'inventory' ? inventory() : `${runway()}${coreGallery()}${inventory()}`}
    <footer class="catalog-footer">
      <span>Design-only HTML/CSS</span>
      <span>${SOURCE_WIDGET_IDS.length} sources checked</span>
      <span>${Object.keys(LEGACY_TARGET_MAP).length} legacy date identities unified</span>
    </footer>
  </div>
`

root.innerHTML = shell

const applyFilters = () => {
  const search = root.querySelector('[data-catalog-search]').value.trim().toLowerCase()
  const family = root.querySelector('[data-family-filter]').value
  for (const row of root.querySelectorAll('.inventory-row, .widget-showcase')) {
    const matchesSearch = !search || row.dataset.search.includes(search)
    const matchesFamily = family === 'all' || row.dataset.family === family
    row.hidden = !(matchesSearch && matchesFamily)
  }
}

root.querySelector('[data-catalog-search]').addEventListener('input', applyFilters)
root.querySelector('[data-family-filter]').addEventListener('change', applyFilters)
