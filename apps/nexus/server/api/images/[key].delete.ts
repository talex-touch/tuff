import { createError } from 'h3'
import { requireAdmin } from '../../utils/auth'
import { deleteImage } from '../../utils/imageStorage'

export default defineEventHandler(async (event) => {
  // 只有 admin 可以删除图片
  await requireAdmin(event)

  const key = event.context.params?.key

  if (!key) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Image key is required',
    })
  }

  await deleteImage(event, key)

  return {
    success: true,
  }
})
