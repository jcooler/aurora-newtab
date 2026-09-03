import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { chromium } from 'playwright'

const SCRIPT_DIR = resolve(fileURLToPath(new URL('.', import.meta.url)))
const REPO_ROOT = resolve(SCRIPT_DIR, '..')
const SOURCE_SHA = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8' }).trim()
const OUTPUT_DIR = resolve(REPO_ROOT, 'artifacts', 'qa-google-calendar-mockups', SOURCE_SHA)

const dataUrl = (path, mime) => `data:${mime};base64,${readFileSync(path).toString('base64')}`
const INTER = dataUrl(resolve(REPO_ROOT, 'public', 'fonts', 'inter-variable.woff2'), 'font/woff2')
const DISPLAY = dataUrl(resolve(REPO_ROOT, 'public', 'fonts', 'space-grotesk-variable.woff2'), 'font/woff2')
const LOGO = dataUrl(resolve(REPO_ROOT, 'public', 'icons', 'icon32.png'), 'image/png')
const BACKGROUND = dataUrl(resolve(REPO_ROOT, 'public', 'photos', '32-qNXhVgRfU0E-original.jpg'), 'image/jpeg')

const DESKTOP = Object.freeze({ width: 1600, height: 900 })
const CALENDAR = Object.freeze({ width: 1408, height: 600 })
const TOUCH = Object.freeze({ width: 390, height: 844 })

const SCENARIOS = Object.freeze([
  Object.freeze({ id: '01-premium-locked', viewport: DESKTOP, body: premiumLocked }),
  Object.freeze({ id: '02-read-only-consent', viewport: DESKTOP, body: readOnlyConsent }),
  Object.freeze({ id: '03-connecting', viewport: DESKTOP, body: connecting }),
  Object.freeze({ id: '04-calendar-selection', viewport: DESKTOP, body: calendarSelection }),
  Object.freeze({ id: '05-two-accounts-connected', viewport: DESKTOP, body: twoAccounts }),
  Object.freeze({ id: '06-one-account-needs-attention', viewport: DESKTOP, body: accountAttention }),
  Object.freeze({ id: '07-disconnect-and-history', viewport: DESKTOP, body: disconnectDialog }),
  Object.freeze({ id: '08-composed-calendar', viewport: CALENDAR, body: composedCalendar, canvas: true }),
  Object.freeze({ id: '09-touch-calendar-selection', viewport: TOUCH, body: touchCalendarSelection, touch: true }),
])

