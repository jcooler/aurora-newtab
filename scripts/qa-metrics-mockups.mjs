import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { chromium } from 'playwright'

const SCRIPT_DIR = resolve(fileURLToPath(new URL('.', import.meta.url)))
const REPO_ROOT = resolve(SCRIPT_DIR, '..')
const SOURCE_SHA = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8' }).trim()
const OUTPUT_DIR = resolve(REPO_ROOT, 'artifacts', 'qa-metrics-mockups', SOURCE_SHA)

const readDataUrl = (path, mime) => `data:${mime};base64,${readFileSync(path).toString('base64')}`
const INTER_FONT = readDataUrl(resolve(REPO_ROOT, 'public', 'fonts', 'inter-variable.woff2'), 'font/woff2')
const DISPLAY_FONT = readDataUrl(resolve(REPO_ROOT, 'public', 'fonts', 'space-grotesk-variable.woff2'), 'font/woff2')
const BACKGROUND = readDataUrl(resolve(REPO_ROOT, 'public', 'photos', '32-qNXhVgRfU0E-original.jpg'), 'image/jpeg')

const RANGE_DATA = Object.freeze({
  '7d': Object.freeze({
    period: '7 days',
    active: 6,
    change: '1 more active day',
    comparison: '+1 day vs previous period',
    axisStart: 'Aug 27',
    points: [2, 3, 1, 4, 4, 5, 3],
    categories: [
      ['Focus', '3h 20m', '+45m'],
      ['Tasks', '12 done', '+4'],
      ['Habits', '86%', '+9 pts'],
      ['Calendar', '8h 30m', '-1h'],
      ['Development', '18 commits', '+5'],
      ['Fitness', '3 activities', '+1'],
    ],
  }),
  '30d': Object.freeze({
    period: '30 days',
    active: 22,
    change: '3 more active days',
    comparison: '+3 days vs previous period',
    axisStart: 'Aug 4',
    points: [1, 2, 2, 4, 3, 2, 5, 4, 3, 5, 4, 2, 3, 4, 5, 4, 3, 2, 4, 5],
    categories: [
      ['Focus', '9h 40m', '+1h 20m'],
      ['Tasks', '38 done', '+6'],
      ['Habits', '84%', '+7 pts'],
      ['Calendar', '27h busy', '-2h'],
      ['Development', '42 commits', '+8'],
      ['Fitness', '6 activities', '+2'],
    ],
  }),
  '90d': Object.freeze({
    period: '90 days',
    active: 68,
    change: '8 more active days',
    comparison: '+8 days vs previous period',
    axisStart: 'Jun 5',
    points: [1, 2, 3, 2, 4, 3, 4, 5, 3, 4, 4, 2, 3, 5, 4, 5, 4, 3, 5, 4, 5, 3, 4, 5],
    categories: [
      ['Focus', '31h 15m', '+4h 10m'],
      ['Tasks', '104 done', '+19'],
      ['Habits', '81%', '+5 pts'],
      ['Calendar', '79h busy', '-7h'],
      ['Development', '136 commits', '+22'],
      ['Fitness', '21 activities', '+6'],
    ],
  }),
  '365d': Object.freeze({
    period: '365 days',
    active: 274,
    change: '31 more active days',
    comparison: '+31 days vs previous period',
    axisStart: 'Sep 3',
    points: [2, 1, 2, 3, 2, 4, 3, 4, 3, 5, 4, 3, 4, 5, 4, 5, 3, 4, 5, 4, 5, 4, 3, 5],
    categories: [
      ['Focus', '126h 40m', '+18h'],
      ['Tasks', '462 done', '+74'],
      ['Habits', '79%', '+8 pts'],
      ['Calendar', '318h busy', '-21h'],
      ['Development', '584 commits', '+91'],
      ['Fitness', '88 activities', '+17'],
    ],
  }),
})

