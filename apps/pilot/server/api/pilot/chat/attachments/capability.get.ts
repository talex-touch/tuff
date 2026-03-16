import { requirePilotAuth } from '../../../../utils/auth'
import { getPilotAttachmentUploadAvailability } from '../../../../utils/pilot-attachment-storage'

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024

export default defineEventHandler(async (event) => {
  requirePilotAuth(event)

  const availability = await getPilotAttachmentUploadAvailability(event)
  return {
    allowed: availability.allowed,
    reason: availability.reason || '',
    provider: availability.provider,
    hasS3Config: availability.hasS3Config,
    hasPublicBaseUrl: availability.hasPublicBaseUrl,
    maxBytes: MAX_ATTACHMENT_BYTES,
    accept: 'image/*,application/pdf,text/*,.md,.json,.csv,.doc,.docx,.xls,.xlsx,.ppt,.pptx',
    source: 'pilot-admin-settings',
    supports: {
      multipart: true,
      base64: true,
      providerFileId: true,
      modelUrl: true,
    },
  }
})
