import { queryCollection } from '@nuxt/content/server'

type ComponentSyncStatus = 'not_started' | 'in_progress' | 'migrated' | 'verified'

interface ComponentSyncRow {
  title: string
  path: string
  syncStatus: ComponentSyncStatus
  verified: boolean
  locale: 'en' | 'zh'
}

const COMPONENT_DOC_PREFIX = '/docs/dev/components/'
const STATUS_ALIASES: Record<string, ComponentSyncStatus> = {
  未迁移: 'not_started',
  迁移中: 'in_progress',
  已迁移: 'migrated',
  已确认: 'verified',
  not_started: 'not_started',
  in_progress: 'in_progress',
  migrated: 'migrated',
  verified: 'verified',
}

function resolveDocLocale(path: string): 'en' | 'zh' {
  return path.endsWith('.zh') ? 'zh' : 'en'
}

function normalizeStatus(raw: unknown, verified: boolean): ComponentSyncStatus {
  if (verified)
    return 'verified'

  const value = typeof raw === 'string' ? raw.trim() : ''
  return STATUS_ALIASES[value] ?? 'not_started'
}

function isComponentIndex(path: string) {
  return path.endsWith('/index.zh') || path.endsWith('/index.en')
}

export default defineEventHandler(async (event) => {
  const docs = await queryCollection(event, 'docs')
    .where('path', 'LIKE', `${COMPONENT_DOC_PREFIX}%`)
    .all()

  const rows = docs
    .filter(item => typeof item?.path === 'string')
    .filter(item => !isComponentIndex(item.path))
    .map<ComponentSyncRow>((item) => {
      const record = item as unknown as Record<string, unknown>
      const path = String(item.path)
      const verified = record.verified === true

      return {
        title: item?.title ? String(item.title) : path,
        path,
        syncStatus: normalizeStatus(record.syncStatus, verified),
        verified,
        locale: resolveDocLocale(path),
      }
    })
    .sort((a, b) => a.title.localeCompare(b.title, a.locale === 'zh' ? 'zh-CN' : 'en'))

  setHeader(event, 'cache-control', 'public, max-age=300, stale-while-revalidate=3600')

  return rows
})
