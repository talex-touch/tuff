import type { H3Event } from 'h3'
import { queryCollectionNavigation } from '@nuxt/content/server'

const DEV_NAVIGATION_RETRY_ATTEMPTS = 3
const DEV_NAVIGATION_RETRY_DELAY_MS = 80
const NAVIGATION_CACHE_CONTROL = 'public, max-age=300, stale-while-revalidate=3600'

function toPlainJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function includesMissingDocsTableMessage(value: string) {
  const normalized = value.toLowerCase()
  return normalized.includes('no such table') && normalized.includes('_content_docs')
}

function readObjectValue(record: Record<string, unknown>, key: string) {
  try {
    return record[key]
  }
  catch {
    return undefined
  }
}

function isMissingDocsContentTableError(error: unknown, seen = new Set<unknown>()): boolean {
  if (!error)
    return false

  if (typeof error === 'string')
    return includesMissingDocsTableMessage(error)

  if (error instanceof Error) {
    if (includesMissingDocsTableMessage(`${error.message}\n${error.stack ?? ''}`))
      return true
  }

  if (typeof error !== 'object')
    return false

  if (seen.has(error))
    return false
  seen.add(error)

  const record = error as Record<string, unknown>
  const values = [
    readObjectValue(record, 'message'),
    readObjectValue(record, 'stack'),
    readObjectValue(record, 'statusMessage'),
    readObjectValue(record, 'statusText'),
    readObjectValue(record, 'data'),
    readObjectValue(record, 'cause'),
    readObjectValue(record, 'response'),
  ]

  for (const value of values) {
    if (isMissingDocsContentTableError(value, seen))
      return true
  }

  const response = readObjectValue(record, 'response')
  if (response && typeof response === 'object')
    return isMissingDocsContentTableError(readObjectValue(response as Record<string, unknown>, '_data'), seen)

  return false
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
