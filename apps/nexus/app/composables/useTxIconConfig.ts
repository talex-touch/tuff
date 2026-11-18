import type { TxIconConfig } from '@talex-touch/tuffex/icon'
import { hasWindow } from '@talex-touch/utils/env'
import { TX_ICON_CONFIG_KEY } from '@talex-touch/tuffex/icon'
import { provide } from 'vue'

const svgCache = new Map<string, Promise<string>>()
const resolvedDataUrlCache = new Map<string, string>()

const FORBIDDEN_SVG_ELEMENTS_RE = /<\s*\/?\s*(?:script|foreignObject|iframe|object|embed|meta|link)\b[^>]*>/gi
const FORBIDDEN_SVG_ATTRS_RE = /\s+(?:on[a-z]+|(?:xlink:)?href)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi

/**
 * Sanitizes untrusted SVG markup into inert vector paths suitable for `TxIcon`
 * mask or `data:image/svg+xml` rendering while preserving `/api/images/*` `#896`
 * attachment headers on the server.
 */
export function sanitizePluginSvg(raw: string): string {
  const trimmed = raw.trim()
  const svgStart = trimmed.search(/<svg[\s>]/i)
  if (svgStart < 0 || !/<\/svg\s*>/i.test(trimmed))
    return ''

  const slice = trimmed.slice(svgStart)
  const cleaned = slice
    .replace(FORBIDDEN_SVG_ELEMENTS_RE, '')
    .replace(FORBIDDEN_SVG_ATTRS_RE, '')
    .replace(/javascript\s*:/gi, '')

  return /^<svg[\s>]/i.test(cleaned) ? cleaned : ''
}

export function isApiSvgIconUrl(url: string | null | undefined): boolean {
  if (!url)
    return false
  const clean = url.trim().split(/[?#]/, 1)[0]?.toLowerCase() ?? ''
  return clean.endsWith('.svg')
}

type FetchSvgText = (
  url: string,
  options: { responseType: 'text', credentials?: 'same-origin' },
) => Promise<string>

export async function fetchSanitizedSvg(url: string): Promise<string> {
  if (import.meta.server || !hasWindow() || !url)
    return ''

  const existing = svgCache.get(url)
  if (existing)
    return existing

  const requestText = $fetch as unknown as FetchSvgText
  const task = requestText(url, { responseType: 'text', credentials: 'same-origin' })
    .then((text) => {
      const clean = sanitizePluginSvg(typeof text === 'string' ? text : '')
      if (clean) {
        resolvedDataUrlCache.set(
          url,
          `data:image/svg+xml;utf8,${encodeURIComponent(clean).replace(/'/g, '%27')}`,
        )
      }
      return clean
    })
    .catch(() => '')
    .then((clean) => {
      if (!clean)
        svgCache.delete(url)
      return clean
    })

  svgCache.set(url, task)
  return task
}

export function getCachedSvgDataUrl(url: string): string | undefined {
  return resolvedDataUrlCache.get(url)
}

export function createNexusTxIconConfig(): TxIconConfig {
  return {
    svgFetcher: fetchSanitizedSvg,
    urlResolver(rawUrl, type) {
      if (type === 'url' && isApiSvgIconUrl(rawUrl)) {
        const cached = resolvedDataUrlCache.get(rawUrl)
        if (cached)
          return cached
      }
      return rawUrl
    },
  }
}

export function useProvideTxIconConfig() {
  provide(TX_ICON_CONFIG_KEY, createNexusTxIconConfig())
}
