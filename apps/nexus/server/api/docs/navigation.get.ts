import type { H3Event } from 'h3'
import process from 'node:process'
import { queryCollection, queryCollectionNavigation } from '@nuxt/content/server'
import { cacheDocsContent } from '../../utils/docsContentCache'
import { isMissingDocsContentTableError } from '../../utils/docsContentError'
import { normalizeDocsPagePath } from '../../utils/docsPath'

const DEV_NAVIGATION_RETRY_ATTEMPTS = 3
const DEV_NAVIGATION_RETRY_DELAY_MS = 80
const NAVIGATION_COMPONENTS_SCOPE = 'components'
const COMPONENT_DOC_PREFIX = '/docs/dev/components/'
// The concepts handbook lives beside the component docs but is listed in the
// components sidebar's Concepts suite, so the scope carries both trees.
const NAVIGATION_COMPONENTS_SCOPE_ROOTS = ['/docs/dev/components', '/docs/dev/concepts']

type SyncStatusKey = 'not_started' | 'in_progress' | 'migrated' | 'verified'

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

interface ComponentNavMeta {
  category: string | null
  since: string | null
  syncStatus: SyncStatusKey
  verified: boolean
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

function resolveSince(recordValue: unknown, metaValue: unknown) {
  const value = recordValue ?? metaValue
  if (value === null || value === undefined)
    return null
  return String(value).trim() || null
}

function normalizeStatus(raw: unknown, verified: boolean): SyncStatusKey {
  if (verified)
    return 'verified'
  const value = typeof raw === 'string' ? raw.trim() : ''
  return STATUS_ALIASES[value] ?? 'not_started'
}

async function queryComponentNavMeta(
  event: H3Event,
  locale: 'en' | 'zh' | null,
): Promise<Map<string, ComponentNavMeta>> {
  const map = new Map<string, ComponentNavMeta>()
  if (typeof queryCollection !== 'function')
    return map

  try {
    const pattern = locale ? `${COMPONENT_DOC_PREFIX}%.${locale}` : `${COMPONENT_DOC_PREFIX}%`
    const docs = await queryCollection(event, 'docs')
      .where('path', 'LIKE', pattern)
      .all()

    for (const item of docs) {
      if (typeof item?.path !== 'string')
        continue
      const record = item as unknown as Record<string, unknown>
      const meta = parseDocMeta(record.meta)
      const verified = record.verified === true || meta?.verified === true
      map.set(item.path, {
        category: typeof record.category === 'string'
          ? record.category
          : typeof meta?.category === 'string'
            ? meta.category
            : null,
        since: resolveSince(record.since, meta?.since),
        syncStatus: normalizeStatus(record.syncStatus ?? meta?.syncStatus, verified),
        verified,
      })
    }
  }
  catch {
    // Component sidebar metadata enrichment is best-effort; DocsSidebar falls back to
    // `/api/docs/sidebar-components/:locale` if these fields are absent.
  }

  return map
}

function attachComponentNavMeta(items: unknown, metaByPath: Map<string, ComponentNavMeta>): unknown {
  if (!metaByPath.size || !Array.isArray(items))
    return items

  return items.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item))
      return item

    const record = item as Record<string, unknown>
    const path = typeof record.path === 'string' ? record.path : null
    const extra = path ? metaByPath.get(path) : undefined
    const children = Array.isArray(record.children)
      ? attachComponentNavMeta(record.children, metaByPath)
      : undefined

    if (!extra && children === undefined)
      return record

    return {
      ...record,
      ...(extra ?? {}),
      ...(children !== undefined ? { children } : {}),
    }
  })
}

function toPlainJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function normalizeLocale(value: unknown): 'en' | 'zh' | null {
  if (typeof value !== 'string')
    return null
  const normalized = value.trim().toLowerCase()
  if (normalized === 'en' || normalized === 'zh')
    return normalized
  return null
}

