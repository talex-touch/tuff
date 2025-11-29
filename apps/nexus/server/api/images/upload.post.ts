import { createError, readFormData } from 'h3'
import { requireAdmin } from '../../utils/auth'
import { RESOURCE_ALLOWED_EXTENSIONS, RESOURCE_ALLOWED_TYPES, uploadImage } from '../../utils/imageStorage'

const isFile = (value: unknown): value is File => typeof File !== 'undefined' && value instanceof File

export default defineEventHandler(async (event) => {
  // 只有 admin 可以上传图片
  await requireAdmin(event)

  const formData = await readFormData(event)
  const file = formData.get('file')

  if (!file || !isFile(file)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'No file provided',
    })
  }

  const result = await uploadImage(event, file, {
    allowedTypes: RESOURCE_ALLOWED_TYPES,
    allowedExtensions: RESOURCE_ALLOWED_EXTENSIONS,
  })

  return {
    success: true,
    url: result.url,
    key: result.key,
  }
})