function esc(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function providerMark() {
  return `<span class="provider-mark" aria-hidden="true"><i></i><b>31</b></span>`
}

function premiumTag() {
  return '<span class="premium-tag">Premium</span>'
}

function status(kind, label) {
  return `<span class="status status--${kind}"><i aria-hidden="true"></i>${esc(label)}</span>`
}

function checkIcon() {
  return '<span class="check" aria-hidden="true">✓</span>'
}

function calendarRow({ color, name, detail, checked = false, disabled = false }) {
  return `<label class="calendar-row${disabled ? ' is-disabled' : ''}">
    <input type="checkbox" ${checked ? 'checked' : ''} ${disabled ? 'disabled' : ''}>
    <span class="checkbox" aria-hidden="true"></span>
    <span class="calendar-dot" style="--calendar:${esc(color)}" aria-hidden="true"></span>
    <span class="calendar-copy"><strong>${esc(name)}</strong><small>${esc(detail)}</small></span>
  </label>`
}

function desktopShell(content, { selected = 'Connectors', close = true } = {}) {
  const items = ['General', 'Progress', 'Widgets', 'Connectors', 'Data', 'Account & Sync']
  return `<div class="settings-shell">
    <aside class="sidebar">
      <div class="brand"><img src="${LOGO}" alt=""><div><strong>Tab Two</strong><span>Settings</span></div></div>
      <nav aria-label="Settings sections">${items.map((item) => `<button type="button" class="nav-item${item === selected ? ' is-selected' : ''}">${esc(item)}</button>`).join('')}</nav>
      <div class="sidebar-foot"><span>Local-first</span><b>v2.0</b></div>
    </aside>
    <main class="settings-main" aria-label="Google Calendar settings">
      ${close ? '<button class="close" type="button" aria-label="Close settings">×</button>' : ''}
      <div class="content">${content}</div>
    </main>
  </div>`
}

function mobileShell(content) {
  return `<div class="mobile-shell">
    <header class="mobile-head"><button type="button" aria-label="Back to connectors">←</button><div class="brand"><img src="${LOGO}" alt=""><div><strong>Tab Two</strong><span>Connectors</span></div></div><button type="button" aria-label="Close settings">×</button></header>
    <main class="mobile-main" aria-label="Google Calendar settings">${content}</main>
  </div>`
}

function providerHeader(eyebrow, title, subtitle, trailing = premiumTag()) {
  return `<header class="provider-head">
    ${providerMark()}
    <div class="provider-title"><span class="eyebrow">${esc(eyebrow)}</span><h1>${esc(title)} ${trailing}</h1><p>${esc(subtitle)}</p></div>
  </header>`
}

function premiumLocked() {
  return desktopShell(`${providerHeader('Calendar & tasks', 'Google Calendar', 'Automatic discovery for every calendar you choose.')}
    <section class="hero hero--locked">
      <div class="hero-copy">
        <span class="section-label">YOUR CALENDARS, TOGETHER</span>
        <h2>Your whole week,<br>without the copy-paste.</h2>
        <p>Connect one or more Google accounts and keep the Calendar you already use in Tab Two.</p>
        <button class="primary" data-primary type="button">See premium plans <span aria-hidden="true">→</span></button>
      </div>
      <div class="benefit-list" aria-label="Premium Google Calendar benefits">
        <div>${checkIcon()}<span><strong>Connect in a few clicks</strong><small>No secret calendar links to find or paste.</small></span></div>
        <div>${checkIcon()}<span><strong>Bring more than one account</strong><small>Keep personal and work schedules together.</small></span></div>
        <div>${checkIcon()}<span><strong>Read-only by design</strong><small>Tab Two cannot change events or send invitations.</small></span></div>
        <div>${checkIcon()}<span><strong>Private calendar-load trends</strong><small>Only numeric totals enter encrypted Metrics history.</small></span></div>
      </div>
    </section>
    <footer class="quiet-foot"><span>Prefer a calendar link?</span><button type="button">ICS Calendar stays free</button></footer>`)
}

function readOnlyConsent() {
  return desktopShell(`${providerHeader('Connect Google Calendar', 'Read your schedule. Never change it.', 'Review access before Google opens.', '<span class="readonly-tag">Read-only</span>')}
    <section class="consent-layout">
      <div class="consent-intro">
        <span class="section-label">BEFORE YOU CONTINUE</span>
        <h2>Choose what appears in Tab Two.</h2>
        <p>See the calendars you choose from one or more Google accounts. Tab Two can read calendar names, colors, and events so your agenda and private calendar-load metrics stay current.</p>
        <div class="consent-actions"><button class="primary" data-primary type="button">Continue with Google <span aria-hidden="true">→</span></button><button class="secondary" type="button">Cancel</button></div>
        <p class="permission-note">Chrome will also ask to let Tab Two communicate with googleapis.com. Chrome uses broad website-permission wording, but the Google grant itself remains read-only.</p>
      </div>
      <div class="access-columns access-columns--trust">
        <section><span class="section-label">WHAT YOU’LL GET</span><ul><li>${checkIcon()} Calendar names and colors</li><li>${checkIcon()} Events in calendars you select</li><li>${checkIcon()} Times and meeting links</li></ul></section>
        <section class="read-only-assurance"><span class="shield" aria-hidden="true">◇</span><div><span class="section-label">READ-ONLY CONNECTION</span><strong>Your calendar stays yours.</strong><p>Tab Two only displays the calendars you select and never changes events or sends invitations.</p></div></section>
      </div>
    </section>
    <aside class="privacy-strip" aria-label="Privacy"><span class="shield" aria-hidden="true">◇</span><div><strong>Event details go from Google directly to this browser.</strong><p>Tab Two's service keeps an encrypted connection token so this installation can reconnect, but it does not receive your event details. No Gmail, Drive, or Contacts access is requested. Event details and sync cursors stay on this device and are never included in backup, encrypted sync, diagnostics, or logs.</p></div></aside>`)
}

function connecting() {
  return desktopShell(`${providerHeader('Connect Google Calendar', 'Opening Google...', 'Choose the account you want in Google’s window.', '<span class="readonly-tag">Read-only</span>')}
    <section class="opening-state" role="status">
      <div class="orbit" aria-hidden="true"><span></span>${providerMark()}</div>
      <h2>Google is ready for you.</h2>
      <p>Select an account and review Google's consent screen. This window will continue automatically when you return.</p>
      <div class="opening-actions"><button class="primary pending" data-primary type="button" disabled><span class="spinner" aria-hidden="true"></span>Opening Google...</button><button class="secondary" type="button">Cancel</button></div>
      <small>If no Google window appeared, allow pop-ups for this action and try again.</small>
    </section>
    <div class="trust-line"><span aria-hidden="true">✓</span> Tab Two has not received calendar access yet.</div>`)
}

function calendarSelection() {
  const rows = [
    { color: '#4285f4', name: 'Jon Cooler', detail: 'Primary calendar', checked: true },
    { color: '#0b8043', name: 'Family', detail: 'Shared calendar', checked: true },
    { color: '#d50000', name: 'Deadlines', detail: '12 upcoming events', checked: true },
    { color: '#8e24aa', name: 'Birthdays', detail: 'All-day events', checked: false },
    { color: '#f6bf26', name: 'Reminders', detail: 'No event-read access', disabled: true },
  ]
  return desktopShell(`${providerHeader('Google Calendar', 'Choose calendars', 'jonathan.r.cooler@gmail.com', status('good', 'Connected'))}
    <section class="picker-layout">
      <div class="picker-copy"><span class="section-label">WHAT SHOULD APPEAR?</span><h2>Start with what matters.</h2><p>Your primary calendar is selected for you. Add shared or secondary calendars now, or change this list later.</p>
        <div class="account-note"><span class="avatar">JC</span><div><strong>Jon Cooler</strong><small>Google account 1 of 5</small></div></div>
      </div>
      <div class="picker-panel"><div class="picker-bar"><div><strong>Calendars</strong><span>3 selected</span></div><button type="button">Select visible</button></div><div class="calendar-list">${rows.map(calendarRow).join('')}</div></div>
    </section>
    <footer class="action-bar"><p><strong>3 calendars selected</strong><span>Colors stay matched to Google.</span></p><div><button class="secondary" type="button">Back</button><button class="primary" data-primary type="button">Add to Tab Two</button></div></footer>`)
}

function accountSummaryRow({ initials, email, statusHtml, calendars, action = 'Manage', attention = false }) {
  return `<article class="account-row${attention ? ' has-attention' : ''}">
    <span class="avatar">${esc(initials)}</span>
    <div class="account-main"><div class="account-title"><strong>${esc(email)}</strong>${statusHtml}</div><div class="calendar-chips">${calendars.map(({ color, label }) => `<span><i style="--calendar:${esc(color)}" aria-hidden="true"></i>${esc(label)}</span>`).join('')}</div></div>
    <button class="${attention ? 'attention-action' : 'tertiary'}" ${attention ? 'data-primary' : ''} type="button">${esc(action)}</button>
  </article>`
}

function twoAccounts() {
  const first = accountSummaryRow({ initials: 'JC', email: 'jonathan.r.cooler@gmail.com', statusHtml: status('good', 'Up to date'), calendars: [{ color: '#4285f4', label: 'Jon Cooler' }, { color: '#0b8043', label: 'Family' }, { color: '#d50000', label: 'Deadlines' }] })
  const second = accountSummaryRow({ initials: 'JW', email: 'jon.cooler@workmail.com', statusHtml: status('good', 'Up to date'), calendars: [{ color: '#7986cb', label: 'Work' }, { color: '#f4511e', label: 'Team releases' }] })
  return desktopShell(`${providerHeader('Google Calendar', 'Your connected accounts', 'Five selected calendars feed one calm schedule.', status('good', 'Active'))}
    <section class="accounts-section"><div class="section-heading"><div><span class="section-label">GOOGLE ACCOUNTS</span><h2>Two accounts, one Calendar.</h2></div><button class="primary primary--quiet" data-primary type="button"><span aria-hidden="true">＋</span> Add another account</button></div>
      <div class="account-list">${first}${second}</div>
    </section>
    <div class="connection-summary"><div><span>Next automatic update</span><strong>In 8 minutes</strong></div><div><span>Calendar load Metrics</span><strong>On · numeric totals only</strong></div><div><span>Google access</span><strong>Read-only</strong></div></div>
    <footer class="quiet-foot"><span>Free ICS calendars remain connected separately.</span><button type="button">Manage ICS Calendar</button></footer>`)
}

function accountAttention() {
  const first = accountSummaryRow({ initials: 'JC', email: 'jonathan.r.cooler@gmail.com', statusHtml: status('good', 'Up to date'), calendars: [{ color: '#4285f4', label: 'Jon Cooler' }, { color: '#0b8043', label: 'Family' }, { color: '#d50000', label: 'Deadlines' }] })
  const second = accountSummaryRow({ initials: 'JW', email: 'jon.cooler@workmail.com', statusHtml: status('warn', 'Reconnect needed'), calendars: [{ color: '#7986cb', label: 'Work · last updated 2h ago' }, { color: '#f4511e', label: 'Team releases' }], action: 'Reconnect', attention: true })
  return desktopShell(`${providerHeader('Google Calendar', 'One account needs attention', 'Your other calendar sources are still current.', status('warn', 'Partial update'))}
    <section class="accounts-section"><div class="section-heading"><div><span class="section-label">CONNECTION HEALTH</span><h2>Keep the schedule you still have.</h2><p>Work calendar access expired. Existing events stay visible while you reconnect.</p></div><button class="secondary" type="button">Try all again</button></div>
      <div class="account-list">${first}${second}</div>
    </section>
    <aside class="notice notice--warning" role="alert"><span aria-hidden="true">!</span><div><strong>Only jon.cooler@workmail.com is paused.</strong><p>Personal Google calendars and free ICS calendars continue on their normal refresh schedules.</p></div></aside>`)
}

function disconnectDialog() {
  return desktopShell(`${providerHeader('Google Calendar', 'Your connected accounts', 'Five selected calendars feed one calm schedule.', status('good', 'Active'))}
    <section class="accounts-section blurred" aria-hidden="true"><div class="section-heading"><div><span class="section-label">GOOGLE ACCOUNTS</span><h2>Two accounts, one Calendar.</h2></div></div>${accountSummaryRow({ initials: 'JC', email: 'jonathan.r.cooler@gmail.com', statusHtml: status('good', 'Up to date'), calendars: [{ color: '#4285f4', label: 'Jon Cooler' }, { color: '#0b8043', label: 'Family' }] })}${accountSummaryRow({ initials: 'JW', email: 'jon.cooler@workmail.com', statusHtml: status('good', 'Up to date'), calendars: [{ color: '#7986cb', label: 'Work' }] })}</section>
    <div class="modal-backdrop"><section class="dialog" role="dialog" aria-modal="true" aria-labelledby="disconnect-title">
      <span class="danger-mark" aria-hidden="true">−</span><span class="section-label">DISCONNECT GOOGLE ACCOUNT</span><h2 id="disconnect-title">Remove jon.cooler@workmail.com?</h2>
      <p>This removes access for this Google account from Tab Two. It does not change or delete anything in Google Calendar, and it does not affect your other accounts or ICS calendars.</p>
      <div class="disconnect-details"><div><span>Calendars removed from this device</span><strong>Work, Team releases</strong></div><div><span>Events in Google</span><strong>Stay exactly as they are</strong></div></div>
      <label class="history-choice"><input type="checkbox"><span class="checkbox" aria-hidden="true"></span><span><strong>Also delete this account’s Metrics history</strong><small>Removes only numeric calendar totals collected from this connection.</small></span></label>
      <div class="dialog-actions"><button class="secondary" type="button">Cancel</button><button class="danger" data-primary type="button">Disconnect account</button></div>
    </section></div>`)
}

function monthGrid() {
  const days = ['', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', '21', '22', '23', '24', '25', '26', '27', '28', '29', '30', '']
  return `<div class="month"><div class="weekdays">${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => `<span>${d}</span>`).join('')}</div><div class="days">${days.map((day) => `<span${day === '3' ? ' class="today"' : ''}>${day}${['2', '3', '5', '8', '11', '15', '18', '22', '24', '29'].includes(day) ? `<i class="markers"><b style="--calendar:${day === '3' ? '#4285f4' : day === '8' ? '#0b8043' : day === '18' ? '#f4511e' : '#7dd3fc'}"></b>${['3', '15', '24'].includes(day) ? '<b style="--calendar:#a855f7"></b>' : ''}</i>` : ''}</span>`).join('')}</div></div>`
}

function agendaRow(time, title, source, color, meta = '') {
  return `<li><i style="--calendar:${esc(color)}" aria-hidden="true"></i><time>${esc(time)}</time><span><strong>${esc(title)}</strong><small>${esc(source)}${meta ? ` · ${esc(meta)}` : ''}</small></span></li>`
}

function composedCalendar() {
  return `<main class="canvas" aria-label="Tab Two Calendar preview"><header class="canvas-date"><span>Thursday</span><strong>September 3</strong></header><section class="calendar-widget" aria-label="Calendar"><div class="widget-head"><div><span class="section-label">CALENDAR</span><h1>September 2026</h1></div><button type="button">Today</button></div><div class="calendar-composition">${monthGrid()}<section class="agenda" aria-label="Agenda"><div class="agenda-head"><div><span class="section-label">UP NEXT</span><h2>Design review</h2><p>in 24 minutes · Google Meet</p></div><button type="button" data-primary>Join</button></div><ol>${agendaRow('10:30', 'Design review', 'Work', '#7986cb', 'Google')}${agendaRow('12:00', 'Lunch with Mia', 'Family', '#0b8043', 'Google')}${agendaRow('15:30', 'Dentist appointment', 'Personal feed', '#a855f7', 'ICS')}${agendaRow('All day', 'Release window', 'Team releases', '#f4511e', 'Google')}</ol></section></div><footer class="source-legend"><span><i style="--calendar:#7986cb"></i>Work · Google</span><span><i style="--calendar:#0b8043"></i>Family · Google</span><span><i style="--calendar:#a855f7"></i>Personal feed · ICS</span></footer></section></main>`
}

function touchCalendarSelection() {
  const rows = [
    { color: '#4285f4', name: 'Jon Cooler', detail: 'Primary calendar', checked: true },
    { color: '#0b8043', name: 'Family', detail: 'Shared calendar', checked: true },
    { color: '#d50000', name: 'Deadlines', detail: '12 upcoming events', checked: true },
    { color: '#8e24aa', name: 'Birthdays', detail: 'All-day events', checked: false },
  ]
  return mobileShell(`<div class="mobile-provider">${providerMark()}<div><span class="eyebrow">GOOGLE CALENDAR</span><h1>Choose calendars</h1><p>jonathan.r.cooler@gmail.com</p></div>${status('good', 'Connected')}</div><section class="mobile-copy"><h2>Start with what matters.</h2><p>Your primary calendar is selected. Colors stay matched to Google.</p></section><div class="picker-bar"><div><strong>Calendars</strong><span>3 selected</span></div><button type="button">Select visible</button></div><div class="calendar-list mobile-list">${rows.map(calendarRow).join('')}</div><aside class="mobile-privacy"><span class="shield" aria-hidden="true">◇</span><p>Event details stay in this browser and never enter Tab Two backup, encrypted sync, diagnostics, or logs.</p></aside><footer class="mobile-actions"><button class="secondary" type="button">Back</button><button class="primary" data-primary type="button">Add 3 calendars</button></footer>`)
}

function style(viewport) {
  return `<style>
    @font-face { font-family: Inter; src: url('${INTER}') format('woff2'); font-weight: 100 900; }
    @font-face { font-family: 'Space Grotesk'; src: url('${DISPLAY}') format('woff2'); font-weight: 300 700; }
    :root { color-scheme: dark; --bg:#151716; --surface:#1a1d1c; --surface-2:#1e2221; --line:rgb(245 245 244/.11); --line-strong:rgb(125 211 252/.32); --fg:#f3f4f2; --muted:rgb(243 244 242/.67); --faint:rgb(243 244 242/.45); --accent:#7dd3fc; --accent-strong:#38bdf8; --accent-soft:rgb(125 211 252/.10); --good:#6ee7b7; --warning:#fbbf77; --danger:#ff6b77; }
    * { box-sizing:border-box; }
    html,body { width:100%; height:100%; margin:0; overflow:hidden; background:#111312; color:var(--fg); font-family:Inter,system-ui,sans-serif; }
    button,input { font:inherit; }
    button { color:inherit; cursor:pointer; }
    button:focus-visible,input:focus-visible + .checkbox { outline:2px solid var(--accent); outline-offset:3px; }
    h1,h2,strong,b { font-family:'Space Grotesk',Inter,sans-serif; }
    p,h1,h2 { margin:0; }
    .capture { width:${viewport.width}px; height:${viewport.height}px; overflow:hidden; }
    .settings-shell { display:grid; width:100%; height:100%; grid-template-columns:260px 1fr; background:radial-gradient(circle at 76% 18%,rgb(125 211 252/.035),transparent 28%),var(--bg); }
    .sidebar { display:flex; flex-direction:column; border-right:1px solid var(--line); background:#171918; padding:28px 20px 24px; }
    .brand { display:flex; align-items:center; gap:12px; }
    .brand img { width:34px; height:34px; }
    .brand div { display:flex; flex-direction:column; gap:2px; }
    .brand strong { font-size:17px; font-weight:650; letter-spacing:-.025em; }
    .brand span { color:var(--muted); font-size:12px; }
    nav { display:flex; flex-direction:column; gap:3px; margin-top:38px; }
    .nav-item { min-height:44px; border:0; border-left:2px solid transparent; border-radius:0 8px 8px 0; background:transparent; padding:0 14px; color:var(--muted); font-size:14px; text-align:left; }
    .nav-item.is-selected { border-left-color:var(--accent); background:linear-gradient(90deg,rgb(125 211 252/.10),transparent 88%); color:var(--fg); }
    .sidebar-foot { display:flex; justify-content:space-between; margin-top:auto; color:var(--faint); font-size:11px; text-transform:uppercase; letter-spacing:.08em; }
    .sidebar-foot b { font-family:Inter,sans-serif; font-weight:600; }
    .settings-main { position:relative; min-width:0; overflow:hidden; }
    .content { width:min(1000px,calc(100% - 96px)); height:100%; margin:0 auto; padding:66px 0 38px; }
    .close { position:absolute; top:20px; right:26px; width:44px; height:44px; border:0; background:transparent; color:var(--muted); font-size:25px; font-weight:300; }
    .provider-head { display:flex; min-height:88px; align-items:center; gap:18px; border-bottom:1px solid var(--line); padding-bottom:25px; }
    .provider-mark { position:relative; display:grid; width:52px; height:52px; flex:none; place-items:center; overflow:hidden; border:1px solid rgb(125 211 252/.34); border-radius:15px; background:linear-gradient(145deg,rgb(56 189 248/.22),rgb(14 116 144/.08)); box-shadow:inset 0 1px rgb(255 255 255/.08); }
    .provider-mark::before { position:absolute; inset:0 0 auto; height:9px; background:var(--accent); content:''; }
    .provider-mark i { position:absolute; top:6px; right:8px; width:4px; height:7px; border-radius:2px; background:#111312; box-shadow:-14px 0 #111312; }
    .provider-mark b { padding-top:6px; font-size:18px; font-weight:650; }
    .provider-title { min-width:0; }
    .eyebrow,.section-label { color:var(--accent); font-size:11px; font-weight:730; letter-spacing:.105em; text-transform:uppercase; }
    .provider-title h1 { display:flex; align-items:center; gap:10px; margin:5px 0 4px; font-size:29px; font-weight:560; letter-spacing:-.04em; }
    .provider-title p { color:var(--muted); font-size:14px; }
    .premium-tag,.readonly-tag { display:inline-flex; min-height:24px; align-items:center; border:1px solid var(--line-strong); border-radius:999px; background:var(--accent-soft); padding:0 9px; color:var(--accent); font-family:Inter,sans-serif; font-size:10px; font-weight:750; letter-spacing:.075em; text-transform:uppercase; }
    .readonly-tag { border-color:rgb(110 231 183/.28); background:rgb(110 231 183/.08); color:var(--good); }
    .hero { display:grid; min-height:526px; grid-template-columns:1.05fr .95fr; align-items:center; gap:84px; }
    .hero-copy h2,.consent-intro h2,.picker-copy h2,.section-heading h2 { margin-top:12px; font-size:43px; font-weight:500; letter-spacing:-.055em; line-height:1.04; }
    .hero-copy p { max-width:490px; margin-top:18px; color:var(--muted); font-size:16px; line-height:1.6; }
    .primary,.secondary,.danger,.tertiary,.attention-action { min-height:42px; border-radius:10px; padding:0 17px; font-size:13px; font-weight:660; }
    .primary { border:1px solid rgb(125 211 252/.65); background:var(--accent); color:#08202a; box-shadow:0 8px 28px rgb(56 189 248/.12); }
    .primary:hover { background:#a5e2fb; }
    .primary span { margin-left:5px; }
    .primary--quiet { background:rgb(125 211 252/.13); color:var(--accent); box-shadow:none; }
    .secondary,.tertiary { border:1px solid var(--line); background:transparent; color:var(--muted); }
    .tertiary { min-width:92px; }
    .danger { border:1px solid rgb(255 107 119/.45); background:rgb(255 107 119/.12); color:var(--danger); }
    .attention-action { border:1px solid rgb(251 191 119/.38); background:rgb(251 191 119/.09); color:var(--warning); }
    .hero-copy .primary { min-height:46px; margin-top:30px; padding:0 20px; }
    .benefit-list { display:flex; flex-direction:column; border-top:1px solid var(--line); }
    .benefit-list > div { display:flex; min-height:92px; align-items:center; gap:15px; border-bottom:1px solid var(--line); }
    .check { display:inline-grid; width:22px; height:22px; flex:none; place-items:center; border-radius:50%; background:var(--accent-soft); color:var(--accent); font-size:12px; font-weight:800; }
    .benefit-list > div > span { display:flex; flex-direction:column; gap:5px; }
    .benefit-list strong { font-size:15px; font-weight:600; }
    .benefit-list small { color:var(--muted); font-size:12px; }
    .quiet-foot { display:flex; min-height:58px; align-items:center; justify-content:space-between; border-top:1px solid var(--line); color:var(--muted); font-size:12px; }
    .quiet-foot button { min-height:40px; border:0; background:transparent; color:var(--accent); font-size:12px; }
    .consent-layout { display:grid; min-height:470px; grid-template-columns:1fr 1fr; align-items:center; gap:70px; }
    .consent-intro h2 { max-width:470px; font-size:38px; }
    .consent-intro > p { max-width:510px; margin-top:18px; color:var(--muted); font-size:14px; line-height:1.65; }
    .consent-actions,.opening-actions { display:flex; gap:10px; margin-top:26px; }
    .consent-intro .permission-note { margin-top:16px; border-left:2px solid var(--line-strong); padding-left:12px; color:var(--faint); font-size:11px; line-height:1.5; }
    .access-columns { display:grid; grid-template-columns:1fr 1fr; border-top:1px solid var(--line); border-bottom:1px solid var(--line); }
    .access-columns section { min-height:258px; padding:25px 20px 20px 0; }
    .access-columns section + section { border-left:1px solid var(--line); padding-left:25px; }
    .access-columns ul { display:flex; flex-direction:column; gap:24px; margin:25px 0 0; padding:0; list-style:none; }
    .access-columns li { display:flex; align-items:center; gap:10px; color:var(--muted); font-size:13px; }
    .read-only-assurance { display:flex; align-items:flex-start; gap:14px; background:linear-gradient(135deg,rgb(110 231 183/.045),transparent 72%); }
    .read-only-assurance .shield { margin-top:-2px; color:var(--good); }
    .read-only-assurance > div { display:flex; flex-direction:column; }
    .read-only-assurance .section-label { color:var(--good); }
    .read-only-assurance strong { margin-top:22px; font-size:16px; font-weight:620; }
    .read-only-assurance p { margin-top:8px; color:var(--muted); font-size:12px; line-height:1.55; }
    .privacy-strip,.notice { display:flex; min-height:102px; align-items:flex-start; gap:15px; border-top:1px solid var(--line-strong); background:linear-gradient(90deg,var(--accent-soft),transparent 70%); padding:18px 20px; }
    .privacy-strip strong,.notice strong { font-size:13px; font-weight:650; }
    .privacy-strip p,.notice p { max-width:880px; margin-top:6px; color:var(--muted); font-size:12px; line-height:1.55; }
    .shield { display:grid; width:25px; height:25px; flex:none; place-items:center; color:var(--accent); font-size:22px; }
    .opening-state { display:flex; min-height:505px; flex-direction:column; align-items:center; justify-content:center; text-align:center; }
    .orbit { position:relative; display:grid; width:110px; height:110px; place-items:center; border:1px solid var(--line); border-radius:50%; }
    .orbit > span { position:absolute; inset:7px; border:2px solid transparent; border-top-color:var(--accent); border-radius:50%; animation:spin 1.1s linear infinite; }
    .orbit .provider-mark { width:58px; height:58px; }
    .opening-state h2 { margin-top:24px; font-size:30px; font-weight:560; letter-spacing:-.04em; }
    .opening-state p { max-width:480px; margin-top:10px; color:var(--muted); font-size:14px; line-height:1.55; }
    .opening-state small { margin-top:22px; color:var(--faint); font-size:11px; }
    .pending { display:inline-flex; min-width:172px; align-items:center; justify-content:center; opacity:.86; cursor:wait; }
    .spinner { width:15px; height:15px; margin:0 9px 0 0!important; border:2px solid rgb(8 32 42/.28); border-top-color:#08202a; border-radius:50%; animation:spin .8s linear infinite; }
    .trust-line { display:flex; min-height:58px; align-items:center; justify-content:center; gap:8px; border-top:1px solid var(--line); color:var(--muted); font-size:12px; }
    .trust-line span { color:var(--good); }
    .status { display:inline-flex; align-items:center; gap:7px; color:var(--muted); font-family:Inter,sans-serif; font-size:11px; font-weight:600; white-space:nowrap; }
    .provider-head > .status { margin-left:auto; }
    .status i { width:6px; height:6px; border-radius:50%; background:var(--good); box-shadow:0 0 0 4px rgb(110 231 183/.07); }
    .status--warn { color:var(--warning); }
    .status--warn i { background:var(--warning); box-shadow:0 0 0 4px rgb(251 191 119/.07); }
    .picker-layout { display:grid; min-height:492px; grid-template-columns:340px 1fr; gap:68px; padding:42px 0 30px; }
    .picker-copy h2 { font-size:34px; }
    .picker-copy > p { margin-top:15px; color:var(--muted); font-size:13px; line-height:1.6; }
    .account-note { display:flex; align-items:center; gap:11px; margin-top:30px; padding-top:22px; border-top:1px solid var(--line); }
    .avatar { display:grid; width:40px; height:40px; flex:none; place-items:center; border:1px solid rgb(125 211 252/.22); border-radius:12px; background:var(--accent-soft); color:var(--accent); font-size:12px; font-weight:750; }
    .account-note div { display:flex; flex-direction:column; gap:3px; }
    .account-note strong { font-size:13px; font-weight:620; }
    .account-note small { color:var(--muted); font-size:11px; }
    .picker-panel { min-width:0; }
    .picker-bar { display:flex; min-height:46px; align-items:center; justify-content:space-between; border-bottom:1px solid var(--line); }
    .picker-bar > div { display:flex; align-items:baseline; gap:10px; }
    .picker-bar strong { font-size:14px; font-weight:620; }
    .picker-bar span { color:var(--muted); font-size:11px; }
    .picker-bar button { min-height:40px; border:0; background:transparent; color:var(--accent); font-size:11px; font-weight:650; }
    .calendar-list { display:flex; flex-direction:column; }
    .calendar-row { display:grid; min-height:68px; grid-template-columns:22px 12px 1fr; align-items:center; gap:12px; border-bottom:1px solid var(--line); cursor:pointer; }
    .calendar-row input { position:absolute; width:1px; height:1px; opacity:0; }
    .checkbox { display:grid; width:20px; height:20px; place-items:center; border:1px solid rgb(243 244 242/.26); border-radius:6px; background:rgb(243 244 242/.025); }
    input:checked + .checkbox { border-color:var(--accent); background:var(--accent); }
    input:checked + .checkbox::after { color:#09202a; content:'✓'; font-size:12px; font-weight:850; }
    .calendar-dot,.calendar-chips i,.source-legend i,.agenda li > i { width:9px; height:9px; border-radius:50%; background:var(--calendar); box-shadow:0 0 0 3px color-mix(in srgb,var(--calendar) 15%,transparent); }
    .calendar-copy { display:flex; min-width:0; flex-direction:column; gap:4px; }
    .calendar-copy strong { overflow:hidden; font-size:13px; font-weight:580; text-overflow:ellipsis; white-space:nowrap; }
    .calendar-copy small { color:var(--muted); font-size:11px; }
    .calendar-row.is-disabled { cursor:not-allowed; opacity:.45; }
    .action-bar { display:flex; min-height:74px; align-items:center; justify-content:space-between; border-top:1px solid var(--line); }
    .action-bar p { display:flex; flex-direction:column; gap:3px; }
    .action-bar p strong { font-size:13px; font-weight:620; }
    .action-bar p span { color:var(--muted); font-size:11px; }
    .action-bar > div { display:flex; gap:10px; }
    .accounts-section { padding-top:38px; }
    .section-heading { display:flex; min-height:100px; align-items:flex-start; justify-content:space-between; gap:32px; }
    .section-heading h2 { margin-top:9px; font-size:31px; }
    .section-heading p { margin-top:8px; color:var(--muted); font-size:12px; }
    .account-list { border-top:1px solid var(--line); }
    .account-row { display:grid; min-height:112px; grid-template-columns:40px 1fr auto; align-items:center; gap:17px; border-bottom:1px solid var(--line); padding:14px 0; }
    .account-row.has-attention { border-bottom-color:rgb(251 191 119/.20); background:linear-gradient(90deg,rgb(251 191 119/.045),transparent 72%); }
    .account-main { min-width:0; }
    .account-title { display:flex; align-items:center; gap:14px; }
    .account-title > strong { overflow:hidden; font-size:14px; font-weight:600; text-overflow:ellipsis; white-space:nowrap; }
    .calendar-chips { display:flex; min-width:0; flex-wrap:wrap; gap:7px 18px; margin-top:13px; }
    .calendar-chips span { display:inline-flex; align-items:center; gap:7px; color:var(--muted); font-size:11px; white-space:nowrap; }
    .calendar-chips i { width:7px; height:7px; box-shadow:none; }
    .connection-summary { display:grid; min-height:103px; grid-template-columns:repeat(3,1fr); align-items:center; border-bottom:1px solid var(--line); }
    .connection-summary > div { display:flex; min-width:0; flex-direction:column; gap:7px; padding-right:24px; }
    .connection-summary > div + div { border-left:1px solid var(--line); padding-left:28px; }
    .connection-summary span { color:var(--muted); font-size:11px; }
    .connection-summary strong { font-size:13px; font-weight:570; }
    .notice { min-height:90px; margin-top:32px; border-top-color:rgb(251 191 119/.28); background:linear-gradient(90deg,rgb(251 191 119/.08),transparent 70%); }
    .notice > span { display:grid; width:24px; height:24px; place-items:center; border:1px solid rgb(251 191 119/.35); border-radius:50%; color:var(--warning); font-size:12px; font-weight:800; }
    .blurred { filter:blur(2px); opacity:.34; }
    .modal-backdrop { position:absolute; inset:0; z-index:4; display:grid; place-items:center; background:rgb(5 7 6/.68); backdrop-filter:blur(4px); }
    .dialog { width:560px; border:1px solid rgb(255 255 255/.15); border-radius:18px; background:#1b1e1d; box-shadow:0 34px 90px rgb(0 0 0/.55); padding:30px; }
    .danger-mark { display:grid; width:38px; height:38px; margin-bottom:22px; place-items:center; border:1px solid rgb(255 107 119/.32); border-radius:11px; background:rgb(255 107 119/.08); color:var(--danger); font-size:22px; }
    .dialog .section-label { color:var(--danger); }
    .dialog h2 { margin-top:9px; font-size:28px; font-weight:560; letter-spacing:-.04em; }
    .dialog > p { margin-top:14px; color:var(--muted); font-size:13px; line-height:1.6; }
    .disconnect-details { margin-top:22px; border-top:1px solid var(--line); }
    .disconnect-details > div { display:flex; min-height:52px; align-items:center; justify-content:space-between; gap:20px; border-bottom:1px solid var(--line); }
    .disconnect-details span { color:var(--muted); font-size:11px; }
    .disconnect-details strong { font-size:11px; font-weight:600; text-align:right; }
    .history-choice { display:grid; min-height:70px; grid-template-columns:20px 1fr; align-items:center; gap:12px; margin-top:14px; cursor:pointer; }
    .history-choice input { position:absolute; width:1px; height:1px; opacity:0; }
    .history-choice > span:last-child { display:flex; flex-direction:column; gap:4px; }
    .history-choice strong { font-size:12px; font-weight:610; }
    .history-choice small { color:var(--muted); font-size:11px; line-height:1.4; }
    .dialog-actions { display:flex; justify-content:flex-end; gap:10px; margin-top:20px; }
    .canvas { position:relative; width:100%; height:100%; overflow:hidden; background-image:linear-gradient(rgb(2 6 10/.32),rgb(2 6 10/.48)),url('${BACKGROUND}'); background-position:center 42%; background-size:cover; }
    .canvas-date { position:absolute; top:42px; left:50px; display:flex; flex-direction:column; color:#fff; text-shadow:0 2px 14px rgb(0 0 0/.5); }
    .canvas-date span { font-size:13px; letter-spacing:.08em; text-transform:uppercase; }
    .canvas-date strong { margin-top:5px; font-size:25px; font-weight:550; }
    .calendar-widget { position:absolute; top:50%; left:50%; width:780px; height:430px; overflow:hidden; transform:translate(-50%,-48%); border:1px solid rgb(255 255 255/.14); border-radius:18px; background:rgb(18 21 20/.94); box-shadow:0 28px 80px rgb(0 0 0/.45); backdrop-filter:blur(18px); padding:18px 20px 14px; }
    .widget-head { display:flex; height:55px; align-items:flex-start; justify-content:space-between; border-bottom:1px solid var(--line); }
    .widget-head h1 { margin-top:4px; font-size:22px; font-weight:560; letter-spacing:-.04em; }
    .widget-head button,.agenda-head button { min-height:38px; border:1px solid var(--line); border-radius:9px; background:transparent; padding:0 13px; color:var(--muted); font-size:11px; }
    .calendar-composition { display:grid; height:294px; grid-template-columns:1fr 1fr; gap:22px; padding-top:14px; }
    .month { min-width:0; padding-right:22px; border-right:1px solid var(--line); }
    .weekdays,.days { display:grid; grid-template-columns:repeat(7,1fr); }
    .weekdays span { height:28px; color:var(--faint); font-size:10px; font-weight:650; text-align:center; text-transform:uppercase; }
    .days span { position:relative; display:grid; height:48px; place-items:center; border-radius:9px; color:var(--muted); font-size:11px; }
    .days span.today { background:var(--accent-soft); box-shadow:inset 0 0 0 1px var(--line-strong); color:var(--fg); font-weight:700; }
    .markers { position:absolute; bottom:5px; display:flex; gap:2px; }
    .markers b { width:4px; height:4px; border-radius:50%; background:var(--calendar); }
    .agenda { min-width:0; }
    .agenda-head { display:flex; min-height:74px; align-items:center; justify-content:space-between; border-bottom:1px solid var(--line); }
    .agenda-head h2 { margin-top:4px; font-size:18px; font-weight:560; }
    .agenda-head p { margin-top:3px; color:var(--muted); font-size:10px; }
    .agenda-head button { border-color:var(--line-strong); color:var(--accent); }
    .agenda ol { margin:0; padding:0; list-style:none; }
    .agenda li { display:grid; min-height:50px; grid-template-columns:9px 48px 1fr; align-items:center; gap:9px; border-bottom:1px solid var(--line); }
    .agenda li > i { width:7px; height:7px; box-shadow:none; }
    .agenda time { color:var(--muted); font-size:10px; }
    .agenda li > span { display:flex; min-width:0; flex-direction:column; gap:2px; }
    .agenda li strong { overflow:hidden; font-size:11px; font-weight:580; text-overflow:ellipsis; white-space:nowrap; }
    .agenda li small { color:var(--faint); font-size:10px; }
    .source-legend { display:flex; min-height:49px; align-items:flex-end; gap:22px; border-top:1px solid var(--line); padding-top:10px; }
    .source-legend span { display:inline-flex; align-items:center; gap:6px; color:var(--muted); font-size:10px; }
    .source-legend i { width:6px; height:6px; box-shadow:none; }
    .mobile-shell { width:100%; height:100%; overflow:hidden; background:var(--bg); }
    .mobile-head { display:flex; height:70px; align-items:center; justify-content:space-between; border-bottom:1px solid var(--line); padding:0 12px; }
    .mobile-head > button { width:44px; height:44px; border:0; background:transparent; color:var(--muted); font-size:22px; }
    .mobile-head .brand { gap:9px; }
    .mobile-head .brand img { width:28px; height:28px; }
    .mobile-head .brand strong { font-size:14px; }
    .mobile-head .brand span { font-size:10px; }
    .mobile-main { height:calc(100% - 70px); overflow:hidden; padding:20px 16px 0; }
    .mobile-provider { display:grid; grid-template-columns:44px minmax(0,1fr) auto; align-items:center; gap:11px; border-bottom:1px solid var(--line); padding-bottom:18px; }
    .mobile-provider .provider-mark { width:44px; height:44px; border-radius:13px; }
    .mobile-provider .provider-mark b { font-size:15px; }
    .mobile-provider .provider-mark::before { height:7px; }
    .mobile-provider .provider-mark i { top:4px; right:7px; box-shadow:-12px 0 #111312; }
    .mobile-provider h1 { margin-top:3px; font-size:20px; font-weight:570; letter-spacing:-.035em; }
    .mobile-provider p { margin-top:2px; overflow:hidden; color:var(--muted); font-size:10px; text-overflow:ellipsis; white-space:nowrap; }
    .mobile-provider .eyebrow { font-size:10px; }
    .mobile-provider .status { font-size:10px; }
    .mobile-copy { padding:18px 0 12px; }
    .mobile-copy h2 { font-size:20px; font-weight:560; letter-spacing:-.035em; }
    .mobile-copy p { margin-top:5px; color:var(--muted); font-size:11px; line-height:1.45; }
    .mobile-list .calendar-row { min-height:64px; }
    .mobile-list .calendar-copy strong { font-size:12px; }
    .mobile-list .calendar-copy small { font-size:10px; }
    .mobile-main .picker-bar button { min-height:44px; }
    .mobile-privacy { display:flex; min-height:72px; align-items:flex-start; gap:8px; border-top:1px solid var(--line-strong); padding-top:12px; color:var(--muted); }
    .mobile-privacy .shield { width:20px; height:20px; font-size:17px; }
    .mobile-privacy p { font-size:10px; line-height:1.45; }
    .mobile-actions { position:absolute; right:0; bottom:0; left:0; display:grid; height:76px; grid-template-columns:1fr 1.7fr; align-items:center; gap:9px; border-top:1px solid var(--line); background:rgb(21 23 22/.98); padding:0 16px; }
    .mobile-actions button { min-height:46px; }
    @keyframes spin { to { transform:rotate(360deg); } }
    @media (prefers-reduced-motion:reduce) { *,*::before,*::after { animation:none!important; scroll-behavior:auto!important; transition:none!important; } }
  </style>`
}

function documentFor(scenario) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${style(scenario.viewport)}</head><body><div id="capture" class="capture" data-scenario="${scenario.id}">${scenario.body()}</div></body></html>`
}

function safeRelative(path) {
  const value = relative(REPO_ROOT, path).replaceAll('\\', '/')
  assert(!value.startsWith('..'), `Google Calendar mockup output escaped repository: ${path}`)
  return value
}

async function inspect(page, scenario) {
  return page.locator('#capture').evaluate((capture, expected) => {
    const rect = capture.getBoundingClientRect()
    const visibleLeaves = [...capture.querySelectorAll('*')].filter((node) => {
      const box = node.getBoundingClientRect()
      const css = getComputedStyle(node)
      return node.children.length === 0 && node.textContent.trim() && css.display !== 'none' && box.width > 0 && box.height > 0
    })
    const controls = [...capture.querySelectorAll('button,label.calendar-row,label.history-choice')].map((node) => {
      const box = node.getBoundingClientRect()
      return { text: node.textContent.trim(), width: box.width, height: box.height }
    })
    return {
      frame: { width: rect.width, height: rect.height },
      rootOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1 || document.documentElement.scrollHeight > document.documentElement.clientHeight + 1,
      captureOverflow: capture.scrollWidth > capture.clientWidth + 1 || capture.scrollHeight > capture.clientHeight + 1,
      textFloor: Math.min(...visibleLeaves.map((node) => Number.parseFloat(getComputedStyle(node).fontSize))),
      mainCount: capture.querySelectorAll('main').length,
      primaryCount: capture.querySelectorAll('[data-primary]').length,
      controls,
      expected,
    }
  }, scenario.viewport)
}

async function run() {
  mkdirSync(OUTPUT_DIR, { recursive: true })
  const browser = await chromium.launch({ headless: true })
  const evidence = { version: 1, sourceSha: SOURCE_SHA, generatedAt: new Date().toISOString(), result: 'PASS', captures: [] }
  try {
    for (const scenario of SCENARIOS) {
      const context = await browser.newContext({
        viewport: scenario.viewport,
        screen: scenario.viewport,
        deviceScaleFactor: 1,
        hasTouch: Boolean(scenario.touch),
        reducedMotion: 'reduce',
      })
      const page = await context.newPage()
      const runtime = { consoleErrors: [], pageErrors: [], networkRequests: [] }
      page.on('console', (message) => { if (message.type() === 'error') runtime.consoleErrors.push(message.text()) })
      page.on('pageerror', (error) => runtime.pageErrors.push(error.message))
      page.on('request', (request) => { if (!request.url().startsWith('data:')) runtime.networkRequests.push(request.url()) })
      await page.setContent(documentFor(scenario), { waitUntil: 'domcontentloaded' })
      await page.evaluate(() => document.fonts.ready)
      const measurements = await inspect(page, scenario)
      assert.deepEqual(measurements.frame, scenario.viewport, `${scenario.id} frame`)
      assert.equal(measurements.rootOverflow, false, `${scenario.id} root overflow`)
      assert.equal(measurements.captureOverflow, false, `${scenario.id} capture overflow`)
      assert.equal(measurements.mainCount, 1, `${scenario.id} landmark count`)
      assert.equal(measurements.primaryCount, 1, `${scenario.id} primary action hierarchy`)
      assert.equal(measurements.textFloor >= 10, true, `${scenario.id} text floor ${measurements.textFloor}px`)
      assert.deepEqual(runtime, { consoleErrors: [], pageErrors: [], networkRequests: [] }, `${scenario.id} runtime ledger`)
      if (scenario.touch) {
        for (const control of measurements.controls) {
          assert.equal(control.height >= 44, true, `${scenario.id} touch control ${control.text} is ${control.height}px tall`)
        }
      }
      const path = resolve(OUTPUT_DIR, `${scenario.id}.png`)
      await page.locator('#capture').screenshot({ path })
      evidence.captures.push({ id: scenario.id, path: safeRelative(path), viewport: scenario.viewport, measurements, runtime })
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
  process.stdout.write(`PASS: ${evidence.captures.length} original-resolution Google Calendar mockups\n${OUTPUT_DIR}\n`)
}

await run()
