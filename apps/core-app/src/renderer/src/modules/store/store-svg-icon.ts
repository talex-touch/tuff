import { fetchCoreAppSvgContent } from '~/modules/tuffex/icon-config'
import { storeHttpRequest } from './store-http-client'

const FORBIDDEN_SVG_PAIRED_ELEMENTS_RE =
  /<\s*(script|foreignObject|iframe|object|embed)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi
const FORBIDDEN_SVG_ELEMENTS_RE =
  /<\s*\/?\s*(?:script|foreignObject|iframe|object|embed|meta|link)\b[^>]*>/gi
const FORBIDDEN_SVG_EVENT_ATTRS_RE = /\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>/]+)/gi
const SVG_HREF_ATTRS_RE = /\s+(?:xlink:)?href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>/]+))/gi
const SAFE_SVG_FRAGMENT_RE = /^#[A-Za-z_][\w:.-]*$/

const XML_COMMENT_OR_DECL_RE = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[[\s\S]*?\]\]>/g
const XML_TAG_RE = /<(\/?)([A-Za-z_][\w:.-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g

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
  const cleaned = slice
    .replace(FORBIDDEN_SVG_PAIRED_ELEMENTS_RE, '')
    .replace(FORBIDDEN_SVG_ELEMENTS_RE, '')
    .replace(FORBIDDEN_SVG_EVENT_ATTRS_RE, '')
    .replace(
      SVG_HREF_ATTRS_RE,
      (match, doubleQuoted?: string, singleQuoted?: string, unquoted?: string) => {
        const value = (doubleQuoted ?? singleQuoted ?? unquoted ?? '').trim()
        return SAFE_SVG_FRAGMENT_RE.test(value) ? match : ''
      }
    )
    .replace(/javascript\s*:/gi, '')
    .trim()

  if (!/^<svg[\s>]/i.test(cleaned) || !/<\/svg\s*>$/i.test(cleaned)) {
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
