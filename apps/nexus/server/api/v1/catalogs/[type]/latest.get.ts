import { createError, getRouterParam, send, setResponseHeader } from 'h3'
import {
  catalogArtifactManifestObjectKey,
  isCatalogArtifactType,
} from '../../../../utils/catalogArtifactProjection'
import { readCatalogArtifact } from '../../../../utils/catalogArtifactStorage'

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

  const artifact = await readCatalogArtifact(event, catalogArtifactManifestObjectKey(type))

  if (!artifact)
    throw createError({ statusCode: 404, statusMessage: 'Catalog manifest is not published.' })

  setResponseHeader(event, 'Content-Type', artifact.contentType)
  setResponseHeader(event, 'Content-Length', artifact.data.byteLength)
  setResponseHeader(event, 'X-Content-SHA256', artifact.sha256)
  setResponseHeader(event, 'Cache-Control', 'public, max-age=300, must-revalidate')

  return send(event, artifact.data)
})
