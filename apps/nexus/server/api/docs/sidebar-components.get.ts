import type { SidebarComponentItem } from '#shared/types/content-api'
import type { H3Event } from 'h3'
import { queryCollection } from '@nuxt/content/server'
import { cacheDocsContent } from '../../utils/docsContentCache'

type SyncStatusKey = 'not_started' | 'in_progress' | 'migrated' | 'verified'

const COMPONENT_DOC_PREFIX = '/docs/dev/components/'
const STATUS_ALIASES: Record<string, SyncStatusKey> = {
  未迁移: 'not_started',
  迁移中: 'in_progress',
  已迁移: 'migrated',
  已确认: 'verified',
  not_started: 'not_started',
  in_progress: 'in_progress',
  migrated: 'migrated',
  verified: 'verified',
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

function resolveTags(recordValue: unknown, metaValue: unknown) {
  const value = Array.isArray(recordValue) ? recordValue : metaValue
  if (!Array.isArray(value))
    return []
  return value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim()))
}

function buildComponentDocsPathPattern(locale: 'en' | 'zh' | null) {
  return locale
    ? `${COMPONENT_DOC_PREFIX}%.${locale}`
    : `${COMPONENT_DOC_PREFIX}%`
}

function normalizeStatus(raw: unknown, verified: boolean): SyncStatusKey {
  if (verified)
    return 'verified'
  const value = typeof raw === 'string' ? raw.trim() : ''
  return STATUS_ALIASES[value] ?? 'not_started'
}

function normalizePath(path: string) {
  const fullPath = path.startsWith('/') ? path : `/${path}`
  return fullPath
    .replace(/^\/(en|zh)(?=\/|$)/, '')
    .replace(/\.(en|zh)$/, '') || '/'
}

function resolveLocale(path: string): 'en' | 'zh' {
  return path.endsWith('.zh') ? 'zh' : 'en'
}

function normalizeLocale(value: unknown): 'en' | 'zh' | null {
  if (typeof value !== 'string')
    return null
  const normalized = value.trim().toLowerCase()
  if (normalized === 'en' || normalized === 'zh')
    return normalized
  return null
}

function resolveSidebarComponentsLocale(event: any) {
  return normalizeLocale(event?.context?.params?.locale ?? getQuery(event).locale)
}

const resolveSidebarComponents = cacheDocsContent(async (event: H3Event, locale: 'en' | 'zh' | null) => {
  const docs = await queryCollection(event, 'docs')
    .where('path', 'LIKE', buildComponentDocsPathPattern(locale))
    .all()

  const rows = docs
    .filter(item => typeof item?.path === 'string')
    .map<SidebarComponentItem>((item) => {
      const record = item as unknown as Record<string, unknown>
      const meta = parseDocMeta(record.meta)
      const path = String(item.path)
      const verified = record.verified === true || meta?.verified === true

      return {
        title: item?.title ? String(item.title) : path,
        description: resolveString(record.description, meta?.description),
        tags: resolveTags(record.tags, meta?.tags),
        path,
        normalizedPath: normalizePath(path),
        locale: resolveLocale(path),
        category: typeof record.category === 'string'
          ? record.category
          : typeof meta?.category === 'string'
            ? meta.category
            : null,
        syncStatus: normalizeStatus(record.syncStatus ?? meta?.syncStatus, verified),
        verified,
      }
    })
    .filter(item => !locale || item.locale === locale)
    .sort((a, b) => a.title.localeCompare(b.title, a.locale === 'zh' ? 'zh-CN' : 'en'))

  return rows
}, {
  name: 'docs-sidebar-components',
  getKey: locale => locale ? `locale:${locale}` : 'locale:all',
  // The component docs collection is never legitimately empty.
  treatEmptyAsUnavailable: true,
})

export default defineEventHandler(async (event) => {
  return resolveSidebarComponents(event, resolveSidebarComponentsLocale(event))
})
