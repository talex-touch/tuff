import { requireAdmin } from '../../utils/auth'
import { assertValidImageKey, deleteImage } from '../../utils/imageStorage'

export default defineEventHandler(async (event) => {
  // 只有 admin 可以删除图片
  await requireAdmin(event)

  const key = assertValidImageKey(event.context.params?.key)

  await deleteImage(event, key)

  return {
    success: true,
  }
})