const SCENARIOS = Object.freeze([
  Object.freeze({ id: '01-locked-standard', kind: 'locked', tier: 'standard' }),
  Object.freeze({ id: '02-first-use-standard', kind: 'empty', tier: 'standard' }),
  Object.freeze({ id: '03-populated-compact', kind: 'compact', tier: 'compact', range: '7d' }),
  Object.freeze({ id: '04-populated-standard', kind: 'standard', tier: 'standard', range: '30d' }),
  Object.freeze({ id: '05-expanded-7d', kind: 'expanded', tier: 'full', range: '7d' }),
  Object.freeze({ id: '06-expanded-30d', kind: 'expanded', tier: 'full', range: '30d' }),
  Object.freeze({ id: '07-expanded-90d', kind: 'expanded', tier: 'full', range: '90d' }),
  Object.freeze({ id: '08-expanded-365d', kind: 'expanded', tier: 'full', range: '365d' }),
  Object.freeze({ id: '09-expired-history-readable', kind: 'expired', tier: 'full', range: '30d' }),
  Object.freeze({ id: '10-unavailable-retained-history', kind: 'unavailable', tier: 'full', range: '30d' }),
  Object.freeze({ id: '11-touch-narrow-standard', kind: 'standard', tier: 'standard', range: '30d', touch: true }),
])

const SIZE = Object.freeze({
  compact: Object.freeze({ width: 216, height: 132 }),
  standard: Object.freeze({ width: 320, height: 200 }),
  full: Object.freeze({ width: 460, height: 284 }),
})

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function activityBars(points, { compact = false } = {}) {
  const max = 6
  return `<div class="activity-bars${compact ? ' activity-bars--compact' : ''}" aria-hidden="true">
    ${points.map((value, index) => `<i style="--level:${Math.max(1, Math.round(value / max * 100))}%"${index === points.length - 1 ? ' data-today="true"' : ''}></i>`).join('')}
  </div>`
}

function chart(points, range) {
  const width = 252
  const height = 94
  const padX = 4
  const padY = 8
  const step = (width - padX * 2) / Math.max(1, points.length - 1)
  const coordinates = points.map((value, index) => ({
    x: padX + index * step,
    y: height - padY - (Math.max(0, Math.min(6, value)) / 6) * (height - padY * 2),
  }))
  const line = coordinates.map(({ x, y }, index) => `${index === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`).join(' ')
  const area = `${line} L${coordinates.at(-1).x.toFixed(2)} ${height - padY} L${coordinates[0].x.toFixed(2)} ${height - padY} Z`
  const last = coordinates.at(-1)
  return `<svg class="rhythm-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Daily activity rhythm for ${escapeHtml(range)}">
    <path class="chart-grid" d="M4 21 H248 M4 47 H248 M4 73 H248" />
    <path class="chart-area" d="${area}" />
    <path class="chart-line" d="${line}" />
    <circle class="chart-last" cx="${last.x.toFixed(2)}" cy="${last.y.toFixed(2)}" r="3.25" />
  </svg>`
}

function categoryRows(categories) {
  return `<div class="category-list" aria-label="Metric categories">
    ${categories.map(([label, value, delta]) => `<div class="category-row">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      <small>${escapeHtml(delta)}</small>
    </div>`).join('')}
  </div>`
}

function rangeControl(active) {
  return `<div class="range-control" role="group" aria-label="History range">
    ${['7d', '30d', '90d', '365d'].map((range) => `<button type="button" aria-pressed="${range === active}"${range === active ? ' class="is-active"' : ''}>${range}</button>`).join('')}
  </div>`
}

function compactWidget(data) {
  return `<section class="metrics-widget metrics-widget--compact" data-tier-frame="compact" aria-label="Metrics">
    <header class="compact-header"><strong>Metrics</strong><span>Last 7 days</span></header>
    <div class="compact-main">
      <div class="compact-score"><b>${data.active}<span>/7</span></b><small>active days</small></div>
      ${activityBars(data.points, { compact: true })}
    </div>
    <div class="compact-support"><span><b>12</b> tasks</span><span><b>200</b> focus min</span></div>
  </section>`
}

function standardWidget(data) {
  return `<section class="metrics-widget metrics-widget--standard" data-tier-frame="standard" aria-label="Metrics">
    <header class="standard-header"><strong>Metrics</strong><button type="button" data-primary-action>View history</button></header>
    <div class="standard-summary"><div><b>${data.active}</b><span>active days</span><small>${escapeHtml(data.change)} than before</small></div>${activityBars(data.points)}</div>
    <div class="standard-support" aria-label="Thirty day summary">
      <span><small>Focus</small><b>${escapeHtml(data.categories[0][1])}</b></span>
      <span><small>Tasks</small><b>${escapeHtml(data.categories[1][1])}</b></span>
      <span><small>Habits</small><b>${escapeHtml(data.categories[2][1])}</b></span>
    </div>
  </section>`
}

