import { createError, getRouterParam, setResponseHeader } from 'h3'
import { requireAppAuth } from '../../../../../../../utils/auth'
import {
  readCatalogPayloadKeyIdentity,
} from '../../../../../../../utils/catalogArtifactProjection'
import {
  CatalogPayloadKeyConfigurationError,
  readCatalogPayloadKey,
} from '../../../../../../../utils/catalogPayloadKeys'

/**
 * Authenticated distribution of the AES key for one already-signed encrypted catalog payload.
 * The response is never cacheable and the key is never read from public object storage.
 */
export default defineEventHandler(async (event) => {
  await requireAppAuth(event)

  const identity = readCatalogPayloadKeyIdentity({
    type: getRouterParam(event, 'type'),
    packId: getRouterParam(event, 'packId'),
    version: getRouterParam(event, 'version'),
    keyId: getRouterParam(event, 'keyId'),
  })
  if (!identity) {
    throw createError({ statusCode: 404, statusMessage: 'Catalog payload key is not available.' })
  }

  let key
  try {
    key = readCatalogPayloadKey(event, identity)
  }
  catch (error) {
    if (error instanceof CatalogPayloadKeyConfigurationError) {
      throw createError({ statusCode: 503, statusMessage: 'Catalog payload key is unavailable.' })
    }
    throw error
  }
  if (!key) {
    throw createError({ statusCode: 404, statusMessage: 'Catalog payload key is not available.' })
  }

  setResponseHeader(event, 'Cache-Control', 'private, no-store')
  setResponseHeader(event, 'Pragma', 'no-cache')
  setResponseHeader(event, 'X-Content-Type-Options', 'nosniff')
  return key
})
