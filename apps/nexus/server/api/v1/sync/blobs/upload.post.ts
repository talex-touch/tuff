import { getHeader, readFormData } from 'h3'
import { randomUUID } from 'node:crypto'
import type { paths } from '../../../../../types/sync-api'
import { requireAppAuth } from '../../../../utils/auth'
import { readDeviceId } from '../../../../utils/authStore'
import { createSyncError } from '../../../../utils/syncErrors'
import { applyQuotaDelta, getSyncSession, uploadSyncBlob, validateQuota } from '../../../../utils/syncStoreV1'
import { completeUploadGovernance, failUploadGovernance, startUploadGovernance } from '../../../../utils/uploadGovernance'

type UploadResponse = paths['/api/v1/sync/blobs/upload']['post']['responses']['200']['content']['application/json']

const isFile = (value: unknown): value is File => typeof File !== 'undefined' && value instanceof File
const SYNC_BLOB_UPLOAD_SURFACE = 'sync-blob-upload'

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function readSyncErrorCode(error: unknown): string | null {
  const errorCode = readRecord(readRecord(error)?.data)?.errorCode
  return typeof errorCode === 'string' && errorCode.trim()
    ? errorCode.trim()
    : null
}

function classifySyncBlobUploadFailure(error: unknown): string {
  const errorCode = readSyncErrorCode(error)
  if (errorCode?.startsWith('QUOTA_'))
    return `sync-${errorCode.toLowerCase().replaceAll('_', '-')}`
  if (errorCode === 'SYNC_INVALID_PAYLOAD')
    return 'sync-invalid-payload'

  const message = String(readRecord(error)?.statusMessage ?? readRecord(error)?.message ?? '').toLowerCase()
  if (message.includes('r2 bucket') || message.includes('storage'))
    return 'sync-blob-storage-unavailable'

  return 'sync-blob-upload-failed'
}

export default defineEventHandler(async (event) => {
  const { userId } = await requireAppAuth(event)
  const deviceId = readDeviceId(event)
  if (!deviceId)
    throw createSyncError('SYNC_INVALID_PAYLOAD', 400, 'Missing device id')

  const syncToken = getHeader(event, 'x-sync-token')
  if (!syncToken)
    throw createSyncError('SYNC_INVALID_PAYLOAD', 400, 'Missing sync token')

  await getSyncSession(event, userId, deviceId, syncToken)

  const formData = await readFormData(event)
  const file = formData.get('file')
  if (!file || !isFile(file))
    throw createSyncError('SYNC_INVALID_PAYLOAD', 400, 'No file provided')

  const uploadResourceId = `sync-blob:${randomUUID()}`
  const uploadAttempt = await startUploadGovernance(event, {
    actorId: userId,
    resourceType: 'sync-blob',
    resourceId: uploadResourceId,
    file,
    metadata: {
      surface: SYNC_BLOB_UPLOAD_SURFACE,
    },
  })

  try {
    const quotaCheck = await validateQuota(event, userId, { storageDelta: Number(file.size), objectsDelta: 1, itemSize: Number(file.size) })
    if (!quotaCheck.ok)
      throw createSyncError(quotaCheck.code!, 403, 'Quota exceeded')

    const result = await uploadSyncBlob(event, userId, file)
    await applyQuotaDelta(event, userId, { storageDelta: result.sizeBytes, objectsDelta: 1 })
    await completeUploadGovernance(event, uploadAttempt, {
      resourceId: uploadResourceId,
      contentType: file.type || 'application/octet-stream',
      size: result.sizeBytes,
      storageChannel: result.storageChannel,
      storageProvider: result.storageProvider,
      metadata: {
        surface: SYNC_BLOB_UPLOAD_SURFACE,
        ...(result.uploadRetry ?? {}),
      },
    })

    const response: UploadResponse = {
      blob_id: result.blobId,
      object_key: result.objectKey,
      sha256: result.sha256,
      size_bytes: result.sizeBytes,
    }
    return response
  }
  catch (error) {
    await failUploadGovernance(event, uploadAttempt, error, {
      reason: classifySyncBlobUploadFailure(error),
      metadata: {
        surface: SYNC_BLOB_UPLOAD_SURFACE,
      },
    })
    throw error
  }
})
