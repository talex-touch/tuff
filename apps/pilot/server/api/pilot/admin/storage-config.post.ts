import { createError } from 'h3'
import { requirePilotAdmin } from '../../../utils/pilot-admin-auth'
import { updatePilotAdminSettings } from '../../../utils/pilot-admin-settings'

interface StorageConfigBody {
  attachmentProvider?: string
  attachmentPublicBaseUrl?: string
  minioEndpoint?: string
  minioBucket?: string
  minioAccessKey?: string
  clearMinioAccessKey?: boolean
  minioSecretKey?: string
  clearMinioSecretKey?: boolean
  minioRegion?: string
  minioForcePathStyle?: boolean
  minioPublicBaseUrl?: string
}

function normalizeProvider(value: string): 'auto' | 'memory' | 's3' {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'memory' || normalized === 's3') {
    return normalized
  }
  if (normalized === 'minio') {
    return 's3'
  }
  return 'auto'
}

export default defineEventHandler(async (event) => {
  await requirePilotAdmin(event)
  const body = await readBody<StorageConfigBody>(event)

  const attachmentProvider = normalizeProvider(String(body?.attachmentProvider || 'auto'))
  if (attachmentProvider === 's3' && !String(body?.minioEndpoint || '').trim()) {
    throw createError({
      statusCode: 400,
      statusMessage: 'minioEndpoint is required when attachmentProvider is s3.',
    })
  }

  const settings = await updatePilotAdminSettings(event, {
    storage: {
      attachmentProvider,
      attachmentPublicBaseUrl: body?.attachmentPublicBaseUrl,
      minioEndpoint: body?.minioEndpoint,
      minioBucket: body?.minioBucket,
      minioAccessKey: body?.minioAccessKey,
      clearMinioAccessKey: body?.clearMinioAccessKey,
      minioSecretKey: body?.minioSecretKey,
      clearMinioSecretKey: body?.clearMinioSecretKey,
      minioRegion: body?.minioRegion,
      minioForcePathStyle: body?.minioForcePathStyle,
      minioPublicBaseUrl: body?.minioPublicBaseUrl,
    },
  })

  return {
    ok: true,
    settings: settings.storage,
  }
})
