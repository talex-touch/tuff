export interface DocTocEntry {
  id: string
  text: string
  depth: number
  children?: DocTocEntry[]
}

type MinimarkNode = string | [string, Record<string, any>?, ...MinimarkNode[]]

function isMinimarkNode(value: unknown): value is MinimarkNode {
  return typeof value === 'string' || Array.isArray(value)
}

export function buildDocOutlineTree(entries: DocTocEntry[]) {
  const root: DocTocEntry[] = []
  const stack: DocTocEntry[] = []
  for (const entry of entries) {
    const node: DocTocEntry = { ...entry, children: [] }
    while (stack.length) {
      const last = stack.at(-1)
      if (!last || last.depth < node.depth)
        break
      stack.pop()
    }
    const parent = stack.at(-1)
    if (parent)
      parent.children?.push(node)
    else
      root.push(node)
    stack.push(node)
  }
  return root
}

function normalizeTocLinks(value: unknown): DocTocEntry[] {
  if (!Array.isArray(value))
    return []

  return value
    .map((entry): DocTocEntry | null => {
      if (!entry || typeof entry !== 'object')
        return null
      const raw = entry as Record<string, any>
      const id = typeof raw.id === 'string' ? raw.id.trim() : ''
      const text = typeof raw.text === 'string' ? raw.text.trim() : ''
      const depth = Number(raw.depth)
      if (!id || !text || !Number.isFinite(depth))
        return null
      const children = normalizeTocLinks(raw.children)
      return children.length ? { id, text, depth, children } : { id, text, depth }
    })
    .filter((entry): entry is DocTocEntry => Boolean(entry))
}

function extractMinimarkText(value: MinimarkNode | undefined): string {
  if (!value)
    return ''
  if (typeof value === 'string')
    return value
  return value.slice(2).filter(isMinimarkNode).map(extractMinimarkText).join('')
}

function collectMinimarkHeadingEntries(nodes: unknown): DocTocEntry[] {
  if (!Array.isArray(nodes))
    return []

  const entries: DocTocEntry[] = []
  const walk = (items: unknown[]) => {
    for (const item of items) {
      if (!Array.isArray(item))
        continue
      const [tag, props] = item
      const children = item.slice(2)
      if (typeof tag === 'string' && /^h[2-4]$/.test(tag)) {
        const id = props && typeof props === 'object' && typeof (props as Record<string, any>).id === 'string'
          ? (props as Record<string, any>).id.trim()
          : ''
        const text = children.filter(isMinimarkNode).map(extractMinimarkText).join('').trim()
        const depth = Number(tag.slice(1))
        if (id && text)
          entries.push({ id, text, depth })
      }
      walk(children)
    }
  }

  walk(nodes)
  return entries
}

export function buildDocOutlineFromBody(body: unknown): DocTocEntry[] {
  if (!body || typeof body !== 'object')
    return []

  const rawBody = body as Record<string, any>
  const tocLinks = normalizeTocLinks(rawBody.toc?.links)
  if (tocLinks.length)
    return tocLinks

  if (rawBody.type === 'minimark')
    return buildDocOutlineTree(collectMinimarkHeadingEntries(rawBody.value))

  return []
}
