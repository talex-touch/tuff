import { createMarkdownParser } from '@nuxtjs/mdc/runtime/parser/index'
import { defaults as mdcParserDefaults } from '@nuxtjs/mdc/runtime/parser/options'
import type {
  CompileMdcToSfcOptions,
  CompiledMdcSfcResult,
  MdcPluginEntry,
  MdcToc,
  MdcTocLink,
} from './types'

interface MdcAstNode {
  type: 'root' | 'element' | 'text' | 'comment'
  tag?: string
  props?: Record<string, unknown>
  value?: string
  children?: MdcAstNode[]
}

const DEFAULT_INTERNAL_LINK_PATTERN = /^\/(en|zh)(?:\/|$|\?|#)/i

const VOID_HTML_TAGS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
])

const SVG_SELF_CLOSING_TAGS = new Set([
  'circle',
  'ellipse',
  'line',
  'path',
  'polygon',
  'polyline',
  'rect',
  'stop',
  'use',
])

const HEADING_TAGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6'])

/**
 * Standard HTML5 + SVG + MathML element names rendered as native elements
 * (never promoted to Vue PascalCase components).
 */
const STANDARD_NATIVE_TAGS = new Set([
  // HTML5
  'a', 'abbr', 'address', 'area', 'article', 'aside', 'audio',
  'b', 'base', 'bdi', 'bdo', 'blockquote', 'body', 'br', 'button',
  'canvas', 'caption', 'cite', 'code', 'col', 'colgroup',
  'data', 'datalist', 'dd', 'del', 'details', 'dfn', 'dialog', 'div', 'dl', 'dt',
  'em', 'embed',
  'fieldset', 'figcaption', 'figure', 'footer', 'form',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'head', 'header', 'hgroup', 'hr', 'html',
  'i', 'iframe', 'img', 'input', 'ins',
  'kbd',
  'label', 'legend', 'li', 'link',
  'main', 'map', 'mark', 'menu', 'meta', 'meter',
  'nav', 'noscript',
  'object', 'ol', 'optgroup', 'option', 'output',
  'p', 'param', 'picture', 'pre', 'progress',
  'q',
  'rp', 'rt', 'ruby',
  's', 'samp', 'search', 'section', 'select', 'slot', 'small', 'source', 'span', 'strong', 'sub', 'summary', 'sup',
  'table', 'tbody', 'td', 'textarea', 'tfoot', 'th', 'thead', 'time', 'title', 'tr', 'track',
  'u', 'ul',
  'var', 'video', 'wbr',
  // SVG (common + KaTeX)
  'svg', 'g', 'defs', 'symbol', 'use', 'desc', 'metadata',
  'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon',
  'text', 'tspan', 'textPath', 'image', 'foreignObject',
  'clipPath', 'mask', 'pattern', 'marker', 'filter',
  'linearGradient', 'radialGradient', 'stop',
  'feBlend', 'feColorMatrix', 'feComponentTransfer', 'feComposite',
  'feConvolveMatrix', 'feDiffuseLighting', 'feDisplacementMap', 'feDistantLight',
  'feDropShadow', 'feFlood', 'feFuncA', 'feFuncB', 'feFuncG', 'feFuncR',
  'feGaussianBlur', 'feImage', 'feMerge', 'feMergeNode', 'feMorphology',
  'feOffset', 'fePointLight', 'feSpecularLighting', 'feSpotLight', 'feTile', 'feTurbulence',
  // MathML (KaTeX)
  'math', 'semantics', 'annotation', 'annotation-xml',
  'mrow', 'mi', 'mn', 'mo', 'ms', 'mspace', 'mtext',
  'mfrac', 'msqrt', 'mroot', 'mstyle', 'merror', 'mpadded', 'mphantom', 'mfenced', 'menclose',
  'msub', 'msup', 'msubsup', 'munder', 'mover', 'munderover', 'mmultiscripts', 'mprescripts', 'none',
  'mtable', 'mtr', 'mlabeledtr', 'mtd', 'maligngroup', 'malignmark', 'maction',
])

const PRE_METADATA_PROPS = new Set([
  'code',
  'language',
  'meta',
  'filename',
  'highlights',
  '__ignoreMap',
])

const DIRECTIVE_PROP_RE = /^(?::|@|v-)/

