import { getHeader, readFormData } from 'h3'
import { randomUUID } from 'node:crypto'
import type { paths } from '../../../../../types/sync-api'
import { requireAppAuth } from '../../../../utils/auth'
import { readDeviceId } from '../../../../utils/authStore'
import { createSyncError } from '../../../../utils/syncErrors'
import { applyQuotaDelta, findExistingSyncBlob, getSyncSession, uploadSyncBlob, validateQuota } from '../../../../utils/syncStoreV1'
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

  const rawItemId = formData.get('item_id')
  const rawLogicalVersion = formData.get('logical_version')
  const rawSha256 = formData.get('sha256')
  const rawSizeBytes = formData.get('size_bytes')
  if (
    (rawItemId !== null && typeof rawItemId !== 'string')
    || (rawLogicalVersion !== null && typeof rawLogicalVersion !== 'string')
    || (rawSha256 !== null && typeof rawSha256 !== 'string')
    || (rawSizeBytes !== null && typeof rawSizeBytes !== 'string')
  ) {
    throw createSyncError('SYNC_INVALID_PAYLOAD', 400, 'Invalid blob idempotency fields')
  }
  const itemId = typeof rawItemId === 'string' ? rawItemId.trim() : ''
  const logicalVersion = typeof rawLogicalVersion === 'string' ? rawLogicalVersion.trim() : ''
  const sha256 = typeof rawSha256 === 'string' ? rawSha256.trim().toLowerCase() : ''
  const sizeBytes = typeof rawSizeBytes === 'string' ? Number(rawSizeBytes) : undefined
  if (
    Boolean(itemId) !== Boolean(logicalVersion)
    || itemId.length > 512
    || logicalVersion.length > 256
    || (sha256 && !/^[a-f0-9]{64}$/.test(sha256))
    || (sizeBytes !== undefined && (!Number.isSafeInteger(sizeBytes) || sizeBytes < 0))
  ) {
    throw createSyncError('SYNC_INVALID_PAYLOAD', 400, 'Invalid blob idempotency fields')
  }
  const expectedSizeBytes = sizeBytes ?? Number(file.size)
  if (expectedSizeBytes !== Number(file.size)) {
    throw createSyncError('SYNC_INVALID_PAYLOAD', 400, 'Blob size does not match upload')
  }
  const expectedSha256 = sha256 || undefined
  const existingBlob = await findExistingSyncBlob(
    event,
    userId,
    itemId || undefined,
    logicalVersion || undefined,
    { sha256: expectedSha256, sizeBytes: expectedSizeBytes }
  )
  if (existingBlob) {
    const response: UploadResponse = {
      blob_id: existingBlob.blobId,
      object_key: existingBlob.objectKey,
      sha256: existingBlob.sha256,
      size_bytes: existingBlob.sizeBytes
    }
    return response
  }

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

    const result = await uploadSyncBlob(event, userId, file, {
      itemId: itemId || undefined,
      logicalVersion: logicalVersion || undefined,
      sha256: expectedSha256,
      sizeBytes: expectedSizeBytes
    })
    if (!result.deduplicated) {
      await applyQuotaDelta(event, userId, { storageDelta: result.sizeBytes, objectsDelta: 1 })
    }
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
