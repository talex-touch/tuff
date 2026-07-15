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

  // 设置响应头
  event.node.res.setHeader('Content-Type', image.contentType)
  event.node.res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')

  // 返回图片数据
  return image.data
})
