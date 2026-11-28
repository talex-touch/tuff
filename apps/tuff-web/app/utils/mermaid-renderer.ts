let mermaidInitPromise: Promise<typeof import('mermaid')['default'] | null> | null = null
let lastAppliedTheme: 'dark' | 'default' | null = null

async function loadMermaid() {
  if (!import.meta.client)
    return null
  if (!mermaidInitPromise) {
    mermaidInitPromise = import('mermaid')
      .then(mod => mod.default)
      .catch(() => {
        mermaidInitPromise = null
        return null
      })
  }
  return mermaidInitPromise
}

export async function renderMermaidInDocument(root: ParentNode = document): Promise<void> {
  if (!import.meta.client)
    return

  const nodes = Array.from(root.querySelectorAll<HTMLElement>('.mermaid:not([data-processed="true"])'))
  if (!nodes.length)
    return

  const mermaid = await loadMermaid()
  if (!mermaid)
    return

  const isDark = document.documentElement.classList.contains('dark')
    || document.documentElement.getAttribute('data-theme') === 'dark'
  const theme: 'dark' | 'default' = isDark ? 'dark' : 'default'

  if (lastAppliedTheme !== theme) {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'loose',
      theme,
    })
    lastAppliedTheme = theme
  }

  for (const node of nodes) {
    const source = (node.dataset.mermaidSource ?? node.textContent ?? '').trim()
    if (!source)
      continue
    node.dataset.mermaidSource = source
    try {
      const id = `tuffex-mermaid-${Math.random().toString(36).slice(2, 10)}`
      const { svg } = await mermaid.render(id, source)
      node.innerHTML = svg
      node.setAttribute('data-processed', 'true')
    }
    catch {
      node.setAttribute('data-processed', 'error')
    }
  }
}
