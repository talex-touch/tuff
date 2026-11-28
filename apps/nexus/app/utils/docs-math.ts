/**
 * Detects whether a parsed `@nuxt/content` / MDC document body contains KaTeX
 * math markup emitted by `app/utils/remark-math.ts`.
 *
 * Used by `pages/docs/[...slug].vue` so `katex/dist/katex.min.css` (~23 KB +
 * 59 font assets) is only loaded on the ~3% of docs pages that actually render
 * math formulas, while still emitting the stylesheet link during SSR for zero
 * FOUC on math pages.
 */

const KATEX_CLASS_RE = /\bkatex(?:-display|-mathml|-html)?\b/
const RAW_MATH_HTML_RE = /class=["'][^"']*\bkatex(?:-display)?\b|<math[\s>]/i

function hasKatexClassValue(value: unknown): boolean {
  if (typeof value === 'string')
    return KATEX_CLASS_RE.test(value)
  if (Array.isArray(value))
    return value.some(item => typeof item === 'string' && KATEX_CLASS_RE.test(item))
  return false
}

function propsContainKatex(props: unknown): boolean {
  if (!props || typeof props !== 'object')
    return false
  const record = props as Record<string, unknown>
  return hasKatexClassValue(record.class) || hasKatexClassValue(record.className)
}

function walkMinimark(nodes: unknown): boolean {
  if (!Array.isArray(nodes))
    return false

  for (const node of nodes) {
    if (typeof node === 'string') {
      if (RAW_MATH_HTML_RE.test(node))
        return true
      continue
    }
    if (!Array.isArray(node) || node.length === 0)
      continue

    const [tag, props] = node
    if (tag === 'math')
      return true
    if (propsContainKatex(props))
      return true
    if (node.length > 2 && walkMinimark(node.slice(2)))
      return true
  }

  return false
}

function walkNode(node: unknown): boolean {
  if (!node)
    return false

  if (typeof node === 'string')
    return RAW_MATH_HTML_RE.test(node)

  if (Array.isArray(node))
    return walkMinimark(node)

  if (typeof node !== 'object')
    return false

  const record = node as Record<string, unknown>

  if (record.type === 'minimark')
    return walkMinimark(record.value)

  if (record.tag === 'math' || record.tagName === 'math' || record.type === 'math' || record.type === 'inlineMath')
    return true

  if (propsContainKatex(record.props) || propsContainKatex(record.properties))
    return true

  if (typeof record.value === 'string' && RAW_MATH_HTML_RE.test(record.value))
    return true

  if (Array.isArray(record.value) && walkMinimark(record.value))
    return true

  if (Array.isArray(record.children)) {
    for (const child of record.children) {
      if (walkNode(child))
        return true
    }
  }

  return false
}

export function hasDocMathContent(body: unknown): boolean {
  return walkNode(body)
}
