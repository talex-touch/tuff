import { fetchCoreAppSvgContent } from '~/modules/tuffex/icon-config'
import { storeHttpRequest } from './store-http-client'

const SAFE_SVG_FRAGMENT_RE = /^#[A-Za-z_][\w:.-]*$/
const SAFE_SVG_URL_FUNC_RE = /url\s*\(([^)]*)\)/gi
const ALLOWED_SVG_ELEMENTS = new Set([
  'svg',
  'g',
  'path',
  'circle',
  'ellipse',
  'rect',
  'line',
  'polyline',
  'polygon',
  'defs',
  'clippath',
  'mask',
  'lineargradient',
  'radialgradient',
  'stop',
  'symbol',
  'use',
  'title',
  'desc',
  'pattern',
  'filter',
  'fegaussianblur',
  'feoffset',
  'feblend',
  'fecolormatrix',
  'fecomposite',
  'feflood',
  'femerge',
  'femergenode',
  'fedropshadow',
  'text',
  'tspan'
])

const XML_COMMENT_OR_DECL_RE = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[[\s\S]*?\]\]>/g
const XML_TAG_RE = /<(\/?)([A-Za-z_][\w:.-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g
const XML_ATTR_RE = /([A-Za-z_:][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g

function decodeSafeXmlEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-fA-F]+);?/gi, (_m, hex: string) => {
      const code = Number.parseInt(hex, 16)
      return Number.isFinite(code) && code >= 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : ''
    })
    .replace(/&#(\d+);?/g, (_m, dec: string) => {
      const code = Number.parseInt(dec, 10)
      return Number.isFinite(code) && code >= 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : ''
    })
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
}

function decodeCssForSvgAttr(value: string): string {
  return value
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\\([0-9a-fA-F]{1,6})\s?/g, (_m, hex: string) => {
      const code = Number.parseInt(hex, 16)
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : ''
    })
    .replace(/\\([^\n\r\f])/g, '$1')
}

