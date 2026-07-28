import type { DocsSearchResponse } from '#shared/types/content-api'
import type { H3Event } from 'h3'
import { queryCollection } from '@nuxt/content/server'
import { cacheDocsContent } from '../../utils/docsContentCache'

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

const resolveDocsSearch = cacheDocsContent(async (event: H3Event, locale: 'en' | 'zh' | null): Promise<DocsSearchResponse> => {
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

  return { items }
}, {
  name: 'docs-search',
  getKey: locale => `locale:${locale ?? 'all'}`,
  isEmpty: result => result.items.length === 0,
  // The searchable docs set is never legitimately empty.
  treatEmptyAsUnavailable: true,
})

export default defineEventHandler(async (event): Promise<DocsSearchResponse> => {
  return resolveDocsSearch(event, resolveSearchLocale(event))
})
