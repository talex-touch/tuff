import { getHeader, readFormData } from 'h3'
import { requireAppAuth } from '../../../../../utils/auth'
import { readDeviceId } from '../../../../../utils/authStore'
import { createSyncError } from '../../../../../utils/syncErrors'
import { getSyncSession, uploadSyncBlobChunk, type SyncBlobChunkDescriptor } from '../../../../../utils/syncStoreV1'

const isFile = (value: unknown): value is File => typeof File !== 'undefined' && value instanceof File

export default defineEventHandler(async (event) => {
  const { userId } = await requireAppAuth(event)
  const deviceId = readDeviceId(event)
  const syncToken = getHeader(event, 'x-sync-token')
  if (!deviceId || !syncToken)
    throw createSyncError('SYNC_INVALID_PAYLOAD', 400, 'Missing sync session identity')
  await getSyncSession(event, userId, deviceId, syncToken)

  const formData = await readFormData(event)
  const file = formData.get('file')
  const sessionId = formData.get('session_id')
  const index = Number(formData.get('index'))
  const sha256 = typeof formData.get('sha256') === 'string' ? String(formData.get('sha256')).trim().toLowerCase() : ''
  const sizeBytes = Number(formData.get('size_bytes'))
  if (
    !isFile(file)
    || typeof sessionId !== 'string'
    || !sessionId.trim()
    || !Number.isSafeInteger(index)
    || index < 0
    || !/^[a-f0-9]{64}$/.test(sha256)
    || !Number.isSafeInteger(sizeBytes)
    || sizeBytes <= 0
  ) {
    throw createSyncError('SYNC_INVALID_PAYLOAD', 400, 'Invalid upload chunk')
  }

  const result = await uploadSyncBlobChunk(event, userId, sessionId.trim(), {
    index,
    sha256,
    sizeBytes
  } satisfies SyncBlobChunkDescriptor, file)
  return {
    chunk_id: result.chunkId,
    sha256: result.sha256,
    size_bytes: result.sizeBytes
  }
})
