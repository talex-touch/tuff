#!/usr/bin/env node
/**
 * Post-deploy Cloudflare edge cache invalidation for Nexus & TuffEx docs using
 * Cloudflare's Prefix Purge API (`POST /zones/{zone_id}/purge_cache` with `prefixes[]`).
 *
 * Usage:
 *   node apps/nexus/scripts/purge-docs-edge-cache.mjs --dry-run
 *   CLOUDFLARE_ZONE_ID=... CLOUDFLARE_API_TOKEN=... node apps/nexus/scripts/purge-docs-edge-cache.mjs
 *   node apps/nexus/scripts/purge-docs-edge-cache.mjs --host tuff.tagzxia.com --prefix /en/docs --prefix /tuffex
 */
import process from 'node:process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const CLOUDFLARE_MAX_PREFIXES_PER_REQUEST = 30
export const DEFAULT_PURGE_HOST = 'tuff.tagzxia.com'
export const DEFAULT_DOCS_PURGE_PATHS = [
  '/en/docs',
  '/zh/docs',
  '/api/docs/page',
  '/api/docs/navigation',
  '/api/docs/search',
  '/api/content/policy',
  '/tuffex',
]

export function normalizePurgeHost(rawHost) {
  const value = String(rawHost ?? '').trim()
  if (!value)
    return DEFAULT_PURGE_HOST
  return value.replace(/^https?:\/\//i, '').replace(/\/+$/, '')
}

export function normalizePrefixPath(rawPath) {
  const trimmed = String(rawPath ?? '').trim()
  if (!trimmed)
    return ''
  const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`
  return withLeadingSlash.replace(/\/+$/, '') || '/'
}

/**
 * Builds Cloudflare `prefixes[]` entries (`host/path`, without scheme) deduplicated in order.
 */
export function buildDocsPurgePrefixes(host, paths = DEFAULT_DOCS_PURGE_PATHS) {
  const normalizedHost = normalizePurgeHost(host)
  const seen = new Set()
  const prefixes = []
  for (const rawPath of paths) {
    const normalizedPath = normalizePrefixPath(rawPath)
    if (!normalizedPath)
      continue
    const prefix = normalizedPath === '/' ? normalizedHost : `${normalizedHost}${normalizedPath}`
    if (!seen.has(prefix)) {
      seen.add(prefix)
      prefixes.push(prefix)
    }
  }
  return prefixes
}

export function chunkArray(items, chunkSize = CLOUDFLARE_MAX_PREFIXES_PER_REQUEST) {
  const chunks = []
  for (let index = 0; index < items.length; index += chunkSize)
    chunks.push(items.slice(index, index + chunkSize))
  return chunks
}

export function parseArgs(argv) {
  const parsed = {
    dryRun: false,
    host: undefined,
    zoneId: undefined,
    apiToken: undefined,
    prefixes: [],
  }

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (token === '--dry-run') {
      parsed.dryRun = true
      continue
    }
    if (!token.startsWith('--'))
      continue

    const [flag, inlineValue] = token.slice(2).split('=', 2)
    let value = inlineValue
    if (value === undefined) {
      const next = argv[index + 1]
      if (next && !next.startsWith('--')) {
        value = next
        index += 1
      }
    }

    if (flag === 'host' && value)
      parsed.host = value
    else if (flag === 'zone-id' && value)
      parsed.zoneId = value
    else if (flag === 'api-token' && value)
      parsed.apiToken = value
    else if (flag === 'prefix' && value)
      parsed.prefixes.push(value)
  }

  return parsed
}

export async function purgeDocsEdgeCache(options = {}) {
  const {
    dryRun = false,
    host = process.env.NEXUS_PURGE_HOST || process.env.NUXT_PUBLIC_SITE_URL || DEFAULT_PURGE_HOST,
    zoneId = process.env.CLOUDFLARE_ZONE_ID || '',
    apiToken = process.env.CLOUDFLARE_API_TOKEN || '',
    paths = DEFAULT_DOCS_PURGE_PATHS,
    fetchImpl = globalThis.fetch,
  } = options

  const prefixes = buildDocsPurgePrefixes(host, paths)
  if (!prefixes.length)
    throw new Error('[purge-docs-edge-cache] no prefixes resolved for purge')

  const batches = chunkArray(prefixes, CLOUDFLARE_MAX_PREFIXES_PER_REQUEST)
  const resolvedZoneId = zoneId || '<CLOUDFLARE_ZONE_ID>'
  const endpoint = `https://api.cloudflare.com/client/v4/zones/${resolvedZoneId}/purge_cache`

  if (dryRun) {
    return {
      dryRun: true,
      endpoint,
      prefixes,
      batches: batches.map(batch => ({ prefixes: batch })),
      purgedCount: 0,
    }
  }

  if (!zoneId)
    throw new Error('[purge-docs-edge-cache] CLOUDFLARE_ZONE_ID (or --zone-id) is required')
  if (!apiToken)
    throw new Error('[purge-docs-edge-cache] CLOUDFLARE_API_TOKEN (or --api-token) is required')
  if (typeof fetchImpl !== 'function')
    throw new Error('[purge-docs-edge-cache] global fetch is unavailable')

  const responses = []
  for (const batch of batches) {
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: {
        'authorization': `Bearer ${apiToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ prefixes: batch }),
    })

    const bodyText = await response.text()
    let payload = null
    try {
      payload = bodyText ? JSON.parse(bodyText) : null
    }
    catch {
      payload = null
    }

    if (!response.ok || payload?.success === false) {
      const errorDetails = payload?.errors?.map(err => `${err.code ?? 'ERR'}: ${err.message ?? JSON.stringify(err)}`).join('; ')
        || bodyText
        || `HTTP ${response.status}`
      throw new Error(`[purge-docs-edge-cache] Cloudflare purge failed (${response.status}): ${errorDetails}`)
    }

    responses.push(payload)
  }

  return {
    dryRun: false,
    endpoint,
    prefixes,
    batches: batches.map(batch => ({ prefixes: batch })),
    purgedCount: prefixes.length,
    responses,
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const result = await purgeDocsEdgeCache({
    dryRun: args.dryRun,
    host: args.host,
    zoneId: args.zoneId,
    apiToken: args.apiToken,
    paths: args.prefixes.length ? args.prefixes : DEFAULT_DOCS_PURGE_PATHS,
  })

  if (result.dryRun) {
    console.log(`[purge-docs-edge-cache] DRY RUN -> POST ${result.endpoint}`)
    for (const batch of result.batches)
      console.log(JSON.stringify(batch, null, 2))
    return
  }

  console.log(`[purge-docs-edge-cache] purged ${result.purgedCount} prefixes via ${result.endpoint}:`)
  for (const prefix of result.prefixes)
    console.log(`  - ${prefix}`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
}
