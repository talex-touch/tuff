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

export async function renderMermaidInDocument(root?: ParentNode) {
  if (!import.meta.client)
    return false

  await nextTick()

  const target = root ?? document
  const nodes = Array.from(target.querySelectorAll<HTMLElement>('.mermaid'))
  if (!nodes.length)
    return false

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

  try {
    await mermaid.run({ nodes })
    return true
  }
  catch {
    return false
  }
}
