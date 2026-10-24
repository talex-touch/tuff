import { getHeader, readBody } from 'h3'
import { requireAppAuth } from '../../../../utils/auth'
import { readDeviceId } from '../../../../utils/authStore'
import { createSyncError } from '../../../../utils/syncErrors'
import { findExistingSyncBlob, getSyncSession, reconcileSyncBlobsV1, validateQuota } from '../../../../utils/syncStoreV1'

interface PrepareBlobResponse {
  action: 'reuse' | 'upload'
  blob_id?: string
  object_key?: string
  sha256?: string
  size_bytes?: number
}

const readString = (value: unknown): string | null => typeof value === 'string' ? value.trim() : null

export default defineEventHandler(async (event) => {
  const { userId } = await requireAppAuth(event)
  const deviceId = readDeviceId(event)
  if (!deviceId)
    throw createSyncError('SYNC_INVALID_PAYLOAD', 400, 'Missing device id')

  const syncToken = getHeader(event, 'x-sync-token')
  if (!syncToken)
    throw createSyncError('SYNC_INVALID_PAYLOAD', 400, 'Missing sync token')

  await getSyncSession(event, userId, deviceId, syncToken)

  const body = await readBody<Record<string, unknown>>(event)
  const itemId = readString(body?.item_id)
  const logicalVersion = readString(body?.logical_version)
  const sha256 = readString(body?.sha256)?.toLowerCase() ?? null
  const sizeBytes = body?.size_bytes

  if (
    !itemId
    || !logicalVersion
    || itemId.length > 512
    || logicalVersion.length > 256
    || !sha256
    || !/^[a-f0-9]{64}$/.test(sha256)
    || !Number.isSafeInteger(sizeBytes)
    || Number(sizeBytes) < 0
  ) {
    throw createSyncError('SYNC_INVALID_PAYLOAD', 400, 'Invalid blob preparation payload')
  }

  const normalizedSizeBytes = Number(sizeBytes)
  const existingBlob = await findExistingSyncBlob(event, userId, itemId, logicalVersion, {
    sha256,
    sizeBytes: normalizedSizeBytes
  })
  if (existingBlob) {
    const response: PrepareBlobResponse = {
      action: 'reuse',
      blob_id: existingBlob.blobId,
      object_key: existingBlob.objectKey,
      sha256: existingBlob.sha256,
      size_bytes: existingBlob.sizeBytes
    }
    return response
  }
  await reconcileSyncBlobsV1(event, userId)


  const quotaCheck = await validateQuota(event, userId, {
    storageDelta: normalizedSizeBytes,
    objectsDelta: 1,
    itemSize: normalizedSizeBytes
  })
  if (!quotaCheck.ok)
    throw createSyncError(quotaCheck.code!, 403, 'Quota exceeded')

  return {
    action: 'upload'
  } satisfies PrepareBlobResponse
})
