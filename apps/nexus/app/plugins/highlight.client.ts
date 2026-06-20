import { nextTick } from 'vue'

async function highlightAll() {
  if (!import.meta.client)
    return

  await nextTick()
  const nodes = Array.from(document.querySelectorAll<HTMLElement>('pre code:not(.tuff-code-block__code)'))
  if (!nodes.length)
    return

  const { resolveHighlightApi } = await import('~/utils/highlight')
  const api = await resolveHighlightApi()
  if (!api)
    return

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

  let highlightRaf: number | null = null
  const scheduleRender = () => {
    if (highlightRaf)
      return
    highlightRaf = window.requestAnimationFrame(() => {
      highlightRaf = null
      void highlightAll()
    })
  }

  nuxtApp.hook('app:mounted', scheduleRender)
  nuxtApp.hook('page:finish', scheduleRender)
})
