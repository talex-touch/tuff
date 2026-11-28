import { createError, getRouterParam, send, setResponseHeader } from 'h3'
import {
  catalogArtifactPayloadObjectKey,
  parseCatalogArtifactPayloadFilename,
  readCatalogArtifactIdentity,
} from '../../../../../../utils/catalogArtifactProjection'
import { readCatalogArtifact } from '../../../../../../utils/catalogArtifactStorage'
import { openEdgeCache } from '../../../../../../utils/edgeCache'

/**
 * How long a copy is served from the edge cache. The bytes are addressed by their digest, so a copy
 * cannot go stale; the identity check against the static projection still runs on every request, so
 * a payload a deploy unpublished stops being served at once.
 */
const CATALOG_PAYLOAD_EDGE_TTL_SECONDS = 24 * 60 * 60

/**
 * `GET /api/v1/catalogs/:type/:packId/:version/:sha256.json`
 *
 * Content-addressed read. The route identity is validated against the static projection and
 * the stored object is returned byte-for-byte; the pack is never parsed, and a payload that
 * is not valid JSON must still round-trip unchanged — the client owns decoding and the
 * signature check.
 *
 * The final segment carries `<sha256>.json` as one piece, so the suffix and the digest shape
 * are validated in `parseCatalogArtifactPayloadFilename` rather than by the router.
 */
export default defineEventHandler(async (event) => {
  const sha256 = parseCatalogArtifactPayloadFilename(getRouterParam(event, 'filename'))
  const identity = readCatalogArtifactIdentity({
    type: getRouterParam(event, 'type'),
    packId: getRouterParam(event, 'packId'),
    version: getRouterParam(event, 'version'),
    sha256,
  })

  if (!identity)
    throw createError({ statusCode: 404, statusMessage: 'Catalog artifact is not published.' })

  const objectKey = catalogArtifactPayloadObjectKey(identity)
  const edge = await openEdgeCache(event, { name: 'catalogs/payload', params: { key: objectKey } })
  if (edge?.hit)
    return edge.hit

  const artifact = await readCatalogArtifact(event, objectKey)

  if (!artifact)
    throw createError({ statusCode: 404, statusMessage: 'Catalog artifact is not published.' })
  if (artifact.sha256 !== identity.sha256)
    throw createError({ statusCode: 404, statusMessage: 'Catalog artifact is not published.' })

  if (edge) {
    return edge.store({
      body: artifact.data,
      headers: {
        'Content-Type': artifact.contentType,
        'Content-Length': String(artifact.data.byteLength),
        'X-Content-SHA256': artifact.sha256,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    }, CATALOG_PAYLOAD_EDGE_TTL_SECONDS)
  }

  setResponseHeader(event, 'Content-Type', artifact.contentType)
  setResponseHeader(event, 'Content-Length', artifact.data.byteLength)
  setResponseHeader(event, 'X-Content-SHA256', artifact.sha256)
  setResponseHeader(event, 'Cache-Control', 'public, max-age=31536000, immutable')

  return send(event, artifact.data)
})
