// NL-P6 QA storage scenarios (plan: docs/superpowers/plans/2026-08-19-nl-p6-
// product-qa.md, Task 1): four storage shapes the product must be useful
// under, per the corrected A2-D060 standard's "existing-layout-shaped
// storage" demand. Each `seed(page)` runs against a page whose extension
// storage is already initialized (canvas selector present) and writes
// chrome.storage.local directly; the harness reloads after seeding.
import { seedInformationFirstFixtures } from './information-first-fixtures.mjs'

/** The saved v1 layouts document exercising EVERY placement kind and
 *  refinement at once: free (anchor+offset+tier+layer), docked with exact x,
 *  a stored docked tier (compact bookmarks marks), a legacy align-only
 *  docked member (compat read), a hidden widget, and custom appearance inks. */
async function seedNamedSaved(page) {
  await page.evaluate(async () => {
    const { settings } = await chrome.storage.local.get('settings')
    await chrome.storage.local.set({
      settings: {
        ...settings,
        widgets: { ...settings.widgets, weather: true, monthCal: true, sun: true, moon: true, timer: true },
        panelColor: '#123a5e',
        widgetTextColor: '#e8f4ff',
        photoTextColor: null,
        photoClockColor: '#ffd9a0',
      },
      layouts: {
        version: 1,
        activeLayoutId: 'qa-main',
        layouts: [
          {
            id: 'qa-main',
            name: 'QA main',
            widgets: {
              clock: { kind: 'free', anchor: 'center', offsetX: 0, offsetY: -24, tier: 'full', layer: 0 },
              focus: { kind: 'free', anchor: 'center', offsetX: 0, offsetY: 8, tier: 'standard', layer: 1 },
              monthCal: { kind: 'free', anchor: 'left', offsetX: 9, offsetY: -2, tier: 'standard', layer: 2 },
              quote: { kind: 'hidden' },
              weather: { kind: 'docked', dock: 'bottom', order: 0, x: 30 },
              timer: { kind: 'docked', dock: 'bottom', order: 1, x: 70, align: 'end' },
              sun: { kind: 'docked', dock: 'top', order: 0, x: 12 },
              bookmarks: { kind: 'docked', dock: 'top', order: 1, x: 55, tier: 'compact' },
            },
          },
          { id: 'qa-alt', name: 'QA alt', widgets: {} },
        ],
      },
    })
  })
}

export const SCENARIOS = [
  {
    id: 'fresh',
    note: 'Post-init defaults: no layouts document, no legacy layout content — the static default composition / derived My layout.',
    seed: async () => {},
  },
  {
    id: 'legacy-v1',
    note: 'A V1-shaped legacy `layout` key with user positions and NO layouts document: the migration-derivation path.',
    seed: async (page) => {
      await page.evaluate(async () => {
        await chrome.storage.local.set({
          layout: {
            clock: { x: 50, y: 22 },
            focus: { x: 50, y: 52 },
            quote: { x: 50, y: 84 },
            bookmarks: { x: 50, y: 4 },
          },
        })
      })
    },
  },
  {
    id: 'named-saved',
    note: 'A saved v1 layouts document: free/docked-x/docked-tier/legacy-align/hidden placements plus custom appearance inks.',
    seed: seedNamedSaved,
  },
  {
    id: 'connectors',
    note: 'named-saved plus the nine-connector fixture data: github docked with facts, gitlab/jira/vercel free on the right rail.',
    seed: async (page) => {
      await seedNamedSaved(page)
      await seedInformationFirstFixtures(page)
      await page.evaluate(async () => {
        const { layouts } = await chrome.storage.local.get('layouts')
        const active = layouts.layouts.find((layout) => layout.id === layouts.activeLayoutId)
        active.widgets.github = { kind: 'docked', dock: 'bottom', order: 2, x: 85 }
        active.widgets.gitlab = { kind: 'free', anchor: 'right', offsetX: -8, offsetY: -20, tier: 'standard', layer: 3 }
        active.widgets.jira = { kind: 'free', anchor: 'right', offsetX: -8, offsetY: 0, tier: 'standard', layer: 4 }
        active.widgets.vercel = { kind: 'free', anchor: 'right', offsetX: -8, offsetY: 20, tier: 'standard', layer: 5 }
        await chrome.storage.local.set({ layouts })
      })
    },
  },
]