function isSafeSvgAttribute(name: string, value: string): boolean {
  const lowerName = name.toLowerCase()
  const localName = lowerName.includes(':') ? lowerName.split(':').pop()! : lowerName
  const decodedValue = decodeSafeXmlEntities(value).replaceAll('\u0000', '').trim()
  const cssDecodedValue = decodeCssForSvgAttr(decodedValue)

  if (localName.startsWith('on') || lowerName.startsWith('on')) return false
  if (
    localName === 'href' ||
    localName === 'src' ||
    localName === 'action' ||
    localName === 'formaction'
  ) {
    return localName === 'href' && SAFE_SVG_FRAGMENT_RE.test(decodedValue)
  }

  for (const candidate of [decodedValue, cssDecodedValue]) {
    const lowered = candidate.toLowerCase()
    if (
      lowered.includes('javascript:') ||
      lowered.includes('vbscript:') ||
      lowered.includes('data:') ||
      lowered.includes('expression(') ||
      lowered.includes('@import') ||
      lowered.includes('image-set(') ||
      lowered.includes('cross-fade(') ||
      lowered.includes('-moz-binding') ||
      lowered.includes('behavior:')
    ) {
      return false
    }
    if (/\burl\s*\(/i.test(candidate)) {
      const matches = [...candidate.matchAll(SAFE_SVG_URL_FUNC_RE)]
      if (matches.length === 0) return false
      for (const match of matches) {
        const target = (match[1] ?? '')
          .trim()
          .replace(/^['"]|['"]$/g, '')
          .trim()
        if (!SAFE_SVG_FRAGMENT_RE.test(target)) {
          return false
        }
      }
    }
  }
  return true
}

function escapeXmlAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function sanitizeSvgWithDomParser(slice: string): string {
  try {
    const doc = new DOMParser().parseFromString(slice, 'image/svg+xml')
    if (
      doc.getElementsByTagName('parsererror').length > 0 ||
      doc.documentElement?.localName?.toLowerCase() !== 'svg'
    ) {
      return ''
    }

    const walk = (element: Element): void => {
      for (const attr of Array.from(element.attributes)) {
        if (!isSafeSvgAttribute(attr.name, attr.value)) {
          element.removeAttribute(attr.name)
        }
      }
      for (const child of Array.from(element.childNodes)) {
        if (child.nodeType === 8 || child.nodeType === 7) {
          child.parentNode?.removeChild(child)
          continue
        }
        if (child.nodeType === 1) {
          const childEl = child as Element
          const tag = (childEl.localName || childEl.tagName).toLowerCase()
          if (!ALLOWED_SVG_ELEMENTS.has(tag)) {
            childEl.parentNode?.removeChild(childEl)
            continue
          }
          walk(childEl)
        }
      }
    }

    walk(doc.documentElement)
    return new XMLSerializer().serializeToString(doc.documentElement).trim()
  } catch {
    return ''
  }
}

function sanitizeSvgWithStrictXmlAllowlist(slice: string): string {
  const stripped = slice.replace(XML_COMMENT_OR_DECL_RE, '').trim()
  if (!isWellFormedSvgXml(stripped)) {
    return ''
  }

  let out = ''
  let lastIndex = 0
  let skipDepth = 0

  for (const match of stripped.matchAll(XML_TAG_RE)) {
    const index = match.index ?? 0
    const between = stripped.slice(lastIndex, index)
    if (skipDepth === 0) {
      out += between
    }
    lastIndex = index + match[0].length

    const isClosing = match[1] === '/'
    const rawTag = match[2] ?? ''
    const rawAttrs = match[3] ?? ''
    const isSelfClosing = match[4] === '/'
    const localTag = (rawTag.includes(':') ? rawTag.split(':').pop()! : rawTag).toLowerCase()

    if (skipDepth > 0) {
      if (isClosing) {
        skipDepth -= 1
      } else if (!isSelfClosing) {
        skipDepth += 1
      }
      continue
    }

    if (!ALLOWED_SVG_ELEMENTS.has(localTag)) {
      if (!isClosing && !isSelfClosing) {
        skipDepth = 1
      }
      continue
    }

    if (isClosing) {
      out += `</${rawTag}>`
      continue
    }

    const keptAttrs: string[] = []
    for (const attrMatch of rawAttrs.matchAll(XML_ATTR_RE)) {
      const attrName = attrMatch[1]!
      const attrValue = attrMatch[2] ?? attrMatch[3] ?? attrMatch[4] ?? ''
      if (isSafeSvgAttribute(attrName, attrValue)) {
        keptAttrs.push(`${attrName}="${escapeXmlAttr(attrValue)}"`)
      }
    }
    const attrStr = keptAttrs.length > 0 ? ` ${keptAttrs.join(' ')}` : ''
    out += `<${rawTag}${attrStr}${isSelfClosing ? '/>' : '>'}`
  }

  if (skipDepth > 0) return ''
  out += stripped.slice(lastIndex)
  return out.trim()
}

function isWellFormedSvgXml(svg: string): boolean {
  if (typeof DOMParser === 'function') {
    try {
      const doc = new DOMParser().parseFromString(svg, 'image/svg+xml')
      if (
        doc.getElementsByTagName('parsererror').length > 0 ||
        doc.documentElement?.localName?.toLowerCase() !== 'svg'
      ) {
        return false
      }
    } catch {
      return false
    }
  }

  const stripped = svg.replace(XML_COMMENT_OR_DECL_RE, '').trim()
  const stack: string[] = []
  let rootClosed = false
  let lastIndex = 0
  let matchedAny = false

  for (const match of stripped.matchAll(XML_TAG_RE)) {
    const index = match.index ?? 0
    const between = stripped.slice(lastIndex, index)
    if (between.includes('<') || between.includes('>')) {
      return false
    }
    if (rootClosed && between.trim().length > 0) {
      return false
    }
    lastIndex = index + match[0].length
    matchedAny = true

    const isClosing = match[1] === '/'
    const tagName = match[2] ?? ''
    const isSelfClosing = match[4] === '/'

    if (rootClosed) {
      return false
    }

    if (isClosing) {
      if (isSelfClosing || stack.length === 0 || stack[stack.length - 1] !== tagName) {
        return false
      }
      stack.pop()
      if (stack.length === 0) {
        rootClosed = true
      }
      continue
    }

    if (stack.length === 0 && tagName.toLowerCase() !== 'svg') {
      return false
    }

    if (!isSelfClosing) {
      stack.push(tagName)
    } else if (stack.length === 0) {
      rootClosed = true
    }
  }

  const trailing = stripped.slice(lastIndex)
  if (trailing.includes('<') || trailing.includes('>') || trailing.trim().length > 0) {
    return false
  }

  return matchedAny && rootClosed && stack.length === 0
}

const inflightDataUrlCache = new Map<string, Promise<string>>()
const resolvedDataUrlCache = new Map<string, string>()

export interface FetchStoreSvgOptions {
  fetchSvgText?: (url: string) => Promise<string>
  fallbackFetchText?: (url: string) => Promise<string>
}

export function isRemoteSvgIconUrl(url: string | null | undefined): boolean {
  if (!url) return false
  const trimmed = url.trim()
  if (!trimmed) return false
  if (!/^(?:https?:\/\/|\/api\/)/i.test(trimmed)) return false

  const [path] = trimmed.split(/[?#]/, 1)
  return (path ?? '').toLowerCase().endsWith('.svg')
}

/**
 * Sanitizes untrusted remote SVG markup into inert vector paths suitable for `TxIcon`
 * mask or `data:image/svg+xml` rendering while preserving Nexus `/api/images/*` `#896`
 * `application/octet-stream` + `nosniff` attachment headers on the server.
 */
export function sanitizeStoreSvg(raw: string): string {
  const trimmed = raw.trim()
  const svgStart = trimmed.search(/<svg[\s>]/i)
  if (svgStart < 0 || !/<\/svg\s*>/i.test(trimmed)) {
    return ''
  }

  const slice = trimmed.slice(svgStart)
  const cleaned =
    typeof DOMParser === 'function' && typeof XMLSerializer === 'function'
      ? sanitizeSvgWithDomParser(slice)
      : sanitizeSvgWithStrictXmlAllowlist(slice)

  if (!cleaned || !/^<svg[\s>]/i.test(cleaned) || !/<\/svg\s*>$/i.test(cleaned)) {
    return ''
  }

  return isWellFormedSvgXml(cleaned) ? cleaned : ''
}

export function encodeStoreSvgDataUrl(svg: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg).replace(/'/g, '%27')}`
}

export function getCachedStoreSvgDataUrl(url: string | null | undefined): string | undefined {
  const key = url?.trim()
  if (!key) return undefined
  return resolvedDataUrlCache.get(key)
}

export function clearStoreSvgIconCache(): void {
  inflightDataUrlCache.clear()
  resolvedDataUrlCache.clear()
}

async function defaultFallbackFetchText(url: string): Promise<string> {
  if (!/^https?:\/\//i.test(url)) {
    return ''
  }

  const response = await storeHttpRequest<string>({
    url,
    method: 'GET',
    headers: { Accept: 'image/svg+xml, text/plain, */*' },
    responseType: 'text'
  })

  if (response.status < 200 || response.status >= 300) {
    return ''
  }

  return typeof response.data === 'string' ? response.data : ''
}

async function loadRawSvgText(url: string, options: FetchStoreSvgOptions): Promise<string> {
  const primaryFetch = options.fetchSvgText ?? fetchCoreAppSvgContent
  const fallbackFetch = options.fallbackFetchText ?? defaultFallbackFetchText

  try {
    const text = await primaryFetch(url)
    if (typeof text === 'string' && text.trim().length > 0) {
      return text
    }
  } catch {
    // Fall through to direct store HTTP text fetch.
  }

  try {
    const fallbackText = await fallbackFetch(url)
    return typeof fallbackText === 'string' ? fallbackText : ''
  } catch {
    return ''
  }
}

export async function fetchStoreSvgDataUrl(
  url: string,
  options: FetchStoreSvgOptions = {}
): Promise<string> {
  const normalizedUrl = url.trim()
  if (!normalizedUrl || !isRemoteSvgIconUrl(normalizedUrl)) {
    return ''
  }

  const cached = resolvedDataUrlCache.get(normalizedUrl)
  if (cached) {
    return cached
  }

  const existing = inflightDataUrlCache.get(normalizedUrl)
  if (existing) {
    return existing
  }

  const task = loadRawSvgText(normalizedUrl, options)
    .then((raw) => {
      const clean = sanitizeStoreSvg(raw)
      if (!clean) {
        return ''
      }
      const dataUrl = encodeStoreSvgDataUrl(clean)
      resolvedDataUrlCache.set(normalizedUrl, dataUrl)
      return dataUrl
    })
    .catch(() => '')
    .finally(() => {
      inflightDataUrlCache.delete(normalizedUrl)
    })

  inflightDataUrlCache.set(normalizedUrl, task)
  return task
}
