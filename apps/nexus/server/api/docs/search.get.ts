import { queryCollection } from '@nuxt/content/server'
import type { DocsSearchResponse } from '#shared/types/content-api'

const DOCS_SEARCH_CACHE_CONTROL = 'public, max-age=300, stale-while-revalidate=3600'
const DOCS_SEARCH_CACHE_MAX_AGE_SECONDS = 300
const DOCS_SEARCH_CACHE_STALE_MAX_AGE_SECONDS = 3600

function normalizeLocale(value: unknown): 'en' | 'zh' | null {
  return value === 'en' || value === 'zh' ? value : null
}

function resolveSearchLocale(event: any) {
  return normalizeLocale(event?.context?.params?.locale ?? getQuery(event).locale)
}

function buildDocsSearchPathPattern(locale: 'en' | 'zh' | null) {
  return locale ? `/docs/%.${locale}` : '/docs/%'
}

function normalizePath(path: string) {
  return path.replace(/\.(en|zh)$/, '')
}

function resolveLocale(path: string): 'en' | 'zh' {
  return path.endsWith('.zh') ? 'zh' : 'en'
}

function parseDocMeta(meta: unknown): Record<string, unknown> | null {
  if (!meta)
    return null
  if (typeof meta === 'string') {
    try {
      return JSON.parse(meta) as Record<string, unknown>
    }
    catch {
      return null
    }
  }
  if (typeof meta === 'object' && !Array.isArray(meta))
    return meta as Record<string, unknown>
  return null
}

function resolveString(recordValue: unknown, metaValue: unknown) {
  if (typeof recordValue === 'string' && recordValue.trim())
    return recordValue
  return typeof metaValue === 'string' ? metaValue : ''
}

function resolveTags(meta: Record<string, unknown> | null) {
  if (!Array.isArray(meta?.tags))
    return []
  return meta.tags.filter((item): item is string => typeof item === 'string' && Boolean(item.trim()))
}

export default defineCachedEventHandler(async (event): Promise<DocsSearchResponse> => {
  const locale = resolveSearchLocale(event)
  const docs = await queryCollection(event, 'docs')
    .where('path', 'LIKE', buildDocsSearchPathPattern(locale))
    .select('path', 'title', 'description', 'meta')
    .all()

  const items = docs
    .filter(item => typeof item.path === 'string')
    .map((item) => {
      const record = item as unknown as Record<string, unknown>
      const rawPath = String(item.path)
      const meta = parseDocMeta(record.meta)
      const path = normalizePath(rawPath)
      return {
        id: rawPath,
        path,
        locale: resolveLocale(rawPath),
        title: resolveString(record.title, meta?.title) || path,
        description: resolveString(record.description, meta?.description),
        tags: resolveTags(meta),
      }
    })
    .filter(item => !locale || item.locale === locale)
    .sort((a, b) => a.title.localeCompare(b.title, a.locale === 'zh' ? 'zh-CN' : 'en'))

  setHeader(event, 'cache-control', DOCS_SEARCH_CACHE_CONTROL)
  return { items }
}, {
  maxAge: DOCS_SEARCH_CACHE_MAX_AGE_SECONDS,
  staleMaxAge: DOCS_SEARCH_CACHE_STALE_MAX_AGE_SECONDS,
  name: 'docs-search',
  getKey: event => `locale:${resolveSearchLocale(event) ?? 'all'}`,
})
