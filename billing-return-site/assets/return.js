(() => {
  'use strict'

  const extensionId = 'akjalbmacojpmebkgohhcaaiacicpgkh'
  const button = document.querySelector('[data-return-action]')
  const fallback = document.querySelector('[data-return-fallback]')

  function showFallback() {
    fallback.hidden = false
    button.disabled = false
    button.textContent = 'Return to Tab Two'
  }

  function sendReturnMessage(message) {
    return new Promise((resolve) => {
      const runtime = globalThis.chrome?.runtime
      if (!runtime?.sendMessage) {
        resolve({ status: 'unavailable' })
        return
      }

      let settled = false
      const timeout = setTimeout(() => {
        if (settled) return
        settled = true
        resolve({ status: 'unavailable' })
      }, 3000)

      try {
        runtime.sendMessage(extensionId, message, (response) => {
          if (settled) return
          settled = true
          clearTimeout(timeout)
          resolve(runtime.lastError ? { status: 'unavailable' } : response)
        })
      } catch {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        resolve({ status: 'unavailable' })
      }
    })
  }

  button.addEventListener('click', async () => {
    button.disabled = true
    button.textContent = 'Returning to Tab Two…'
    fallback.hidden = true

    const message = Object.freeze({
      type: 'tab-two.billing-return.v1',
      result: document.body.dataset.result,
    })
    const response = await sendReturnMessage(message)
    if (response?.status === 'focused') {
      window.close()
      return
    }
    showFallback()
  })
})()
