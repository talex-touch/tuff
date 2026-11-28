import { createError, getHeader, setHeader, setResponseStatus } from 'h3'
import { getUpdateById } from '../../../utils/dashboardStore'
import { openEdgeCache } from '../../../utils/edgeCache'
import { requireUpdateAsset } from '../../../utils/updateAssetStorage'

/**
 * How long a copy of a payload is served from the edge cache: the same five minutes clients already
 * keep it (`max-age=300`), so a replaced or withdrawn payload is seen no later than it was.
 */
const UPDATE_PAYLOAD_EDGE_TTL_SECONDS = 300

export default defineEventHandler(async (event) => {
  const id = event.context.params?.id

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Update id is required.' })
  }

  const edge = await openEdgeCache(event, { name: 'updates/payload', params: { id } }, { conditional: true })
  if (edge?.hit)
    return edge.hit

  const update = await getUpdateById(event, id)

  if (!update || !update.payloadKey) {
    throw createError({ statusCode: 404, statusMessage: 'Update payload not found.' })
  }

  const etag = update.payloadSha256 ? `"${update.payloadSha256}"` : null
  if (etag) {
    const ifNoneMatch = getHeader(event, 'if-none-match')
    if (ifNoneMatch && ifNoneMatch === etag) {
      setResponseStatus(event, 304)
      return ''
    }
    if (!edge) {
      setHeader(event, 'etag', etag)
      setHeader(event, 'x-content-sha256', update.payloadSha256 ?? '')
    }
  }

  const asset = await requireUpdateAsset(event, update.payloadKey)
  const contentType = update.payloadContentType || asset.contentType

  if (edge) {
    return edge.store({
      body: asset.data,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=300',
        'Content-Length': String(asset.data.byteLength),
        ...(etag ? { 'etag': etag, 'x-content-sha256': update.payloadSha256 ?? '' } : {}),
      },
    }, UPDATE_PAYLOAD_EDGE_TTL_SECONDS)
  }

  setHeader(event, 'Content-Type', contentType)
  setHeader(event, 'Cache-Control', 'public, max-age=300')
  setHeader(event, 'Content-Length', asset.data.byteLength)

  return asset.data
})