function expandedHeader(range, status = '', action = '') {
  if (status) {
    return `<header class="expanded-header expanded-header--status"><strong>Metrics</strong><span class="plain-status"><i></i>${escapeHtml(status)}</span>${action ? `<button type="button" data-primary-action>${escapeHtml(action)}</button>` : ''}</header>`
  }
  return `<header class="expanded-header"><strong>Metrics</strong>${rangeControl(range)}</header>`
}

function expandedBody(data, range, notice = '') {
  return `<div class="expanded-content">
    <div class="trend-region">
      <div class="trend-summary"><div><b>${data.active}</b><span>active days</span></div><small>${escapeHtml(data.comparison)}</small></div>
      ${chart(data.points, data.period)}
      <div class="axis-copy"><span>${escapeHtml(data.axisStart)}</span><span>Today</span></div>
      ${notice ? `<div class="collection-notice" role="status"><span>${escapeHtml(notice)}</span><button type="button">Try again</button></div>` : ''}
    </div>
    ${categoryRows(data.categories)}
  </div>`
}

function expandedWidget(data, range, state = 'ready') {
  const status = state === 'expired' ? 'History paused' : state === 'unavailable' ? 'Update interrupted' : ''
  const action = state === 'expired' ? 'Renew' : ''
  const notice = state === 'unavailable' ? 'History safe. Updates paused.' : ''
  return `<section class="metrics-widget metrics-widget--full metrics-widget--${state}" data-tier-frame="full" aria-label="Metrics">
    ${expandedHeader(range, status, action)}
    ${expandedBody(data, range, notice)}
  </section>`
}

function lockedWidget() {
  return `<section class="metrics-widget metrics-widget--standard state-widget state-widget--locked" data-tier-frame="standard" aria-label="Metrics">
    <div class="state-kicker"><span class="pulse-mark"><i></i><i></i><i></i><i></i><i></i></span><span>Private metrics</span></div>
    <h1>See the rhythm behind your days.</h1>
    <p>Understand focus, habits, tasks, and more without syncing raw activity.</p>
    <button type="button" data-primary-action>See premium plans <span aria-hidden="true">→</span></button>
  </section>`
}

function emptyWidget() {
  return `<section class="metrics-widget metrics-widget--standard state-widget state-widget--empty" data-tier-frame="standard" aria-label="Metrics">
    <header><strong>Metrics</strong><span>Ready when you are</span></header>
    <div class="empty-rhythm" aria-hidden="true">${Array.from({ length: 7 }, (_, index) => `<i${index === 0 ? ' class="is-first"' : ''}></i>`).join('')}</div>
    <h1>Your first week starts here.</h1>
    <p>Complete a habit, task, or Focus session and your private history begins automatically.</p>
  </section>`
}

function widgetFor(scenario) {
  if (scenario.kind === 'locked') return lockedWidget()
  if (scenario.kind === 'empty') return emptyWidget()
  if (scenario.kind === 'compact') return compactWidget(RANGE_DATA[scenario.range])
  if (scenario.kind === 'standard') return standardWidget(RANGE_DATA[scenario.range])
  if (scenario.kind === 'expired') return expandedWidget(RANGE_DATA[scenario.range], scenario.range, 'expired')
  if (scenario.kind === 'unavailable') return expandedWidget(RANGE_DATA[scenario.range], scenario.range, 'unavailable')
  return expandedWidget(RANGE_DATA[scenario.range], scenario.range)
}

