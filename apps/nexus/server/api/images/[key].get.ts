import { createError } from 'h3'
import { openEdgeCache } from '../../utils/edgeCache'
import { assertValidImageKey, getImage, isSafeInlineImageMime, normalizeMimeType } from '../../utils/imageStorage'

/**
 * How long a copy of an image is served from the edge cache. A key is a fresh UUID per upload, so a
 * copy is never stale — but a deleted image (a takedown included) stays reachable at the edge for up
 * to this long, which is why it is an hour and not the year browsers already keep it.
 */
const IMAGE_EDGE_TTL_SECONDS = 60 * 60

export default defineEventHandler(async (event) => {
  const key = assertValidImageKey(event.context.params?.key)

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

  const normalizedMime = normalizeMimeType(image.contentType)
  const allowInline = isSafeInlineImageMime(normalizedMime)

  // nosniff unconditionally: without it a browser may ignore the declared type and execute
  // what it guesses instead, which is the same failure by a different route.
  const headers: Record<string, string> = {
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'public, max-age=31536000, immutable',
  }
  if (!allowInline) {
    // Only allowlisted safe raster types render inline; everything else (SVG, HTML, XML, JS,
    // PDF, multipart, unknown) is downgraded to an opaque attachment download.
    headers['Content-Type'] = 'application/octet-stream'
    headers['Content-Disposition'] = `attachment; filename="${key}"`
  }
  else {
    headers['Content-Type'] = normalizedMime
  }

  if (edge) {
    return edge.store({ body: image.data, headers }, IMAGE_EDGE_TTL_SECONDS)
  }

  for (const [name, value] of Object.entries(headers))
    event.node.res.setHeader(name, value)

  // 返回图片数据
  return image.data
})
