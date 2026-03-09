import { createError } from 'h3'
import { requirePilotAuth } from '../../../utils/auth'
import { updatePilotAdminStorageSettings } from '../../../utils/pilot-admin-storage-config'

interface StorageConfigBody {
  attachmentProvider?: string
  attachmentPublicBaseUrl?: string
  minioEndpoint?: string
  minioBucket?: string
  minioAccessKey?: string
  minioSecretKey?: string
  clearMinioSecretKey?: boolean
  minioRegion?: string
  minioForcePathStyle?: boolean
  minioPublicBaseUrl?: string
}

function normalizeProvider(value: string): 'auto' | 'memory' | 'r2' | 's3' {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'memory' || normalized === 'r2' || normalized === 's3') {
    return normalized
  }
  if (normalized === 'minio') {
    return 's3'
  }
  return 'auto'
}

export default defineEventHandler(async (event) => {
  requirePilotAuth(event)
  const body = await readBody<StorageConfigBody>(event)

  const attachmentProvider = normalizeProvider(String(body?.attachmentProvider || 'auto'))
  if (attachmentProvider === 's3' && !String(body?.minioEndpoint || '').trim()) {
    throw createError({
      statusCode: 400,
      statusMessage: 'minioEndpoint is required when attachmentProvider is s3.',
    })
  }

  const settings = await updatePilotAdminStorageSettings(event, {
    attachmentProvider,
    attachmentPublicBaseUrl: body?.attachmentPublicBaseUrl,
    minioEndpoint: body?.minioEndpoint,
    minioBucket: body?.minioBucket,
    minioAccessKey: body?.minioAccessKey,
    minioSecretKey: body?.clearMinioSecretKey ? '' : body?.minioSecretKey,
    minioRegion: body?.minioRegion,
    minioForcePathStyle: body?.minioForcePathStyle,
    minioPublicBaseUrl: body?.minioPublicBaseUrl,
  })

  return {
    ok: true,
    settings: {
      attachmentProvider: settings.attachmentProvider || 'auto',
      attachmentPublicBaseUrl: settings.attachmentPublicBaseUrl || '',
      minioEndpoint: settings.minioEndpoint || '',
      minioBucket: settings.minioBucket || '',
      minioAccessKey: settings.minioAccessKey || '',
      minioRegion: settings.minioRegion || 'us-east-1',
      minioForcePathStyle: settings.minioForcePathStyle !== false,
      minioPublicBaseUrl: settings.minioPublicBaseUrl || '',
      hasMinioSecretKey: Boolean(settings.minioSecretKey),
    },
  }
})
