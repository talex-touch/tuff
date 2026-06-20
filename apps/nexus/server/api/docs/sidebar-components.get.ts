import { queryCollection } from '@nuxt/content/server'

type SyncStatusKey = 'not_started' | 'in_progress' | 'migrated' | 'verified'

interface SidebarComponentDoc {
  title: string
  path: string
  normalizedPath: string
  locale: 'en' | 'zh'
  category: string | null
  syncStatus: SyncStatusKey
  verified: boolean
}

const COMPONENT_DOC_PREFIX = '/docs/dev/components/'
const SIDEBAR_COMPONENTS_CACHE_CONTROL = 'public, max-age=300, stale-while-revalidate=3600'
const SIDEBAR_COMPONENTS_CACHE_MAX_AGE_SECONDS = 300
const SIDEBAR_COMPONENTS_CACHE_STALE_MAX_AGE_SECONDS = 3600
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

function resolveSidebarComponentsCacheKey(event: any) {
  const locale = normalizeLocale(getQuery(event).locale)
  return locale ? `locale:${locale}` : 'locale:all'
}

export default defineCachedEventHandler(async (event) => {
  const locale = normalizeLocale(getQuery(event).locale)
  const docs = await queryCollection(event, 'docs')
    .where('path', 'LIKE', buildComponentDocsPathPattern(locale))
    .all()

  const rows = docs
    .filter(item => typeof item?.path === 'string')
    .map<SidebarComponentDoc>((item) => {
      const record = item as unknown as Record<string, unknown>
      const meta = parseDocMeta(record.meta)
      const path = String(item.path)
      const verified = record.verified === true || meta?.verified === true

      return {
        title: item?.title ? String(item.title) : path,
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

  setHeader(event, 'cache-control', SIDEBAR_COMPONENTS_CACHE_CONTROL)

  return rows
}, {
  maxAge: SIDEBAR_COMPONENTS_CACHE_MAX_AGE_SECONDS,
  staleMaxAge: SIDEBAR_COMPONENTS_CACHE_STALE_MAX_AGE_SECONDS,
  name: 'docs-sidebar-components',
  getKey: resolveSidebarComponentsCacheKey,
})
