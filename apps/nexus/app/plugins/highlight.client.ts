import { nextTick } from 'vue'
import { resolveHighlightApi } from '~/utils/highlight'

async function highlightAll() {
  if (!import.meta.client)
    return

  await nextTick()
  const api = await resolveHighlightApi()
  if (!api)
    return

  const nodes = Array.from(document.querySelectorAll<HTMLElement>('pre code:not(.tuff-code-block__code)'))
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
