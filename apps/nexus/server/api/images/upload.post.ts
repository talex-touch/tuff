import { createError, readFormData } from 'h3'
import { requireAdmin } from '../../utils/auth'
import { RESOURCE_ALLOWED_EXTENSIONS, RESOURCE_ALLOWED_TYPES, uploadImage } from '../../utils/imageStorage'
import { recordPlatformGovernanceEvent } from '../../utils/platformGovernanceStore'

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

  let result: Awaited<ReturnType<typeof uploadImage>>
  try {
    result = await uploadImage(event, file, {
      allowedTypes: RESOURCE_ALLOWED_TYPES,
      allowedExtensions: RESOURCE_ALLOWED_EXTENSIONS,
    })
  }
  catch (error) {
    await recordPlatformGovernanceEvent(event, {
      scope: 'upload',
      action: 'resource.failed',
      actorId: userId,
      resourceType: 'resource',
      channel: file.type || 'unknown',
      unit: 'file',
      quantity: 1,
      metadata: {
        size: file.size,
        extension: file.name.split('.').pop()?.toLowerCase() ?? null,
        reason: error instanceof Error ? error.message : 'upload_failed',
      },
    }).catch(() => {})
    throw error
  }

  await recordPlatformGovernanceEvent(event, {
    scope: 'upload',
    action: 'resource.completed',
    actorId: userId,
    resourceType: 'resource',
    resourceId: result.key,
    channel: file.type || 'unknown',
    unit: 'byte',
    quantity: file.size,
    metadata: {
      extension: result.key.split('.').pop()?.toLowerCase() ?? null,
    },
  }).catch(() => {})

  return {
    success: true,
    url: result.url,
    key: result.key,
  }
})
