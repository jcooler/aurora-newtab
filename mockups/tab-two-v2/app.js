const app = document.querySelector('.app')
const settings = document.querySelector('.settings-shell')
const modal = document.querySelector('.modal-backdrop')
const connectorModal = document.querySelector('.connector-modal-backdrop')
const attentionTrigger = document.querySelector('.attention-trigger')
const attentionPopover = document.querySelector('.attention-popover')

function showSettings(section = 'connectors') {
  app.dataset.view = 'settings'
  settings.setAttribute('aria-hidden', 'false')
  showSection(section)
}

function closeSettings() {
  app.dataset.view = 'canvas'
  settings.setAttribute('aria-hidden', 'true')
}

function showSection(section) {
  document.querySelectorAll('[data-settings-content]').forEach((content) => {
    content.hidden = content.dataset.settingsContent !== section
  })
  document.querySelectorAll('[data-settings-section]').forEach((button) => {
    button.classList.toggle('active', button.dataset.settingsSection === section)
  })
}

document.querySelectorAll('[data-open-view="settings"]').forEach((button) => button.addEventListener('click', () => showSettings()))
document.querySelectorAll('[data-open-view="progress"]').forEach((button) => button.addEventListener('click', () => showSettings('progress')))
document.querySelectorAll('[data-close-view]').forEach((button) => button.addEventListener('click', closeSettings))
document.querySelectorAll('[data-settings-section]').forEach((button) => button.addEventListener('click', () => showSection(button.dataset.settingsSection)))

document.querySelectorAll('[data-prototype-view]').forEach((button) => {
  button.addEventListener('click', () => {
    const view = button.dataset.prototypeView
    document.querySelectorAll('[data-prototype-view]').forEach((peer) => peer.classList.toggle('active', peer === button))
    if (view === 'canvas') closeSettings()
    else showSettings(view)
  })
})

document.querySelectorAll('[data-premium]').forEach((button) => button.addEventListener('click', () => { modal.hidden = false }))
document.querySelectorAll('[data-connector]').forEach((button) => button.addEventListener('click', () => { connectorModal.hidden = false }))
document.querySelectorAll('.modal-close, .modal-dismiss').forEach((button) => button.addEventListener('click', () => { modal.hidden = true }))
document.querySelector('.connector-modal-close').addEventListener('click', () => { connectorModal.hidden = true })
modal.addEventListener('click', (event) => { if (event.target === modal) modal.hidden = true })
connectorModal.addEventListener('click', (event) => { if (event.target === connectorModal) connectorModal.hidden = true })

attentionTrigger.addEventListener('click', () => {
  const open = attentionPopover.hidden
  attentionPopover.hidden = !open
  attentionTrigger.setAttribute('aria-expanded', String(open))
})

document.querySelector('[data-attention-dismiss]').addEventListener('click', () => {
  attentionPopover.hidden = true
  attentionTrigger.setAttribute('aria-expanded', 'false')
})

document.querySelector('[data-attention-open]').addEventListener('click', (event) => {
  event.currentTarget.textContent = 'Deployment opened'
})

document.querySelectorAll('.filter-chips button').forEach((button) => button.addEventListener('click', () => {
  document.querySelectorAll('.filter-chips button').forEach((peer) => peer.classList.toggle('active', peer === button))
}))

document.querySelectorAll('.photo-grid button').forEach((button) => button.addEventListener('click', () => {
  document.querySelectorAll('.photo-grid button').forEach((peer) => peer.setAttribute('aria-pressed', String(peer === button)))
}))

document.querySelector('.photo-lock').addEventListener('click', (event) => {
  const button = event.currentTarget
  const pressed = button.getAttribute('aria-pressed') !== 'true'
  button.setAttribute('aria-pressed', String(pressed))
  button.querySelector('.lock-label').textContent = pressed ? 'Photo kept' : 'Keep photo'
})

document.querySelector('.play-button').addEventListener('click', (event) => {
  const button = event.currentTarget
  const playing = button.getAttribute('aria-pressed') !== 'true'
  button.setAttribute('aria-pressed', String(playing))
  button.textContent = playing ? 'Ⅱ' : '▶'
  button.setAttribute('aria-label', playing ? 'Pause Flow' : 'Start Flow')
})

document.querySelector('.focus-value button').addEventListener('click', (event) => {
  const button = event.currentTarget
  const complete = button.getAttribute('aria-pressed') !== 'true'
  button.setAttribute('aria-pressed', String(complete))
  button.textContent = complete ? '✓' : ''
})

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return
  if (!modal.hidden) modal.hidden = true
  else if (!connectorModal.hidden) connectorModal.hidden = true
  else if (!attentionPopover.hidden) {
    attentionPopover.hidden = true
    attentionTrigger.setAttribute('aria-expanded', 'false')
  } else if (app.dataset.view === 'settings') closeSettings()
})

const params = new URLSearchParams(location.search)
const requestedView = params.get('view')
if (requestedView && requestedView !== 'canvas') showSettings(requestedView)
