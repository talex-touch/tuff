export interface HighlightApi {
  highlightElement: (element: HTMLElement) => void
}

let highlightPromise: Promise<HighlightApi | null> | null = null

export function resolveHighlightApi() {
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
