import { requirePilotAdmin } from '../../../utils/pilot-admin-auth'
import { getPilotAdminStorageSettings } from '../../../utils/pilot-admin-storage-config'

export default defineEventHandler(async (event) => {
  await requirePilotAdmin(event)
  const settings = await getPilotAdminStorageSettings(event)

  return {
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
