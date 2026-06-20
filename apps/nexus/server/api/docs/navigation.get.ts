import type { H3Event } from 'h3'
import { queryCollectionNavigation } from '@nuxt/content/server'
import { isMissingDocsContentTableError } from '../../utils/docsContentError'

const DEV_NAVIGATION_RETRY_ATTEMPTS = 3
const DEV_NAVIGATION_RETRY_DELAY_MS = 80
const NAVIGATION_CACHE_CONTROL = 'public, max-age=300, stale-while-revalidate=3600'

function toPlainJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
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

  if (!isProduction && isMissingDocsContentTableError(lastError)) {
    console.warn('[api/docs/navigation] Nuxt Content docs table is not ready; returning an empty navigation tree in development.', lastError)
    return []
  }

  throw lastError
}

export default defineEventHandler(async (event) => {
  const navigation = await queryDocsNavigation(event)

  setHeader(event, 'cache-control', NAVIGATION_CACHE_CONTROL)

  return toPlainJson(Array.isArray(navigation) ? navigation : [])
})