type MarkdownParserFn = Awaited<ReturnType<typeof createMarkdownParser>>
const parserCache = new WeakMap<object, Promise<MarkdownParserFn>>()
let defaultParserPromise: Promise<MarkdownParserFn> | null = null

function getOrCreateParser(
  remarkPlugins?: Record<string, MdcPluginEntry | false>,
  rehypePlugins?: Record<string, MdcPluginEntry | false>,
  tocDepth = 4,
): Promise<MarkdownParserFn> {
  const hasCustomPlugins = Boolean(remarkPlugins || rehypePlugins)
  if (!hasCustomPlugins && tocDepth === 4) {
    if (!defaultParserPromise) {
      defaultParserPromise = createMarkdownParser({
        highlight: false,
        toc: { depth: 4, searchDepth: 4 },
      })
    }
    return defaultParserPromise
  }

  // Use the remarkPlugins object identity (or rehypePlugins) as WeakMap cache key when callers
  // reuse a stable plugin config object across 500+ documents.
  const cacheKey = remarkPlugins ?? rehypePlugins
  if (cacheKey && tocDepth === 4) {
    const cached = parserCache.get(cacheKey)
    if (cached)
      return cached
  }

  // Preserve exact execution order: default `remark-mdc` & `remark-gfm` MUST run BEFORE
  // custom remark plugins (such as `remark-shiki-code-props`), and `rehype-raw` MUST run
  // BEFORE custom rehype plugins (such as `rehype-shiki-js`).
  const orderedRemarkPlugins: Record<string, MdcPluginEntry | false> = {
    ...(mdcParserDefaults.remark?.plugins as Record<string, MdcPluginEntry>),
    ...(remarkPlugins ?? {}),
  }

  const orderedRehypePlugins: Record<string, MdcPluginEntry | false> = {
    ...(mdcParserDefaults.rehype?.plugins as Record<string, MdcPluginEntry>),
    ...(rehypePlugins ?? {}),
  }

  const promise = createMarkdownParser({
    highlight: false,
    toc: {
      depth: tocDepth,
      searchDepth: tocDepth,
    },
    remark: {
      plugins: orderedRemarkPlugins as never,
    },
    rehype: {
      plugins: orderedRehypePlugins as never,
    },
  })

  if (cacheKey && tocDepth === 4)
    parserCache.set(cacheKey, promise)

  return promise
}

export function toPascalCaseTag(tag: string): string {
  return tag
    .split(/[-_./]+/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')
}

function camelizePropKey(key: string): string {
  if (key.startsWith('data-') || key.startsWith('aria-') || key.includes(':'))
    return key
  return key.replace(/-([a-z0-9])/gi, (_, ch: string) => ch.toUpperCase())
}

function escapeHtmlText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function escapeNonPreVueText(value: string): string {
  const escaped = escapeHtmlText(value)
  if (!escaped.includes('{{') && !escaped.includes('}}'))
    return escaped
  return escaped
    .replace(/\{\{/g, '{{ \'{{\' }}')
    .replace(/\}\}/g, '{{ \'}}\' }}')
}

function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/**
 * Serializes a value to JS/JSON safe for embedding inside a `<script>` or `<script setup>` block:
 * escapes `<`, `>`, `\u2028`, `\u2029` so embedded `</script>` or `-->` snippets can never break SFC parsing.
 */
export function serializeScriptValue(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}

function normalizeStyleValue(value: unknown): string {
  if (typeof value === 'string')
    return value
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== null && v !== undefined && v !== '')
      .map(([k, v]) => {
        const cssProp = k.startsWith('--') ? k : k.replace(/[A-Z]/g, m => `-${m.toLowerCase()}`)
        return `${cssProp}:${String(v)}`
      })
      .join(';')
  }
  return ''
}

function rewriteInternalHref(href: string, baseURL: string, pattern: RegExp): string {
  if (!baseURL || !href)
    return href
  const cleanBase = baseURL.replace(/\/+$/, '')
  if (!cleanBase)
    return href
  if (href === cleanBase || href.startsWith(`${cleanBase}/`))
    return href
  if (pattern.test(href))
    return `${cleanBase}${href}`
  return href
}

