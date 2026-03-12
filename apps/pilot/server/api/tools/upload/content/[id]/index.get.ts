import { createError } from 'h3'
import { getQuotaUploadObject } from '../../../../../utils/quota-upload-store'

export default defineEventHandler((event) => {
  const id = String(event.context.params?.id || '').trim()
  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'id is required',
    })
  }

  const record = getQuotaUploadObject(id)
  if (!record) {
    throw createError({
      statusCode: 404,
      statusMessage: 'upload not found',
    })
  }

  setHeader(event, 'Content-Type', record.mimeType)
  setHeader(event, 'Cache-Control', 'public, max-age=86400')
  return record.data
})
