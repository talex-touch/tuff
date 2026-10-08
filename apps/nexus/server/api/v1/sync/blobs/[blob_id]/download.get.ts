import { getHeader, sendStream, setResponseHeader } from 'h3'
import { requireAppAuth } from '../../../../../utils/auth'
import { readDeviceId } from '../../../../../utils/authStore'
import { createSyncError } from '../../../../../utils/syncErrors'
import { getSyncBlob, getSyncSession } from '../../../../../utils/syncStoreV1'

export default defineEventHandler(async (event) => {
  const { userId } = await requireAppAuth(event)
  const deviceId = readDeviceId(event)
  if (!deviceId)
    throw createSyncError('SYNC_INVALID_PAYLOAD', 400, 'Missing device id')

  const syncToken = getHeader(event, 'x-sync-token')
  if (!syncToken)
    throw createSyncError('SYNC_INVALID_PAYLOAD', 400, 'Missing sync token')

  await getSyncSession(event, userId, deviceId, syncToken)

  const { blob_id: blobId } = event.context.params ?? {}
  if (!blobId)
    throw createSyncError('SYNC_INVALID_PAYLOAD', 400, 'Missing blob id')

  const blob = await getSyncBlob(event, userId, blobId)
  if (!blob)
    throw createSyncError('SYNC_INVALID_PAYLOAD', 404, 'Blob not found')

  setResponseHeader(event, 'Content-Type', blob.contentType)
  setResponseHeader(event, 'Content-Length', blob.byteLength)
  setResponseHeader(event, 'Cache-Control', 'private, no-store')
  setResponseHeader(event, 'Content-Disposition', `attachment; filename="blob-${blobId}"`)
  setResponseHeader(event, 'X-Content-SHA256', blob.sha256)

  return sendStream(event, blob.body)
})

