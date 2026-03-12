import { createError } from 'h3'
import { requirePilotAuth } from '../../utils/auth'
import { quotaOk } from '../../utils/quota-api'
import { saveQuotaUploadObject } from '../../utils/quota-upload-store'

export default defineEventHandler(async (event) => {
  requirePilotAuth(event)

  const files = await readMultipartFormData(event)
  const first = files?.find(item => item.type && item.data)
  if (!first || !first.data) {
    throw createError({
      statusCode: 400,
      statusMessage: 'file is required',
    })
  }

  const stored = saveQuotaUploadObject({
    name: first.filename || 'upload.bin',
    mimeType: first.type || 'application/octet-stream',
    data: first.data,
  })

  return quotaOk({
    filename: `/api/tools/upload/content/${stored.id}`,
  })
})
