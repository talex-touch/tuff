import type { ReleaseChannel, ReleaseStatus } from '../../utils/releasesStore'
import { createError, getQuery } from 'h3'
import { openEdgeCache } from '../../utils/edgeCache'
import { attachSignatureUrls, getReleaseMetadataEdgeTtlSeconds } from '../../utils/releaseSignature'
import { listReleases } from '../../utils/releasesStore'

const MAX_PAGE_SIZE = 50
const DEFAULT_PAGE_SIZE = 20
const RELEASE_CHANNELS = new Set<ReleaseChannel>(['RELEASE', 'BETA', 'SNAPSHOT'])
const RELEASE_STATUSES = new Set<ReleaseStatus>(['draft', 'published', 'archived'])

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const channel = parseChannel(query.channel)
  const status = parseStatus(query.status)
  const includeAssets = query.assets === 'true' || query.assets === '1'
  const assetMode = query.assets === 'featured' ? 'featured' : includeAssets ? 'all' : 'none'
  const paginationRequested = query.limit !== undefined || query.cursor !== undefined
  const limit = paginationRequested ? parseLimit(query.limit) : undefined
  const offset = paginationRequested ? parseCursor(query.cursor) : 0
  const edge = query.assets === undefined || typeof query.assets === 'string'
    ? await openEdgeCache(event, {
        name: 'releases',
        params: { channel, status, assets: assetMode, limit, offset },
      })
    : null

  if (edge?.hit)
    return edge.hit

  const releases = await listReleases(event, {
    channel,
    status,
    includeAssets: assetMode !== 'none',
    ...(assetMode === 'featured' ? { assetMode: 'featured' as const } : {}),
    ...(limit === undefined ? {} : { limit: limit + 1, offset }),
  })
  const hasMore = limit !== undefined && releases.length > limit
  const page = limit === undefined ? releases : releases.slice(0, limit)
  const body = {
    releases: page.map(release => attachSignatureUrls(release, event)),
    pageInfo: {
      hasMore,
      nextCursor: hasMore ? encodeCursor(offset + limit) : null,
    },
  }

  if (edge) {
    return edge.store(
      { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } },
      getReleaseMetadataEdgeTtlSeconds(body.releases),
    )
  }

  return body
})

function parseChannel(value: unknown): ReleaseChannel | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'string' || !RELEASE_CHANNELS.has(value as ReleaseChannel)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid release channel.' })
  }
  return value as ReleaseChannel
}

function parseStatus(value: unknown): ReleaseStatus {
  if (value === undefined) return 'published'
  if (typeof value !== 'string' || !RELEASE_STATUSES.has(value as ReleaseStatus)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid release status.' })
  }
  return value as ReleaseStatus
}

function parseLimit(value: unknown): number {
  if (value === undefined) return DEFAULT_PAGE_SIZE
  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid release page limit.' })
  }
  const limit = Number.parseInt(value, 10)
  if (limit < 1 || limit > MAX_PAGE_SIZE) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid release page limit.' })
  }
  return limit
}

function parseCursor(value: unknown): number {
  if (value === undefined) return 0
  if (typeof value !== 'string' || !value) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid release cursor.' })
  }
  try {
    const parsed = JSON.parse(atob(value)) as { offset?: unknown }
    if (!Number.isInteger(parsed.offset) || Number(parsed.offset) < 0) {
      throw new Error('invalid offset')
    }
    return Number(parsed.offset)
  }
  catch {
    throw createError({ statusCode: 400, statusMessage: 'Invalid release cursor.' })
  }
}

function encodeCursor(offset: number): string {
  return btoa(JSON.stringify({ offset }))
}
