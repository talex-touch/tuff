function activateDeferredStyles() {
  document.querySelectorAll<HTMLLinkElement>('link[data-nexus-deferred-style]').forEach((link) => {
    link.media = 'all'
  })
}

function scheduleDeferredStyles() {
  const idleWindow = window as Window & {
    requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number
  }
  if (idleWindow.requestIdleCallback) {
    idleWindow.requestIdleCallback(activateDeferredStyles, { timeout: 1200 })
    return
  }
  window.setTimeout(activateDeferredStyles, 0)
}

export default defineNuxtPlugin((nuxtApp) => {
  let pageLoaded = document.readyState === 'complete'
  const onLoad = () => {
    pageLoaded = true
    scheduleDeferredStyles()
  }

  if (pageLoaded)
    scheduleDeferredStyles()
  else
    window.addEventListener('load', onLoad, { once: true })

  nuxtApp.hook('page:finish', () => {
    if (pageLoaded)
      scheduleDeferredStyles()
  })
})
