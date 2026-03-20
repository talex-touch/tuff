import { createError, setHeader } from 'h3'
import { requirePilotAuth } from '../../../utils/auth'
import { readPilotRuntimeMediaCache } from '../../../utils/pilot-runtime-media-cache'

export default defineEventHandler(async (event) => {
  requirePilotAuth(event)
  const id = String(event.context.params?.id || '').trim()
  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Bad Request',
      message: 'media id is required',
    })
  }

  const item = readPilotRuntimeMediaCache(id)
  if (!item) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Not Found',
      message: 'media not found or expired',
    })
  }

  setHeader(event, 'Content-Type', item.mimeType || 'application/octet-stream')
  setHeader(event, 'Content-Length', item.bytes.byteLength)
  setHeader(event, 'Cache-Control', 'private, max-age=300')
  return item.bytes
})