function decodeBoundPropValue(raw: unknown, frontmatter: Record<string, unknown>): unknown {
  if (typeof raw !== 'string')
    return raw

  const trimmed = raw.trim()
  if (!trimmed)
    return ''

  // Match MDCRenderer's `evalInContext` behavior: first check dot-path in frontmatter, then JSON/destr parse.
  if (/^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/.test(trimmed)) {
    const lookedUp = trimmed.split('.').reduce<unknown>(
      (cursor, key) => (cursor && typeof cursor === 'object' && !Array.isArray(cursor) ? (cursor as Record<string, unknown>)[key] : undefined),
      frontmatter,
    )
    if (lookedUp !== undefined)
      return lookedUp
  }

  if (trimmed === 'true')
    return true
  if (trimmed === 'false')
    return false
  if (trimmed === 'null')
    return null
  if (trimmed === 'undefined')
    return undefined
  if (/^-?\d+(?:\.\d+)?$/.test(trimmed))
    return Number(trimmed)

  try {
    return JSON.parse(trimmed)
  }
  catch {
    return raw
  }
}

function decodeComponentProps(
  rawProps: Record<string, unknown> | undefined,
  frontmatter: Record<string, unknown>,
): Record<string, unknown> {
  if (!rawProps)
    return {}

  const out: Record<string, unknown> = {}
  for (const [rawKey, rawValue] of Object.entries(rawProps)) {
    if (rawKey === '__ignoreMap' || rawValue === undefined)
      continue

    if (rawKey === 'v-bind') {
      const bound = decodeBoundPropValue(rawValue, frontmatter)
      if (bound && typeof bound === 'object' && !Array.isArray(bound))
        Object.assign(out, bound)
      continue
    }

    if (rawKey.startsWith(':') || rawKey.startsWith('v-bind:')) {
      const cleanKey = camelizePropKey(rawKey.replace(/^(?::|v-bind:)/, ''))
      out[cleanKey] = decodeBoundPropValue(rawValue, frontmatter)
      continue
    }

    if (rawKey === 'className') {
      out.class = Array.isArray(rawValue) ? rawValue.join(' ') : String(rawValue)
      continue
    }

    const cleanKey = camelizePropKey(rawKey)
    if (Array.isArray(rawValue) && rawValue.every(v => typeof v === 'string'))
      out[cleanKey] = rawValue.join(' ')
    else
      out[cleanKey] = rawValue
  }

  return out
}

const HAST_HTML_ATTR_MAP: Record<string, string> = {
  className: 'class',
  htmlFor: 'for',
  acceptCharset: 'accept-charset',
  httpEquiv: 'http-equiv',
  xmlnsXlink: 'xmlns:xlink',
  xlinkHref: 'xlink:href',
  xmlLang: 'xml:lang',
  xmlSpace: 'xml:space',
}

const SVG_PRESERVE_CASE_ATTRS = new Set([
  'viewBox', 'preserveAspectRatio', 'pathLength',
  'gradientUnits', 'gradientTransform', 'spreadMethod',
  'patternUnits', 'patternContentUnits', 'patternTransform',
  'clipPathUnits', 'maskUnits', 'maskContentUnits',
  'filterUnits', 'primitiveUnits', 'markerUnits', 'markerWidth', 'markerHeight',
  'refX', 'refY', 'stdDeviation', 'baseFrequency', 'numOctaves',
  'surfaceScale', 'specularConstant', 'specularExponent', 'diffuseConstant',
  'kernelMatrix', 'targetX', 'targetY', 'edgeMode', 'tableValues',
  'xChannelSelector', 'yChannelSelector', 'startOffset', 'textLength', 'lengthAdjust',
  'attributeName', 'attributeType', 'repeatCount', 'repeatDur',
  'calcMode', 'keyTimes', 'keySplines',
  'systemLanguage', 'requiredExtensions', 'requiredFeatures',
])

function hastPropToAttrName(prop: string, inSvg: boolean): string {
  const mapped = HAST_HTML_ATTR_MAP[prop]
  if (mapped)
    return mapped
  if (prop.startsWith('aria') && prop.length > 4 && /[A-Z]/.test(prop[4]!))
    return prop.replace(/([A-Z])/g, '-$1').toLowerCase()
  if (prop.startsWith('data') && prop.length > 4 && /[A-Z]/.test(prop[4]!))
    return prop.replace(/([A-Z])/g, '-$1').toLowerCase()
  if (inSvg) {
    if (SVG_PRESERVE_CASE_ATTRS.has(prop))
      return prop
    if (/[A-Z]/.test(prop))
      return prop.replace(/([A-Z])/g, '-$1').toLowerCase()
    return prop
  }
  return prop.toLowerCase()
}