function documentFor(scenario) {
  const viewport = scenario.touch ? { width: 390, height: 440 } : { width: 720, height: 480 }
  return { viewport, html: `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <style>
    @font-face { font-family: Inter; src: url('${INTER_FONT}') format('woff2'); font-weight: 100 900; }
    @font-face { font-family: 'Space Grotesk'; src: url('${DISPLAY_FONT}') format('woff2'); font-weight: 300 700; }
    :root {
      color-scheme: dark;
      --fg: #f5f5f4;
      --muted: rgb(245 245 244 / .68);
      --faint: rgb(245 245 244 / .42);
      --accent: #7dd3fc;
      --accent-soft: rgb(125 211 252 / .10);
      --panel: rgb(10 10 10 / .94);
      --hairline: rgb(245 245 244 / .09);
      --control: rgb(245 245 244 / .06);
      --control-hover: rgb(245 245 244 / .11);
      --warning: #fbbf77;
    }
    * { box-sizing: border-box; }
    html, body { margin: 0; width: 100%; min-height: 100%; background: #090b0d; color: var(--fg); font-family: Inter, system-ui, sans-serif; }
    button { font: inherit; }
    .capture {
      position: relative;
      display: grid;
      width: ${viewport.width}px;
      height: ${viewport.height}px;
      place-items: center;
      overflow: hidden;
      background-image: linear-gradient(rgb(2 6 23 / .22), rgb(2 6 23 / .36)), url('${BACKGROUND}');
      background-position: center 42%;
      background-size: cover;
    }
    .capture::after { position: absolute; inset: 0; background: rgb(0 0 0 / .10); content: ''; pointer-events: none; }
    .metrics-widget {
      position: relative;
      z-index: 1;
      flex: none;
      overflow: hidden;
      border: 1px solid var(--hairline);
      border-radius: 16px;
      background: var(--panel);
      box-shadow: 0 18px 44px rgb(0 0 0 / .34), inset 0 1px 0 rgb(255 255 255 / .025);
      color: var(--fg);
      backdrop-filter: blur(14px);
    }
    .metrics-widget--compact { width: 216px; height: 132px; padding: 11px 12px 9px; }
    .metrics-widget--standard { width: 320px; height: 200px; padding: 14px 16px; }
    .metrics-widget--full { width: 460px; height: 284px; padding: 13px 14px; }
    button { min-width: 0; border: 0; background: none; color: inherit; cursor: pointer; }
    button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
    strong, h1, b { font-family: 'Space Grotesk', Inter, sans-serif; }
    .compact-header, .standard-header, .expanded-header { display: flex; align-items: center; justify-content: space-between; }
    .compact-header strong, .standard-header strong, .expanded-header > strong { font-size: 13px; font-weight: 580; letter-spacing: -.02em; }
    .compact-header span { color: var(--muted); font-size: 11px; }
    .compact-main { display: grid; grid-template-columns: 72px 1fr; align-items: end; gap: 10px; height: 69px; }
    .compact-score b { display: block; font-size: 30px; font-weight: 500; letter-spacing: -.055em; line-height: .9; }
    .compact-score b span { margin-left: 2px; color: var(--muted); font-family: Inter, sans-serif; font-size: 12px; font-weight: 550; letter-spacing: 0; }
    .compact-score small { display: block; margin-top: 5px; color: var(--muted); font-size: 11px; }
    .activity-bars { display: flex; height: 42px; align-items: end; gap: 3px; }
    .activity-bars i { display: block; min-width: 2px; height: max(4px, var(--level)); flex: 1; border-radius: 2px 2px 0 0; background: rgb(125 211 252 / .29); }
    .activity-bars i:nth-child(3n), .activity-bars i[data-today="true"] { background: var(--accent); }
    .activity-bars i[data-today="true"] { box-shadow: 0 0 0 1px rgb(125 211 252 / .2); }
    .activity-bars--compact { height: 48px; gap: 4px; }
    .activity-bars--compact i { min-width: 5px; }
    .compact-support { display: flex; align-items: center; justify-content: space-between; height: 25px; border-top: 1px solid var(--hairline); color: var(--muted); font-size: 11px; }
    .compact-support b { margin-right: 2px; color: var(--fg); font-family: Inter, sans-serif; font-weight: 650; }
    .standard-header { height: 32px; }
    .standard-header button { min-height: 36px; margin-right: -7px; padding: 0 8px; color: var(--accent); font-size: 11px; font-weight: 650; }
    .standard-summary { display: grid; grid-template-columns: 118px 1fr; align-items: center; gap: 10px; height: 88px; }
    .standard-summary > div:first-child { display: grid; grid-template-columns: auto 1fr; align-items: baseline; column-gap: 7px; }
    .standard-summary > div:first-child b { font-size: 39px; font-weight: 470; letter-spacing: -.06em; line-height: .9; }
    .standard-summary > div:first-child span { color: var(--fg); font-size: 11px; font-weight: 600; }
    .standard-summary > div:first-child small { grid-column: 1 / -1; margin-top: 9px; color: var(--muted); font-size: 11px; line-height: 1.25; }
    .standard-summary .activity-bars { height: 55px; }
    .standard-support { display: grid; grid-template-columns: 1fr 1fr 1fr; height: 50px; border-top: 1px solid var(--hairline); }
    .standard-support > span { display: flex; min-width: 0; flex-direction: column; justify-content: end; padding-bottom: 1px; }
    .standard-support > span + span { border-left: 1px solid var(--hairline); padding-left: 12px; }
    .standard-support small { color: var(--muted); font-size: 11px; }
    .standard-support b { margin-top: 3px; overflow: hidden; font-size: 13px; font-weight: 570; text-overflow: ellipsis; white-space: nowrap; }
    .expanded-header { height: 35px; border-bottom: 1px solid var(--hairline); padding-bottom: 8px; }
    .range-control { display: flex; align-items: center; gap: 2px; border-radius: 9px; background: var(--control); padding: 2px; }
    .range-control button { min-width: 46px; min-height: 27px; border-radius: 7px; color: var(--muted); font-size: 11px; font-weight: 620; }
    .range-control button:hover { background: var(--control-hover); color: var(--fg); }
    .range-control button.is-active { background: rgb(125 211 252 / .13); box-shadow: inset 0 0 0 1px rgb(125 211 252 / .28); color: var(--fg); }
    .expanded-content { display: grid; grid-template-columns: minmax(0, 1fr) 148px; gap: 14px; height: 222px; padding-top: 12px; }
    .trend-region { position: relative; min-width: 0; padding-right: 14px; border-right: 1px solid var(--hairline); }
    .trend-summary { display: flex; min-height: 44px; align-items: flex-start; justify-content: space-between; gap: 10px; }
    .trend-summary > div { display: flex; align-items: baseline; gap: 7px; }
    .trend-summary b { font-size: 30px; font-weight: 480; letter-spacing: -.055em; line-height: .9; }
    .trend-summary span { font-size: 11px; font-weight: 620; }
    .trend-summary > small { max-width: 108px; color: var(--muted); font-size: 11px; line-height: 1.25; text-align: right; }
    .rhythm-chart { display: block; width: 100%; height: 120px; overflow: visible; }
    .chart-grid { fill: none; stroke: rgb(245 245 244 / .07); stroke-width: 1; }
    .chart-area { fill: rgb(125 211 252 / .08); }
    .chart-line { fill: none; stroke: var(--accent); stroke-linecap: round; stroke-linejoin: round; stroke-width: 2; }
    .chart-last { fill: var(--panel); stroke: var(--accent); stroke-width: 2; }
    .axis-copy { display: flex; justify-content: space-between; margin-top: -6px; color: var(--faint); font-size: 11px; }
    .category-list { display: grid; min-width: 0; grid-template-rows: repeat(6, 1fr); }
    .category-row { display: grid; min-width: 0; grid-template-columns: minmax(0, 1fr) auto; align-content: center; column-gap: 7px; border-bottom: 1px solid var(--hairline); }
    .category-row:last-child { border-bottom: 0; }
    .category-row > span { overflow: hidden; color: var(--muted); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
    .category-row strong { overflow: hidden; font-family: Inter, sans-serif; font-size: 11px; font-weight: 630; text-overflow: ellipsis; white-space: nowrap; }
    .category-row small { grid-column: 2; color: var(--accent); font-size: 11px; text-align: right; }
    .expanded-header--status { justify-content: flex-start; gap: 10px; }
    .expanded-header--status > button { min-height: 32px; margin-left: auto; border: 1px solid rgb(125 211 252 / .35); border-radius: 8px; background: var(--accent-soft); padding: 0 12px; color: var(--accent); font-size: 11px; font-weight: 650; }
    .plain-status { display: inline-flex; align-items: center; gap: 6px; color: var(--muted); font-size: 11px; }
    .plain-status i { width: 5px; height: 5px; border-radius: 50%; background: var(--warning); }
    .metrics-widget--unavailable .expanded-content { height: 222px; }
    .collection-notice { position: absolute; right: 14px; bottom: 0; left: 0; display: flex; min-height: 32px; align-items: center; justify-content: space-between; gap: 8px; border-top: 1px solid rgb(251 191 119 / .24); background: var(--panel); color: var(--muted); font-size: 11px; }
    .collection-notice span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .collection-notice button { min-height: 30px; flex: none; color: var(--warning); font-size: 11px; font-weight: 650; }
    .state-widget { display: flex; flex-direction: column; align-items: flex-start; }
    .state-widget h1 { margin: 0; font-size: 22px; font-weight: 520; letter-spacing: -.04em; line-height: 1.05; }
    .state-widget p { margin: 9px 0 0; color: var(--muted); font-size: 11px; line-height: 1.45; }
    .state-kicker { display: flex; align-items: center; gap: 10px; margin-bottom: 18px; color: var(--accent); font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
    .pulse-mark { display: flex; height: 18px; align-items: end; gap: 2px; }
    .pulse-mark i { width: 3px; border-radius: 2px; background: var(--accent); }
    .pulse-mark i:nth-child(1) { height: 5px; opacity: .5; }
    .pulse-mark i:nth-child(2) { height: 11px; opacity: .75; }
    .pulse-mark i:nth-child(3) { height: 17px; }
    .pulse-mark i:nth-child(4) { height: 9px; opacity: .7; }
    .pulse-mark i:nth-child(5) { height: 13px; opacity: .86; }
    .state-widget--locked > button { min-height: 42px; margin-top: auto; margin-left: -10px; padding: 0 10px; color: var(--accent); font-size: 11px; font-weight: 670; }
    .state-widget--locked > button span { display: inline-block; margin-left: 5px; transition: transform 160ms ease-out; }
    .state-widget--locked > button:hover span { transform: translateX(2px); }
    .state-widget--empty header { display: flex; width: 100%; align-items: center; justify-content: space-between; }
    .state-widget--empty header strong { font-size: 13px; font-weight: 580; }
    .state-widget--empty header span { color: var(--muted); font-size: 11px; }
    .empty-rhythm { display: flex; width: 100%; height: 43px; align-items: end; justify-content: space-between; margin: 8px 0 9px; border-bottom: 1px solid var(--hairline); }
    .empty-rhythm i { width: 28px; height: 3px; border-radius: 2px; background: rgb(245 245 244 / .10); }
    .empty-rhythm i.is-first { background: rgb(125 211 252 / .45); }
    .state-widget--empty h1 { font-size: 19px; }
    .state-widget--empty p { margin-top: 6px; }
    @media (pointer: coarse) {
      .standard-header button { min-width: 82px; min-height: 44px; }
    }
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after { scroll-behavior: auto !important; animation: none !important; transition: none !important; }
    }
  </style>
</head>
<body>
  <main id="capture" class="capture" data-scenario="${scenario.id}">
    ${widgetFor(scenario)}
  </main>
</body>
</html>` }
}

