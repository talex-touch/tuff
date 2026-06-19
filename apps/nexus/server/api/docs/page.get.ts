import { queryCollection } from '@nuxt/content/server'
import { normalizeDocsPagePath } from '../../utils/docsPath'

function normalizeLocale(value: unknown): 'en' | 'zh' {
  if (typeof value !== 'string')
    return 'en'
  const normalized = value.trim().toLowerCase()
  return normalized === 'zh' ? 'zh' : 'en'
}

function toPlainJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function shouldIncludeBody(value: unknown) {
  if (typeof value !== 'string')
    return true
  const normalized = value.trim().toLowerCase()
  return !['0', 'false', 'no', 'off'].includes(normalized)
}

function serializeDoc<T extends { body?: unknown } | null>(doc: T, includeBody: boolean) {
  if (!doc || includeBody)
    return toPlainJson(doc)

  const { body: _body, ...metadata } = toPlainJson(doc)
  return toPlainJson(metadata)
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const docPath = normalizeDocsPagePath(typeof query.path === 'string' ? query.path : '/docs')
  const locale = normalizeLocale(query.locale)
  const includeBody = shouldIncludeBody(query.body)

  const localizedPath = `${docPath}.${locale}`
  const baseDocPath = docPath.replace(/\/index$/, '')
  const localizedIndexPath = `${baseDocPath}/index.${locale}`
  const indexPath = `${baseDocPath}/index`
  const shouldTryIndex = !docPath.endsWith('/index')

  const localizedDoc = await queryCollection(event, 'docs').path(localizedPath).first()
  if (localizedDoc) {
    setHeader(event, 'cache-control', 'public, max-age=300, stale-while-revalidate=3600')
    return serializeDoc(localizedDoc, includeBody)
  }

  if (shouldTryIndex) {
    const localizedIndexDoc = await queryCollection(event, 'docs').path(localizedIndexPath).first()
    if (localizedIndexDoc) {
      setHeader(event, 'cache-control', 'public, max-age=300, stale-while-revalidate=3600')
      return serializeDoc(localizedIndexDoc, includeBody)
    }
  }

  const baseDoc = await queryCollection(event, 'docs').path(docPath).first()
  if (baseDoc) {
    setHeader(event, 'cache-control', 'public, max-age=300, stale-while-revalidate=3600')
    return serializeDoc(baseDoc, includeBody)
  }

  const fallbackDoc = shouldTryIndex
    ? await queryCollection(event, 'docs').path(indexPath).first()
    : null

  setHeader(event, 'cache-control', 'public, max-age=300, stale-while-revalidate=3600')

  return fallbackDoc ? serializeDoc(fallbackDoc, includeBody) : null
})
