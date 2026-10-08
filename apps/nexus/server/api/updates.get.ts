import { createHash } from 'node:crypto'
import { getHeader, getQuery, setHeader, setResponseStatus } from 'h3'
import { listUpdates } from '../utils/dashboardStore'
import { openEdgeCache } from '../utils/edgeCache'

/**
 * How long a copy of the feed is served from the edge cache: a new announcement or release reaches
 * clients this much later, and every update check in between costs no D1 read.
 */
const UPDATES_EDGE_TTL_SECONDS = 120

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const scope = typeof query.scope === 'string' ? query.scope : 'web'
  const type = typeof query.type === 'string' ? query.type : undefined
  const channel = typeof query.channel === 'string' ? query.channel : undefined

  const edge = await openEdgeCache(event, { name: 'updates', params: { scope, type, channel } }, { conditional: true })
  if (edge?.hit)
    return edge.hit

  const updates = await listUpdates(event, {
    scope: scope as any,
    type: type as any,
    channel: channel as string | undefined,
  })

  let etag: string | null = null
  if (updates.length > 0) {
    const fingerprint = updates
      .map(update => `${update.id}:${update.updatedAt}:${update.payloadSha256 ?? ''}`)
      .join('|')
    etag = `"${createHash('sha256').update(fingerprint).digest('hex')}"`
  }

  if (edge) {
    return edge.store({
      body: JSON.stringify({ updates }),
      headers: {
        'content-type': 'application/json',
        ...(etag ? { etag } : {}),
      },
    }, UPDATES_EDGE_TTL_SECONDS)
  }

  if (etag) {
    const ifNoneMatch = getHeader(event, 'if-none-match')
    if (ifNoneMatch && ifNoneMatch === etag) {
      setResponseStatus(event, 304)
      return ''
    }
    setHeader(event, 'etag', etag)
  }

  return { updates }
})
