import { createError, getRouterParam, send, setResponseHeader } from 'h3'
import {
  catalogArtifactManifestObjectKey,
  isCatalogArtifactType,
} from '../../../../utils/catalogArtifactProjection'
import { readCatalogArtifact } from '../../../../utils/catalogArtifactStorage'
import { openEdgeCache } from '../../../../utils/edgeCache'

/**
 * How long a copy of the manifest is served from the edge cache: a newly published manifest reaches
 * clients this much later. Clients already hold it for five minutes (`max-age=300`).
 */
const CATALOG_MANIFEST_EDGE_TTL_SECONDS = 60

/**
 * `GET /api/v1/catalogs/:type/latest`
 *
 * Serves the manifest bytes exactly as the build step signed and stored them. The route does
 * not parse, sign, or rewrite the manifest: re-deriving any of it here would create a second
 * source of truth beside the bytes the client already pins by RSA signature and digest.
 */
export default defineEventHandler(async (event) => {
  const type = getRouterParam(event, 'type')

  if (!isCatalogArtifactType(type))
    throw createError({ statusCode: 404, statusMessage: 'Catalog manifest is not published.' })

  const objectKey = catalogArtifactManifestObjectKey(type)
  const edge = await openEdgeCache(event, { name: 'catalogs/manifest', params: { key: objectKey } })
  if (edge?.hit)
    return edge.hit

  const artifact = await readCatalogArtifact(event, objectKey)

  if (!artifact)
    throw createError({ statusCode: 404, statusMessage: 'Catalog manifest is not published.' })

  if (edge) {
    return edge.store({
      body: artifact.data,
      headers: {
        'Content-Type': artifact.contentType,
        'Content-Length': String(artifact.data.byteLength),
        'X-Content-SHA256': artifact.sha256,
        'Cache-Control': 'public, max-age=300, must-revalidate',
      },
    }, CATALOG_MANIFEST_EDGE_TTL_SECONDS)
  }

  setResponseHeader(event, 'Content-Type', artifact.contentType)
  setResponseHeader(event, 'Content-Length', artifact.data.byteLength)
  setResponseHeader(event, 'X-Content-SHA256', artifact.sha256)
  setResponseHeader(event, 'Cache-Control', 'public, max-age=300, must-revalidate')

  return send(event, artifact.data)
})
