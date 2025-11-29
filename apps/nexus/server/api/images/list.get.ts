import { requireAdmin } from '../../utils/auth'
import { listImages } from '../../utils/imageStorage'

export default defineEventHandler(async (event) => {
  // 只有 admin 可以列出所有图片
  await requireAdmin(event)

  const keys = await listImages(event)

  return {
    images: keys.map(key => ({
      key,
      url: `/api/images/${key}`,
    })),
    total: keys.length,
  }
})
