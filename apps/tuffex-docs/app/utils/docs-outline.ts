export interface DocTocEntry {
  id: string
  text: string
  depth: number
  children?: DocTocEntry[]
}

export function buildDocOutlineTree(entries: Array<{ id: string, text: string, depth: number }>): DocTocEntry[] {
  const root: DocTocEntry[] = []
  const stack: DocTocEntry[] = []

  for (const raw of entries) {
    const id = raw.id?.trim()
    const text = raw.text?.trim()
    if (!id || !text)
      continue

    const entry: DocTocEntry = {
      id,
      text,
      depth: Number.isFinite(raw.depth) ? raw.depth : 2,
      children: [],
    }

    while (stack.length && stack[stack.length - 1]!.depth >= entry.depth)
      stack.pop()

    const parent = stack[stack.length - 1]
    if (parent) {
      if (!parent.children)
        parent.children = []
      parent.children.push(entry)
    }
    else {
      root.push(entry)
    }

    stack.push(entry)
  }

  return root
}

/**
 * Normalizes TOC payloads from compiled `.mdc` `docMeta.toc` (whether `{ links: [...] }`,
 * flat heading entries, or nested `DocTocEntry[]`).
 */
export function normalizeApiToc(rawToc: unknown): DocTocEntry[] {
  if (!rawToc)
    return []

  const rawList = Array.isArray(rawToc)
    ? rawToc
    : typeof rawToc === 'object' && rawToc !== null && Array.isArray((rawToc as { links?: unknown }).links)
      ? (rawToc as { links: unknown[] }).links
      : []

  const normalizeNodes = (nodes: unknown[]): DocTocEntry[] => {
    const out: DocTocEntry[] = []
    for (const node of nodes) {
      if (!node || typeof node !== 'object')
        continue
      const item = node as Record<string, unknown>
      const id = typeof item.id === 'string' ? item.id.trim() : ''
      const text = typeof item.text === 'string' ? item.text.trim() : ''
      const depth = typeof item.depth === 'number' ? item.depth : 2
      if (!id || !text)
        continue
      const children = Array.isArray(item.children) ? normalizeNodes(item.children) : []
      out.push(children.length ? { id, text, depth, children } : { id, text, depth })
    }
    return out
  }

  return normalizeNodes(rawList)
}
