import { createError } from 'h3'
import { getImage } from '../../utils/imageStorage'

export default defineEventHandler(async (event) => {
  const key = event.context.params?.key

  if (!key) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Image key is required',
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
