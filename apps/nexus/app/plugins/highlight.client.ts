import { nextTick } from 'vue'

interface HighlightApi {
  highlightElement: (element: HTMLElement) => void
}

let highlightPromise: Promise<HighlightApi | null> | null = null

function resolveHighlightApi() {
  if (highlightPromise)
    return highlightPromise

  highlightPromise = new Promise((resolve) => {
    const tryResolve = () => {
      const api = (window as Window & { hljs?: HighlightApi }).hljs
      if (api) {
        resolve(api)
        return true
      }
      return false
    }

    if (tryResolve())
      return

    let attempts = 0
    const timer = window.setInterval(() => {
      attempts += 1
      if (tryResolve() || attempts > 50) {
        window.clearInterval(timer)
        if (!tryResolve())
          resolve(null)
      }
    }, 100)
  })

  return highlightPromise
}

async function highlightAll() {
  if (!import.meta.client)
    return

  await nextTick()
  const api = await resolveHighlightApi()
  if (!api)
    return

  const nodes = Array.from(document.querySelectorAll<HTMLElement>('pre code, .tuff-code-block__code'))
  nodes.forEach((node) => {
    if (node.dataset.highlighted === 'true')
      return
    try {
      api.highlightElement(node)
      node.dataset.highlighted = 'true'
    }
    catch {
      // ignore highlight errors
    }
  })
}

export default defineNuxtPlugin((nuxtApp) => {
  if (!import.meta.client)
    return

  const scheduleRender = () => {
    void highlightAll()
  }

  nuxtApp.hook('app:mounted', scheduleRender)
  nuxtApp.hook('page:finish', scheduleRender)
})
