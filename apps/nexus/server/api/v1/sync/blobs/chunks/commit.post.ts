import { getHeader, readBody } from 'h3'
import { requireAppAuth } from '../../../../../utils/auth'
import { resolveBoundAppDeviceId } from '../../../../../utils/syncDeviceAuth'
import { createSyncError } from '../../../../../utils/syncErrors'
import { commitSyncBlobChunks, getSyncSession } from '../../../../../utils/syncStoreV1'

export default defineEventHandler(async (event) => {
  const { userId, deviceId: tokenDeviceId } = await requireAppAuth(event)
  const deviceId = resolveBoundAppDeviceId(event, tokenDeviceId)
  const syncToken = getHeader(event, 'x-sync-token')
  if (!syncToken)
    throw createSyncError('SYNC_INVALID_PAYLOAD', 400, 'Missing sync session identity')
  await getSyncSession(event, userId, deviceId, syncToken)

  const body = await readBody<Record<string, unknown>>(event)
  const sessionId = typeof body?.session_id === 'string' ? body.session_id.trim() : ''
  if (!sessionId || sessionId.length > 128)
    throw createSyncError('SYNC_INVALID_PAYLOAD', 400, 'Invalid upload session')

  const result = await commitSyncBlobChunks(event, userId, sessionId)
  return {
    blob_id: result.blobId,
    object_key: result.objectKey,
    sha256: result.sha256,
    size_bytes: result.sizeBytes
  }
})
