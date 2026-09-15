import { createError, getRouterParam, send, setResponseHeader } from 'h3'
import {
  catalogArtifactPayloadObjectKey,
  parseCatalogArtifactPayloadFilename,
  readCatalogArtifactIdentity,
} from '../../../../../../utils/catalogArtifactProjection'
import { readCatalogArtifact } from '../../../../../../utils/catalogArtifactStorage'

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

  const artifact = await readCatalogArtifact(event, catalogArtifactPayloadObjectKey(identity))

  if (!artifact)
    throw createError({ statusCode: 404, statusMessage: 'Catalog artifact is not published.' })

  setResponseHeader(event, 'Content-Type', artifact.contentType)
  setResponseHeader(event, 'Content-Length', artifact.data.byteLength)
  setResponseHeader(event, 'X-Content-SHA256', artifact.sha256)
  setResponseHeader(event, 'Cache-Control', 'public, max-age=31536000, immutable')

  return send(event, artifact.data)
})
