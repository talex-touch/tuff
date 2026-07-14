import { queryCollection } from '@nuxt/content/server'
import type { PolicyContentDocument, PolicyContentResponse } from '#shared/types/content-api'

const POLICY_CACHE_CONTROL = 'public, max-age=300, stale-while-revalidate=3600'
const POLICY_CACHE_MAX_AGE_SECONDS = 300
const POLICY_CACHE_STALE_MAX_AGE_SECONDS = 3600
const POLICY_NAME_PATTERN = /^[a-z0-9-]{1,80}$/

function normalizeLocale(value: unknown): 'en' | 'zh' {
  return typeof value === 'string' && value.trim().toLowerCase() === 'zh' ? 'zh' : 'en'
}

function normalizePolicyName(value: unknown) {
  if (typeof value !== 'string')
    return ''
  const normalized = value.trim().toLowerCase()
  return POLICY_NAME_PATTERN.test(normalized) ? normalized : ''
}

function resolvePolicyCacheKey(event: any) {
  const query = getQuery(event)
  return `${normalizePolicyName(query.name) || 'invalid'}:${normalizeLocale(query.locale)}`
}

export default defineCachedEventHandler(async (event): Promise<PolicyContentResponse> => {
  const query = getQuery(event)
  const name = normalizePolicyName(query.name)
  const locale = normalizeLocale(query.locale)

  if (!name)
    throw createError({ statusCode: 400, statusMessage: 'Invalid policy name.' })

  const collection = queryCollection(event, 'app')
  const localizedDoc = await collection.path(`/app/${name}.${locale}`).first()
  const doc = localizedDoc ?? await queryCollection(event, 'app').path(`/app/${name}`).first()

  setHeader(event, 'cache-control', POLICY_CACHE_CONTROL)

  return { doc: doc as PolicyContentDocument | null }
}, {
  maxAge: POLICY_CACHE_MAX_AGE_SECONDS,
  staleMaxAge: POLICY_CACHE_STALE_MAX_AGE_SECONDS,
  name: 'content-policy',
  getKey: resolvePolicyCacheKey,
})
