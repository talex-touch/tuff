import { createError } from 'h3'
import { getImage } from '../../utils/imageStorage'

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

  const image = await getImage(event, key)

  if (!image) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Image not found',
    })
  }

  // Content types that a browser will execute if it renders them as a top-level document.
  // SVG is no longer accepted at upload, but anything stored before that change is still
  // here, and this endpoint is what made it dangerous (#896).
  const ACTIVE_DOCUMENT_TYPES = /^(?:image\/svg\+xml|text\/html|application\/xhtml\+xml|.*\bxml\b)/i
  const isActiveDocument = ACTIVE_DOCUMENT_TYPES.test(image.contentType ?? '')

  // nosniff unconditionally: without it a browser may ignore the declared type and execute
  // what it guesses instead, which is the same failure by a different route.
  event.node.res.setHeader('X-Content-Type-Options', 'nosniff')

  if (isActiveDocument) {
    // Served as an opaque download rather than refused, so an existing icon does not turn
    // into a broken page — but it will no longer render inline, and such icons need
    // re-uploading in a raster format.
    event.node.res.setHeader('Content-Type', 'application/octet-stream')
    event.node.res.setHeader('Content-Disposition', `attachment; filename="${key}"`)
  }
  else {
    event.node.res.setHeader('Content-Type', image.contentType)
  }

  event.node.res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')

  // 返回图片数据
  return image.data
})
