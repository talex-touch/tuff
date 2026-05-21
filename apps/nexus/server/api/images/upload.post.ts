import { createError, readFormData } from 'h3'
import { requireAdmin } from '../../utils/auth'
import { RESOURCE_ALLOWED_EXTENSIONS, RESOURCE_ALLOWED_TYPES, uploadImage } from '../../utils/imageStorage'
import { completeUploadGovernance, failUploadGovernance, startUploadGovernance } from '../../utils/uploadGovernance'

const isFile = (value: unknown): value is File => typeof File !== 'undefined' && value instanceof File

export default defineEventHandler(async (event) => {
  // 只有 admin 可以上传图片
  const { userId } = await requireAdmin(event)

  const formData = await readFormData(event)
  const file = formData.get('file')

  if (!file || !isFile(file)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'No file provided',
    })
  }

  const uploadAttempt = await startUploadGovernance(event, {
    actorId: userId,
    resourceType: 'resource',
    file,
    metadata: {
      surface: 'dashboard-resource',
    },
  })

  let result: Awaited<ReturnType<typeof uploadImage>>
  try {
    result = await uploadImage(event, file, {
      allowedTypes: RESOURCE_ALLOWED_TYPES,
      allowedExtensions: RESOURCE_ALLOWED_EXTENSIONS,
      actorId: userId,
      resourceType: 'resource',
    })
  }
  catch (error) {
    await failUploadGovernance(event, uploadAttempt, error, {
      metadata: {
        surface: 'dashboard-resource',
      },
    })
    throw error
  }

  await completeUploadGovernance(event, uploadAttempt, {
    resourceId: result.key,
    contentType: file.type,
    size: file.size,
    storageChannel: result.storageChannel,
    storageProvider: result.storageProvider,
    metadata: {
      surface: 'dashboard-resource',
    },
  })

  return {
    success: true,
    url: result.url,
    key: result.key,
  }
})