function safeRelative(path) {
  const value = relative(REPO_ROOT, path).replaceAll('\\', '/')
  assert(!value.startsWith('..'), `Metrics mockup output escaped the repository: ${path}`)
  return value
}

async function inspect(page, scenario) {
  return page.locator('.metrics-widget').evaluate((root, expected) => {
    const rect = root.getBoundingClientRect()
    const visibleText = [...root.querySelectorAll('*')].filter((node) => {
      const style = getComputedStyle(node)
      const box = node.getBoundingClientRect()
      return node.children.length === 0 && node.textContent.trim() && style.display !== 'none' && box.width > 0 && box.height > 0
    })
    const buttons = [...root.querySelectorAll('button')].map((button) => {
      const box = button.getBoundingClientRect()
      return { text: button.textContent.trim(), width: box.width, height: box.height }
    })
    return {
      frame: { width: rect.width, height: rect.height },
      contentBox: {
        clientWidth: root.clientWidth,
        clientHeight: root.clientHeight,
        scrollWidth: root.scrollWidth,
        scrollHeight: root.scrollHeight,
      },
      internalOverflow: root.scrollWidth > root.clientWidth + 1 || root.scrollHeight > root.clientHeight + 1,
      pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      textFloor: Math.min(...visibleText.map((node) => Number.parseFloat(getComputedStyle(node).fontSize))),
      buttons,
      primaryActions: root.querySelectorAll('[data-primary-action]').length,
      activeRanges: root.querySelectorAll('.range-control button[aria-pressed="true"]').length,
      label: root.getAttribute('aria-label'),
      expected,
    }
  }, SIZE[scenario.tier])
}

