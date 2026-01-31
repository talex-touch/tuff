import { nextTick } from 'vue'

type MermaidApi = typeof import('mermaid')

let mermaidApi: MermaidApi['default'] | null = null
let activeTheme: string | null = null

function resolveTheme() {
  const root = document.documentElement
  if (root.classList.contains('dark') || root.dataset.theme === 'dark')
    return 'dark'
  return 'default'
}

async function getMermaid() {
  if (!mermaidApi) {
    const mod = await import('mermaid')
    mermaidApi = mod.default ?? mod
  }
  return mermaidApi
}

async function renderMermaid() {
  if (!import.meta.client)
    return

  const mermaid = await getMermaid()
  const theme = resolveTheme()

  if (theme !== activeTheme) {
    mermaid.initialize({
      startOnLoad: false,
      theme,
      logLevel: 'error',
    })
    activeTheme = theme
    document.querySelectorAll<HTMLElement>('.mermaid').forEach((node) => {
      node.removeAttribute('data-processed')
    })
  }

  await nextTick()
  const nodes = Array.from(document.querySelectorAll<HTMLElement>('.mermaid'))
  if (!nodes.length)
    return

  try {
    await mermaid.run({ nodes })
  }
  catch {
    // ignore mermaid render errors to avoid breaking docs rendering
  }
}

export default defineNuxtPlugin((nuxtApp) => {
  if (!import.meta.client)
    return

  const scheduleRender = () => {
    void renderMermaid()
  }

  nuxtApp.hook('app:mounted', scheduleRender)
  nuxtApp.hook('page:finish', scheduleRender)
})
