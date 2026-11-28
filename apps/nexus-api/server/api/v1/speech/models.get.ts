import { createError, send, setResponseHeader } from 'h3'
import { requireAuth } from '../../../utils/auth'
import { openEdgeCache } from '../../../utils/edgeCache'
import {
  readSpeechCatalog,
  SPEECH_CATALOG_CACHE_MS,
  SPEECH_MODEL_CATALOG_SOURCE,
  SpeechCatalogUnavailableError,
} from '../../../utils/speechCatalogStore'

/**
 * `GET /api/v1/speech/models`
 *
 * The catalog of installable on-device speech models, for clients that run one locally.
 *
 * Bytes are returned exactly as they were projected and hashed, with the digest in a header,
 * so a client can pin what it read. The payload is metadata only — ids, versions, sizes,
 * digests, descriptors and download URLs — and never weights: those are fetched by the client
 * from their own pinned URL and verified against the digest it got from here, which keeps this
 * route small, cacheable, and unable to serve content a client would run unverified.
 *
 * An upstream that cannot be read is a 502, not an empty catalog: "nothing is installable" and
 * "we could not check" are different answers and a client must not confuse them.
 *
 * The catalog is the same for every caller, so after the sign-in check it is shared through the
 * colo's edge cache for as long as an isolate keeps its own copy: a new isolate answers from there
 * instead of reading the catalog and every descriptor from upstream again.
 */
export default defineEventHandler(async (event) => {
  await requireAuth(event)

  const edge = await openEdgeCache(event, { name: 'v1/speech/models', params: { source: SPEECH_MODEL_CATALOG_SOURCE } })
  if (edge?.hit)
    return edge.hit

  let catalog: Awaited<ReturnType<typeof readSpeechCatalog>>
  try {
    catalog = await readSpeechCatalog()
  } catch (error) {
    if (error instanceof SpeechCatalogUnavailableError)
      throw createError({
        statusCode: 502,
        statusMessage: `Speech model catalog is unavailable: ${error.message}`,
      })
    throw error
  }

  if (edge) {
    return edge.store({
      body: catalog.bytes,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'x-content-sha256': catalog.sha256,
        'cache-control': 'private, max-age=300',
      },
    }, SPEECH_CATALOG_CACHE_MS / 1000)
  }

  setResponseHeader(event, 'content-type', 'application/json; charset=utf-8')
  setResponseHeader(event, 'x-content-sha256', catalog.sha256)
  setResponseHeader(event, 'cache-control', 'private, max-age=300')

  return send(event, catalog.bytes)
})