async function run() {
  mkdirSync(OUTPUT_DIR, { recursive: true })
  const browser = await chromium.launch({ headless: true })
  const evidence = {
    version: 1,
    sourceSha: SOURCE_SHA,
    generatedAt: new Date().toISOString(),
    result: 'PASS',
    captures: [],
  }
  try {
    for (const scenario of SCENARIOS) {
      const { viewport, html } = documentFor(scenario)
      const context = await browser.newContext({
        viewport,
        screen: viewport,
        deviceScaleFactor: 1,
        hasTouch: Boolean(scenario.touch),
        reducedMotion: 'reduce',
      })
      const page = await context.newPage()
      const runtime = { consoleErrors: [], pageErrors: [], networkRequests: [] }
      page.on('console', (message) => { if (message.type() === 'error') runtime.consoleErrors.push(message.text()) })
      page.on('pageerror', (error) => runtime.pageErrors.push(error.message))
      page.on('request', (request) => { if (!request.url().startsWith('data:')) runtime.networkRequests.push(request.url()) })
      await page.setContent(html, { waitUntil: 'domcontentloaded' })
      await page.evaluate(() => document.fonts.ready)
      const measurements = await inspect(page, scenario)
      const expected = SIZE[scenario.tier]
      assert.equal(measurements.frame.width, expected.width, `${scenario.id} width`)
      assert.equal(measurements.frame.height, expected.height, `${scenario.id} height`)
      assert.equal(measurements.internalOverflow, false, `${scenario.id} internal overflow ${JSON.stringify(measurements.contentBox)}`)
      assert.equal(measurements.pageOverflow, false, `${scenario.id} page overflow`)
      assert.equal(measurements.textFloor >= 11, true, `${scenario.id} text floor is ${measurements.textFloor}px`)
      assert.equal(measurements.label, 'Metrics', `${scenario.id} accessible label`)
      assert.deepEqual(runtime, { consoleErrors: [], pageErrors: [], networkRequests: [] }, `${scenario.id} runtime ledger`)
      if (scenario.kind === 'expanded') assert.equal(measurements.activeRanges, 1, `${scenario.id} active range`)
      if (scenario.kind === 'locked') assert.equal(measurements.primaryActions, 1, `${scenario.id} locked action`)
      if (scenario.kind === 'expired') assert.equal(measurements.primaryActions, 1, `${scenario.id} expired action`)
      if (scenario.touch) {
        const action = measurements.buttons.find(({ text }) => text === 'View history')
        assert(action, `${scenario.id} View history action`)
        assert(action.width >= 44 && action.height >= 44, `${scenario.id} touch action is ${action.width}x${action.height}`)
      }
      const path = resolve(OUTPUT_DIR, `${scenario.id}.png`)
      await page.locator('#capture').screenshot({ path })
      evidence.captures.push({
        id: scenario.id,
        path: safeRelative(path),
        viewport,
        tier: scenario.tier,
        kind: scenario.kind,
        range: scenario.range ?? null,
        measurements,
        runtime,
      })
      await context.close()
    }
  } catch (error) {
    evidence.result = 'FAIL'
    evidence.error = error instanceof Error ? error.stack : String(error)
    throw error
  } finally {
    await browser.close()
    writeFileSync(resolve(OUTPUT_DIR, 'evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')
  }
  process.stdout.write(`PASS: ${evidence.captures.length} original-resolution Metrics mockups\n${OUTPUT_DIR}\n`)
}

await run()
