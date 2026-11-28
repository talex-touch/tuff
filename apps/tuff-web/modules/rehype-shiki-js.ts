/**
 * Build-time rehype plugin that highlights fenced Markdown code blocks using pure-JS Shiki
 * (`shiki/core` + `@shikijs/engine-javascript`, ZERO Oniguruma WASM, dual `github-light`/`github-dark`
 * CSS vars `--shiki-light` / `--shiki-dark`).
 *
 * `@nuxt/content@3.15.0`'s built-in `markdown.highlight` hardcodes `createOnigurumaEngine(import('shiki/wasm'))`.
 * Running with `content.build.markdown.highlight: false` and this rehype plugin keeps build-time
 * highlighting 100% pure-JS with zero WASM.
 */
import { highlightCodeToHast, normalizeShikiLang } from './shiki-js-highlighter'

interface HastNode {
  type: string
  tagName?: string
  value?: string
  properties?: Record<string, unknown>
  children?: HastNode[]
}

function extractText(node: HastNode): string {
  if (node.type === 'text')
    return node.value ?? ''
  return (node.children ?? []).map(extractText).join('')
}

function collectPreNodes(node: HastNode, out: HastNode[]) {
  if (node.type === 'element' && node.tagName === 'pre') {
    const lang = typeof node.properties?.language === 'string'
      ? node.properties.language
      : undefined
    if (lang && lang.toLowerCase() !== 'text' && lang.toLowerCase() !== 'mermaid')
      out.push(node)
    return
  }

  for (const child of node.children ?? [])
    collectPreNodes(child, out)
}

export function rehypeShikiJs(_options?: { revision?: string }) {
  return async (tree: HastNode) => {
    const preNodes: HastNode[] = []
    collectPreNodes(tree, preNodes)
    if (!preNodes.length)
      return

    await Promise.all(preNodes.map(async (preNode) => {
      const rawLang = typeof preNode.properties?.language === 'string'
        ? preNode.properties.language
        : 'text'
      const normalizedLang = normalizeShikiLang(rawLang)
      if (normalizedLang === 'text')
        return

      const rawCode = typeof preNode.properties?.code === 'string'
        ? preNode.properties.code
        : extractText(preNode)
      if (!rawCode.trim())
        return

      const root = await highlightCodeToHast(rawCode, normalizedLang)
      const shikiPre = root?.children?.[0] as HastNode | undefined
      const shikiCode = shikiPre?.children?.[0] as HastNode | undefined
      if (!shikiPre || !shikiCode?.children)
        return

      const existingClasses = Array.isArray(preNode.properties?.className)
        ? (preNode.properties.className as string[])
        : typeof preNode.properties?.className === 'string'
          ? preNode.properties.className.split(/\s+/).filter(Boolean)
          : []
      const shikiClasses = Array.isArray(shikiPre.properties?.class)
        ? (shikiPre.properties.class as string[])
        : typeof shikiPre.properties?.class === 'string'
          ? shikiPre.properties.class.split(/\s+/).filter(Boolean)
          : ['shiki', 'shiki-themes', 'github-light', 'github-dark']

      preNode.properties = {
        ...(preNode.properties ?? {}),
        className: [...new Set([...existingClasses, ...shikiClasses])],
        ...(typeof shikiPre.properties?.style === 'string'
          ? { style: shikiPre.properties.style }
          : {}),
      }

      const targetCode = preNode.children?.find(child => child.type === 'element' && child.tagName === 'code')
      if (targetCode)
        targetCode.children = shikiCode.children
      else
        preNode.children = [shikiCode]
    }))
  }
}

export default rehypeShikiJs
