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

export default defineEventHandler(async (event) => {
  const docs = await queryCollection(event, 'docs')
    .where('path', 'LIKE', `${COMPONENT_DOC_PREFIX}%`)
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
    .sort((a, b) => a.title.localeCompare(b.title, a.locale === 'zh' ? 'zh-CN' : 'en'))

  setHeader(event, 'cache-control', 'public, max-age=300, stale-while-revalidate=3600')

  return rows
})
