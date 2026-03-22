import { createError, getRequestURL } from 'h3'
import { requirePilotAuth } from '../../utils/auth'
import { upsertPilotEntity } from '../../utils/pilot-entity-store'
import { quotaOk } from '../../utils/quota-api'
import { saveQuotaUploadObject } from '../../utils/quota-upload-store'

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024

export default defineEventHandler(async (event) => {
  const auth = requirePilotAuth(event)

  const files = await readMultipartFormData(event)
  const first = files?.find(item => item.type && item.data)
  if (!first || !first.data) {
    throw createError({
      statusCode: 400,
      statusMessage: 'file is required',
    })
  }

  const size = Number(first.data.byteLength || 0)
  if (size <= 0) {
    throw createError({
      statusCode: 400,
      statusMessage: 'file is empty',
    })
  }

  if (size > MAX_UPLOAD_BYTES) {
    throw createError({
      statusCode: 413,
      statusMessage: 'file is too large (max 10MB)',
    })
  }

  const stored = saveQuotaUploadObject({
    name: first.filename || 'upload.bin',
    mimeType: first.type || 'application/octet-stream',
    data: first.data,
  })

  const filename = `/api/tools/upload/content/${stored.id}`
  const requestUrl = getRequestURL(event)
  const url = `${requestUrl.protocol}//${requestUrl.host}${filename}`
  const now = new Date().toISOString()

  await upsertPilotEntity(event, {
    domain: 'tools.storage',
    id: stored.id,
    payload: {
      id: stored.id,
      filename: first.filename || 'upload.bin',
      mimeType: first.type || 'application/octet-stream',
      size,
      userId: auth.userId,
      path: filename,
      url,
      createdAt: now,
      updatedAt: now,
    },
  })

  return quotaOk({
    filename,
    url,
  })
})