function resolvePathLocale(path: unknown): 'en' | 'zh' | null {
  if (typeof path !== 'string')
    return null
  if (path.endsWith('.zh'))
    return 'zh'
  if (path.endsWith('.en'))
    return 'en'
  return null
}

function filterNavigationByLocale(items: unknown, locale: 'en' | 'zh' | null): unknown {
  if (!locale || !Array.isArray(items))
    return items

  return items
    .map((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item))
        return item

      const record = item as Record<string, unknown>
      const pathLocale = resolvePathLocale(record.path)
      if (pathLocale && pathLocale !== locale)
        return null

      const children = filterNavigationByLocale(record.children, locale)
      return Array.isArray(children)
        ? { ...record, children }
        : record
    })
    .filter(Boolean)
}

function normalizeNavigationScope(value: unknown): typeof NAVIGATION_COMPONENTS_SCOPE | null {
  return value === NAVIGATION_COMPONENTS_SCOPE ? NAVIGATION_COMPONENTS_SCOPE : null
}

function resolveNavigationRequest(event: H3Event) {
  const query = getQuery(event)
  return {
    locale: normalizeLocale(event.context?.params?.locale ?? query.locale),
    scope: normalizeNavigationScope(event.context?.params?.scope ?? query.scope),
  }
}

function findNavigationNodeByPath(items: unknown, targetPath: string): Record<string, unknown> | null {
  if (!Array.isArray(items))
    return null

  const normalizedTarget = normalizeDocsPagePath(targetPath)
  for (const item of items) {
    if (!item || typeof item !== 'object' || Array.isArray(item))
      continue

    const record = item as Record<string, unknown>
    const path = typeof record.path === 'string' ? normalizeDocsPagePath(record.path) : null
    if (path === normalizedTarget)
      return record

    const found = findNavigationNodeByPath(record.children, normalizedTarget)
    if (found)
      return found
  }

  return null
}

function scopeNavigation(items: unknown, scope: typeof NAVIGATION_COMPONENTS_SCOPE | null): unknown {
  if (scope !== NAVIGATION_COMPONENTS_SCOPE)
    return items

  return NAVIGATION_COMPONENTS_SCOPE_ROOTS
    .map(root => findNavigationNodeByPath(items, root))
    .filter(Boolean)
}

async function queryDocsNavigation(event: H3Event) {
  const isProduction = process.env.NODE_ENV === 'production'
  const maxAttempts = isProduction ? 1 : DEV_NAVIGATION_RETRY_ATTEMPTS
  let lastError: unknown

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await queryCollectionNavigation(event, 'docs')
    }
    catch (error) {
      lastError = error
      if (isProduction || !isMissingDocsContentTableError(error) || attempt >= maxAttempts)
        break
      await sleep(DEV_NAVIGATION_RETRY_DELAY_MS)
    }
  }

  throw lastError
}

const resolveDocsNavigation = cacheDocsContent(async (
  event: H3Event,
  locale: 'en' | 'zh' | null,
  scope: typeof NAVIGATION_COMPONENTS_SCOPE | null,
) => {
  const navigation = await queryDocsNavigation(event)
  const localizedNavigation = filterNavigationByLocale(navigation, locale)
  const scopedNavigation = scopeNavigation(localizedNavigation, scope)
  const enrichedNavigation = scope === NAVIGATION_COMPONENTS_SCOPE
    ? attachComponentNavMeta(scopedNavigation, await queryComponentNavMeta(event, locale))
    : scopedNavigation

  return toPlainJson(Array.isArray(enrichedNavigation) ? enrichedNavigation : [])
}, {
  name: 'docs-navigation',
  getKey: (locale, scope) => `${locale ? `locale:${locale}` : 'locale:all'}:${scope ? `scope:${scope}` : 'scope:all'}`,
  // The whole docs tree is never legitimately empty.
  treatEmptyAsUnavailable: true,
})

export default defineEventHandler(async (event) => {
  const { locale, scope } = resolveNavigationRequest(event)

  return resolveDocsNavigation(event, locale, scope)
})
