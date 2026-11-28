import { createError } from 'h3'
import { openEdgeCache } from '../../utils/edgeCache'
import { getImage } from '../../utils/imageStorage'

/**
 * How long a copy of an image is served from the edge cache. A key is a fresh UUID per upload, so a
 * copy is never stale — but a deleted image (a takedown included) stays reachable at the edge for up
 * to this long, which is why it is an hour and not the year browsers already keep it.
 */
const IMAGE_EDGE_TTL_SECONDS = 60 * 60

// Content types that a browser will execute if it renders them as a top-level document.
// SVG is no longer accepted at upload, but anything stored before that change is still
// here, and this endpoint is what made it dangerous (#896).
const ACTIVE_DOCUMENT_TYPES = /^(?:image\/svg\+xml|text\/html|application\/xhtml\+xml|.*\bxml\b)/i

export default defineEventHandler(async (event) => {
  const key = event.context.params?.key

  // Reject path traversal in the object key. `%2F` in the route decodes to `/`,
  // which would let `<userId>%2F<blobId>` address another user's private blob.
  if (!key || key.includes('/') || key.includes('\\') || key.includes('..') || key.includes('\0')) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid image key',
    })
  }

  const edge = await openEdgeCache(event, { name: 'images', params: { key } })
  if (edge?.hit)
    return edge.hit

  const image = await getImage(event, key)

  if (!image) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Image not found',
    })
  }

  const isActiveDocument = ACTIVE_DOCUMENT_TYPES.test(image.contentType ?? '')

  // nosniff unconditionally: without it a browser may ignore the declared type and execute
  // what it guesses instead, which is the same failure by a different route.
  const headers: Record<string, string> = {
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'public, max-age=31536000, immutable',
  }
  if (isActiveDocument) {
    // Served as an opaque download rather than refused, so an existing icon does not turn
    // into a broken page — but it will no longer render inline, and such icons need
    // re-uploading in a raster format.
    headers['Content-Type'] = 'application/octet-stream'
    headers['Content-Disposition'] = `attachment; filename="${key}"`
  }
  else {
    headers['Content-Type'] = image.contentType
  }

  if (edge) {
    return edge.store({ body: image.data, headers }, IMAGE_EDGE_TTL_SECONDS)
  }

  for (const [name, value] of Object.entries(headers))
    event.node.res.setHeader(name, value)

  // 返回图片数据
  return image.data
})