function serializeStaticAttributes(
  tag: string,
  rawProps: Record<string, unknown> | undefined,
  inSvg: boolean,
  baseURL: string,
  internalLinkPattern: RegExp,
): string {
  if (!rawProps)
    return ''

  const attrMap = new Map<string, string | boolean>()

  for (const [rawKey, rawValue] of Object.entries(rawProps)) {
    if (rawKey === '__ignoreMap' || rawValue === undefined || rawValue === null || rawValue === false)
      continue
    if (tag === 'pre' && PRE_METADATA_PROPS.has(rawKey))
      continue

    if (rawKey === 'className' || rawKey === 'class') {
      const nextClass = Array.isArray(rawValue)
        ? rawValue.map(String).filter(Boolean).join(' ')
        : String(rawValue).trim()
      if (!nextClass)
        continue
      const prev = typeof attrMap.get('class') === 'string' ? (attrMap.get('class') as string) : ''
      attrMap.set('class', prev ? `${prev} ${nextClass}` : nextClass)
      continue
    }

    if (rawKey === 'style') {
      const styleStr = normalizeStyleValue(rawValue)
      if (styleStr)
        attrMap.set('style', styleStr)
      continue
    }

    const attrName = hastPropToAttrName(rawKey, inSvg)

    if (rawValue === true) {
      // Preserve ARIA/data boolean attributes as explicit `"true"`, standard HTML booleans as valueless.
      if (attrName.startsWith('aria-') || attrName.startsWith('data-') || attrName === 'contenteditable' || attrName === 'draggable' || attrName === 'spellcheck')
        attrMap.set(attrName, 'true')
      else
        attrMap.set(attrName, true)
      continue
    }

    let strVal = Array.isArray(rawValue)
      ? rawValue.map(String).join(' ')
      : String(rawValue)

    if (tag === 'a' && attrName === 'href')
      strVal = rewriteInternalHref(strVal, baseURL, internalLinkPattern)

    attrMap.set(attrName, strVal)
  }

  let out = ''
  for (const [name, value] of attrMap) {
    if (value === false)
      continue
    if (value === true)
      out += ` ${name}`
    else
      out += ` ${name}="${escapeHtmlAttr(value)}"`
  }
  return out
}

function extractNodeText(node: MdcAstNode): string {
  if (node.type === 'text')
    return node.value ?? ''
  return (node.children ?? []).map(extractNodeText).join('')
}

function getNamedSlotFromTemplate(node: MdcAstNode): string {
  for (const key of Object.keys(node.props ?? {})) {
    if (key.startsWith('#'))
      return key.slice(1) || 'default'
    if (key.startsWith('v-slot:'))
      return key.slice('v-slot:'.length) || 'default'
    if (key === 'v-slot')
      return 'default'
  }
  return 'default'
}

function normalizeToc(rawToc: unknown, tocDepth: number): MdcToc {
  const rec = (rawToc && typeof rawToc === 'object' ? rawToc : {}) as Record<string, unknown>

  const normalizeLinks = (nodes: unknown): MdcTocLink[] => {
    if (!Array.isArray(nodes))
      return []
    const out: MdcTocLink[] = []
    for (const item of nodes) {
      if (!item || typeof item !== 'object')
        continue
      const link = item as Record<string, unknown>
      const id = typeof link.id === 'string' ? link.id.trim() : ''
      const text = typeof link.text === 'string' ? link.text.trim() : ''
      const depth = typeof link.depth === 'number' ? link.depth : 2
      if (!id || !text)
        continue
      const children = normalizeLinks(link.children)
      out.push(children.length ? { id, text, depth, children } : { id, text, depth })
    }
    return out
  }

  return {
    title: typeof rec.title === 'string' ? rec.title : '',
    searchDepth: typeof rec.searchDepth === 'number' ? rec.searchDepth : tocDepth,
    depth: typeof rec.depth === 'number' ? rec.depth : tocDepth,
    links: normalizeLinks(rec.links),
  }
}

