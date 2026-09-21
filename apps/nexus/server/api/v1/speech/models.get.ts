import { createError, send, setResponseHeader } from 'h3'
import { requireAuth } from '../../../utils/auth'
import { readSpeechCatalog, SpeechCatalogUnavailableError } from '../../../utils/speechCatalogStore'

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
 */
export default defineEventHandler(async (event) => {
  await requireAuth(event)

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

  setResponseHeader(event, 'content-type', 'application/json; charset=utf-8')
  setResponseHeader(event, 'x-content-sha256', catalog.sha256)
  setResponseHeader(event, 'cache-control', 'private, max-age=300')

  return send(event, catalog.bytes)
})
