/**
 * Build-time remark plugin that pre-highlights `code` YAML props on MDC `::TuffDemoWrapper`
 * and `:::TuffCodeBlock` nodes using pure-JS Shiki (`shiki/core` + `@shikijs/engine-javascript`,
 * ZERO Oniguruma WASM, dual `github-light`/`github-dark` themes via `--shiki-light`/`--shiki-dark`).
 *
 * Attaches the pre-highlighted HTML as `codeHtml` on the MDC component attributes so the client
 * renders highlighted code immediately with zero `hljs` polling, zero CDN scripts, and zero WASM.
 */
import { highlightCodeToHtml } from './shiki-js-highlighter'

interface MdcComponentNode {
  type: string
  name?: string
  attributes?: Record<string, unknown>
  fmAttributes?: Record<string, unknown>
  data?: {
    hProperties?: Record<string, unknown>
    [key: string]: unknown
  }
  children?: MdcComponentNode[]
}

const TARGET_COMPONENTS = new Set([
  'tuffdemowrapper',
  'tuffcodeblock',
])

const HTML_ENTITY_MAP: Record<string, string> = {
  '&lt;': '<',
  '&gt;': '>',
  '&amp;': '&',
  '&quot;': '"',
  '&#39;': '\'',
}

function decodeBasicEntities(value: string): string {
  if (!value.includes('&'))
    return value
  return value.replace(/&(lt|gt|amp|quot|#39);/g, match => HTML_ENTITY_MAP[match] ?? match)
}

function normalizeComponentName(name: string | undefined): string {
  if (!name)
    return ''
  return name.trim().toLowerCase().replace(/[-_]/g, '')
}

function resolveProp(node: MdcComponentNode, keys: string[]): string | undefined {
  for (const key of keys) {
    const fromAttr = node.attributes?.[key]
    if (typeof fromAttr === 'string' && fromAttr.length > 0)
      return fromAttr
    const fromFm = node.fmAttributes?.[key]
    if (typeof fromFm === 'string' && fromFm.length > 0)
      return fromFm
    const fromHProps = node.data?.hProperties?.[key]
    if (typeof fromHProps === 'string' && fromHProps.length > 0)
      return fromHProps
  }
  return undefined
}

function collectTargetNodes(node: MdcComponentNode, out: MdcComponentNode[]) {
  if (
    (node.type === 'containerComponent' || node.type === 'leafComponent')
    && TARGET_COMPONENTS.has(normalizeComponentName(node.name))
  ) {
    out.push(node)
  }

  for (const child of node.children ?? [])
    collectTargetNodes(child, out)
}

export function remarkShikiCodeProps(_options?: { revision?: string }) {
  return async (tree: MdcComponentNode) => {
    const targets: MdcComponentNode[] = []
    collectTargetNodes(tree, targets)
    if (!targets.length)
      return

    await Promise.all(targets.map(async (node) => {
      const rawCode = resolveProp(node, ['code'])
      if (!rawCode || !rawCode.trim())
        return

      // Do not overwrite an explicit pre-rendered `codeHtml`.
      if (resolveProp(node, ['codeHtml', 'code-html']))
        return

      const rawLang = resolveProp(node, ['code-lang', 'codeLang', 'lang']) ?? 'vue'
      const decodedCode = decodeBasicEntities(rawCode)
      const codeHtml = await highlightCodeToHtml(decodedCode, rawLang)

      node.attributes = {
        ...(node.attributes ?? {}),
        codeHtml,
      }
      if (node.fmAttributes)
        node.fmAttributes.codeHtml = codeHtml
      if (node.data?.hProperties)
        node.data.hProperties.codeHtml = codeHtml
    }))
  }
}

export default remarkShikiCodeProps