function analyzeAstMetadata(root: MdcAstNode): {
  demoNames: string[]
  hasMath: boolean
  hasMermaid: boolean
} {
  const demoSet = new Set<string>()
  let hasMath = false
  let hasMermaid = false

  const walk = (node: MdcAstNode) => {
    if (node.type === 'element' && node.tag) {
      const normalizedTag = node.tag.toLowerCase().replace(/[-_]/g, '')
      if (normalizedTag === 'tuffdemowrapper' || normalizedTag === 'tuffdemo') {
        const demo = node.props?.demo
        if (typeof demo === 'string' && demo.trim())
          demoSet.add(demo.trim())
      }

      const cls = node.props?.className ?? node.props?.class
      const classText = Array.isArray(cls) ? cls.join(' ') : typeof cls === 'string' ? cls : ''
      if (/\bkatex\b/i.test(classText))
        hasMath = true
      if (/\b(?:docs-mermaid|mermaid)\b/i.test(classText))
        hasMermaid = true
    }

    for (const child of node.children ?? [])
      walk(child)
  }

  walk(root)

  return {
    demoNames: [...demoSet],
    hasMath,
    hasMermaid,
  }
}

/**
 * Compiles a raw `.mdc` Markdown document into a build-time Vue 3 SFC:
 * - Static HTML prose & pre-highlighted Shiki `<pre>` blocks carry element-level `v-pre`
 *   so `@vitejs/plugin-vue` hoists them into `createStaticVNode(...)` with zero hydration cost,
 *   while preserving direct-child CSS selectors (e.g. `.docs-prose--hero > h1:first-of-type`).
 * - Dynamic MDC components receive JSON-serialized props via `const __mdcProps_N = ...` and
 *   `v-bind="__mdcProps_N"` (zero HTML attribute escaping bugs, zero `{{ }}` conflicts).
 * - Exports `export const docMeta = ...` in a standard `<script lang="ts">` block.
 */
