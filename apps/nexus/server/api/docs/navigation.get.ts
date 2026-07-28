import type { H3Event } from 'h3'
import process from 'node:process'
import { queryCollectionNavigation } from '@nuxt/content/server'
import { cacheDocsContent } from '../../utils/docsContentCache'
import { isMissingDocsContentTableError } from '../../utils/docsContentError'
import { normalizeDocsPagePath } from '../../utils/docsPath'

const DEV_NAVIGATION_RETRY_ATTEMPTS = 3
const DEV_NAVIGATION_RETRY_DELAY_MS = 80
const NAVIGATION_COMPONENTS_SCOPE = 'components'

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

  const components = findNavigationNodeByPath(items, '/docs/dev/components')
  return components ? [components] : []
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

  return toPlainJson(Array.isArray(scopedNavigation) ? scopedNavigation : [])
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