export async function compileMdcToSfc<TMeta = Record<string, unknown>>(
  rawMarkdown: string,
  options: CompileMdcToSfcOptions<TMeta> = {},
): Promise<CompiledMdcSfcResult<TMeta>> {
  const tocDepth = options.tocDepth ?? 4
  const baseURL = options.baseURL ?? ''
  const internalLinkPattern = options.internalLinkPattern ?? DEFAULT_INTERNAL_LINK_PATTERN
  const rootClass = options.rootClass ?? 'mdc-sfc-doc'

  const parser = await getOrCreateParser(options.remarkPlugins, options.rehypePlugins, tocDepth)
  const parsed = await parser(rawMarkdown, options.filePath ? { fileOptions: { path: options.filePath } } : undefined)

  const frontmatter = (parsed.data && typeof parsed.data === 'object'
    ? parsed.data
    : {}) as Record<string, unknown>
  const body = (parsed.body ?? { type: 'root', children: [] }) as MdcAstNode
  const toc = normalizeToc(parsed.toc, tocDepth)
  const { demoNames, hasMath, hasMermaid } = analyzeAstMetadata(body)

  const meta = (options.buildMeta
    ? options.buildMeta({
        filePath: options.filePath,
        frontmatter,
        toc,
        demoNames,
        hasMath,
        hasMermaid,
      })
    : {
        ...frontmatter,
        toc,
        demoNames,
        hasMath,
        hasMermaid,
      }) as TMeta

  // Precompute whether each AST subtree is 100% static HTML/SVG/MathML (eligible for `v-pre`).
  const staticMemo = new WeakMap<MdcAstNode, boolean>()
  const isStaticSubtree = (node: MdcAstNode): boolean => {
    const cached = staticMemo.get(node)
    if (cached !== undefined)
      return cached

    let result = true
    if (node.type === 'text' || node.type === 'comment') {
      result = true
    }
    else if (node.type === 'element') {
      const tag = node.tag ?? ''
      if (tag === 'script' || tag === 'style' || tag === 'template' || tag === 'binding') {
        result = false
      }
      else if (!STANDARD_NATIVE_TAGS.has(tag)) {
        result = false
      }
      else {
        for (const key of Object.keys(node.props ?? {})) {
          if (DIRECTIVE_PROP_RE.test(key)) {
            result = false
            break
          }
        }
        if (result) {
          for (const child of node.children ?? []) {
            if (!isStaticSubtree(child)) {
              result = false
              break
            }
          }
        }
      }
    }
    else {
      result = (node.children ?? []).every(isStaticSubtree)
    }

    staticMemo.set(node, result)
    return result
  }

  const usedComponents = new Set<string>()
  const propDeclarations: string[] = []
  const extractedStyles: Array<{ scoped: boolean, css: string }> = []

  const renderStaticNode = (node: MdcAstNode, insidePre: boolean, inSvg: boolean): string => {
    if (node.type === 'comment')
      return ''
    if (node.type === 'text')
      return escapeHtmlText(node.value ?? '')
    if (node.type !== 'element' || !node.tag)
      return (node.children ?? []).map(c => renderStaticNode(c, insidePre, inSvg)).join('')

    const tag = node.tag
    const nextInSvg = inSvg || tag === 'svg'
    const vPreAttr = insidePre ? '' : ' v-pre'
    const attrs = serializeStaticAttributes(tag, node.props, nextInSvg, baseURL, internalLinkPattern)

    if (!nextInSvg && VOID_HTML_TAGS.has(tag))
      return `<${tag}${vPreAttr}${attrs}>`

    const children = node.children ?? []

    if (nextInSvg && children.length === 0 && SVG_SELF_CLOSING_TAGS.has(tag))
      return `<${tag}${vPreAttr}${attrs} />`

    let innerHtml = children.map(c => renderStaticNode(c, true, nextInSvg)).join('')

    // Preserve heading anchor structure (`<h2 id="..."><a href="#...">...</a></h2>`)
    // so DocsOutline scroll-spy & hash navigation match DocsProseHeading identically.
    if (HEADING_TAGS.has(tag)) {
      const headingId = typeof node.props?.id === 'string' ? node.props.id.trim() : ''
      const alreadyLinked = children.length === 1 && children[0]?.type === 'element' && children[0]?.tag === 'a'
      if (headingId && !alreadyLinked)
        innerHtml = `<a href="#${escapeHtmlAttr(headingId)}">${innerHtml}</a>`
    }

    return `<${tag}${vPreAttr}${attrs}>${innerHtml}</${tag}>`
  }

  const renderDynamicNode = (node: MdcAstNode, inSvg: boolean): string => {
    if (node.type === 'comment')
      return ''
    if (node.type === 'text')
      return escapeNonPreVueText(node.value ?? '')
    if (node.type !== 'element' || !node.tag)
      return (node.children ?? []).map(c => renderDynamicNode(c, inSvg)).join('')

    const tag = node.tag

    // Drop stray `<script>` blocks (previously swallowed by ProseScript).
    if (tag === 'script')
      return ''

    // Hoist `<style>` blocks out of `<template>` into top-level SFC `<style>` blocks.
    if (tag === 'style') {
      const css = extractNodeText(node).trim()
      if (css) {
        const scoped = Boolean(node.props?.scoped === true || node.props?.scoped === '')
        extractedStyles.push({ scoped, css })
      }
      return ''
    }

    // MDC inline binding node (`{{ $doc.foo }}` / `{{ foo }}`).
    if (tag === 'binding') {
      const expr = typeof node.props?.value === 'string' ? node.props.value.trim() : ''
      const fallback = typeof node.props?.defaultValue === 'string' ? node.props.defaultValue : ''
      const val = expr ? decodeBoundPropValue(expr, frontmatter) : undefined
      return escapeNonPreVueText(String(val ?? fallback))
    }

    // Any completely static HTML/SVG/MathML subtree switches into `v-pre` immediately!
    if (isStaticSubtree(node))
      return renderStaticNode(node, false, inSvg)

    // Standard HTML wrapper element that contains a dynamic descendant component.
    if (STANDARD_NATIVE_TAGS.has(tag)) {
      const nextInSvg = inSvg || tag === 'svg'
      const attrs = serializeStaticAttributes(tag, node.props, nextInSvg, baseURL, internalLinkPattern)
      if (!nextInSvg && VOID_HTML_TAGS.has(tag))
        return `<${tag}${attrs}>`
      const childrenHtml = (node.children ?? []).map(c => renderDynamicNode(c, nextInSvg)).join('')
      return `<${tag}${attrs}>${childrenHtml}</${tag}>`
    }

    // Dynamic MDC Vue component (e.g. `TuffDemoWrapper`, `TuffCodeBlock`, `DocApiTable`, ...).
    const pascalTag = toPascalCaseTag(tag)
    usedComponents.add(pascalTag)

    const decodedProps = decodeComponentProps(node.props, frontmatter)
    let bindAttr = ''
    if (Object.keys(decodedProps).length > 0) {
      const propIndex = propDeclarations.length
      const propVar = `__mdcProps_${propIndex}`
      propDeclarations.push(`const ${propVar} = ${serializeScriptValue(decodedProps)}`)
      bindAttr = ` v-bind="${propVar}"`
    }

    const children = node.children ?? []
    if (!children.length)
      return `<${pascalTag}${bindAttr} />`

    const defaultChildren: MdcAstNode[] = []
    const namedSlots = new Map<string, MdcAstNode[]>()

    for (const child of children) {
      if (child.type === 'element' && child.tag === 'template') {
        const slotName = getNamedSlotFromTemplate(child)
        const bucket = namedSlots.get(slotName) ?? []
        bucket.push(...(child.children ?? []))
        namedSlots.set(slotName, bucket)
      }
      else {
        defaultChildren.push(child)
      }
    }

    const parts: string[] = []
    for (const child of defaultChildren) {
      const rendered = renderDynamicNode(child, false)
      if (rendered)
        parts.push(rendered)
    }
    for (const [slotName, slotChildren] of namedSlots) {
      const renderedSlot = slotChildren.map(c => renderDynamicNode(c, false)).join('')
      if (slotName === 'default')
        parts.push(renderedSlot)
      else
        parts.push(`<template #${slotName}>${renderedSlot}</template>`)
    }

    if (!parts.length)
      return `<${pascalTag}${bindAttr} />`

    return `<${pascalTag}${bindAttr}>\n${parts.join('\n')}\n</${pascalTag}>`
  }

  const templateChildren: string[] = []
  for (const child of body.children ?? []) {
    const rendered = renderDynamicNode(child, false)
    if (rendered)
      templateChildren.push(rendered)
  }

  // Build explicit ES imports for dynamic MDC components if resolver is provided.
  const importLines: string[] = []
  if (options.resolveComponentImport) {
    for (const pascalName of [...usedComponents].sort()) {
      const resolved = options.resolveComponentImport(pascalName)
      if (!resolved?.path)
        continue
      const importPath = JSON.stringify(resolved.path)
      if (resolved.export && resolved.export !== 'default') {
        if (resolved.export === pascalName)
          importLines.push(`import { ${pascalName} } from ${importPath}`)
        else
          importLines.push(`import { ${resolved.export} as ${pascalName} } from ${importPath}`)
      }
      else {
        importLines.push(`import ${pascalName} from ${importPath}`)
      }
    }
  }

  const sfcBlocks: string[] = []
  const hasScriptSetup = importLines.length > 0 || propDeclarations.length > 0

  // Normal `<script lang="ts">` exports static `docMeta` as a named ES export.
  // When no `<script setup>` is emitted (pure-prose docs), provide `export default {}`
  // so `@vitejs/plugin-vue`'s `import _sfc_main from "...?vue&type=script&lang.ts"` succeeds.
  sfcBlocks.push([
    '<script lang="ts">',
    `export const docMeta = ${serializeScriptValue(meta)}`,
    ...(hasScriptSetup ? [] : ['export default {}']),
    '</script>',
  ].join('\n'))

  // `<script setup lang="ts">` holds explicit component imports and JSON-bound props constants.
  if (hasScriptSetup) {
    sfcBlocks.push([
      '<script setup lang="ts">',
      ...importLines,
      ...propDeclarations,
      '</script>',
    ].join('\n'))
  }

  const rootOpen = rootClass ? `<div class="${escapeHtmlAttr(rootClass)}">` : '<div>'
  sfcBlocks.push([
    '<template>',
    rootOpen,
    ...templateChildren,
    '</div>',
    '</template>',
  ].join('\n'))

  for (const styleBlock of extractedStyles) {
    const attr = styleBlock.scoped ? ' scoped' : ''
    sfcBlocks.push(`<style${attr}>\n${styleBlock.css}\n</style>`)
  }

  return {
    sfc: `${sfcBlocks.join('\n\n')}\n`,
    meta,
    usedComponents: [...usedComponents].sort(),
    demoNames,
    hasMath,
    hasMermaid,
  }
}
