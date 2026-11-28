import { getHeader, readBody } from 'h3'
import { requireAppAuth } from '../../../../utils/auth'
import { resolveBoundAppDeviceId } from '../../../../utils/syncDeviceAuth'
import { createSyncError } from '../../../../utils/syncErrors'
import {
  findExistingSyncBlob,
  getSyncSession,
  MAX_CHUNKED_BLOB_BYTES,
  MAX_CHUNKED_BLOB_CHUNKS,
  prepareSyncBlobChunks,
  reconcileSyncBlobsV1,
  validateQuota,
  type SyncBlobChunkDescriptor
} from '../../../../utils/syncStoreV1'

const CHUNK_SIZE = 1024 * 1024

export default defineEventHandler(async (event) => {
  const { userId, deviceId: tokenDeviceId } = await requireAppAuth(event)
  const deviceId = resolveBoundAppDeviceId(event, tokenDeviceId)
  const syncToken = getHeader(event, 'x-sync-token')
  if (!syncToken)
    throw createSyncError('SYNC_INVALID_PAYLOAD', 400, 'Missing sync session identity')
  await getSyncSession(event, userId, deviceId, syncToken)

  const body = await readBody<Record<string, unknown>>(event)
  const itemId = typeof body?.item_id === 'string' ? body.item_id.trim() : ''
  const logicalVersion = typeof body?.logical_version === 'string' ? body.logical_version.trim() : ''
  const sha256 = typeof body?.sha256 === 'string' ? body.sha256.trim().toLowerCase() : ''
  const sizeBytes = Number(body?.size_bytes)
  const chunkSize = Number(body?.chunk_size)
  const rawChunks = Array.isArray(body?.chunks) ? body.chunks : []
  const chunks: SyncBlobChunkDescriptor[] = rawChunks.map((value) => {
    const row = value && typeof value === 'object' ? value as Record<string, unknown> : {}
    return {
      index: Number(row.index),
      sha256: typeof row.sha256 === 'string' ? row.sha256.trim().toLowerCase() : '',
      sizeBytes: Number(row.size_bytes)
    }
  })
  const indexes = new Set(chunks.map(chunk => chunk.index))
  const validChunks = chunks.length > 0
    && chunks.length <= MAX_CHUNKED_BLOB_CHUNKS
    && indexes.size === chunks.length
    && chunks.every((chunk, index) => (
      chunk.index === index
      && /^[a-f0-9]{64}$/.test(chunk.sha256)
      && Number.isSafeInteger(chunk.sizeBytes)
      && chunk.sizeBytes > 0
      && chunk.sizeBytes <= chunkSize
    ))
  if (
    !itemId
    || !logicalVersion
    || itemId.length > 512
    || logicalVersion.length > 256
    || !/^[a-f0-9]{64}$/.test(sha256)
    || !Number.isSafeInteger(sizeBytes)
    || sizeBytes <= 0
    || sizeBytes > MAX_CHUNKED_BLOB_BYTES
    || chunkSize !== CHUNK_SIZE
    || !validChunks
    || chunks.reduce((sum, chunk) => sum + chunk.sizeBytes, 0) !== sizeBytes
  ) {
    throw createSyncError('SYNC_INVALID_PAYLOAD', 400, 'Invalid chunked Blob preparation payload')
  }

  await reconcileSyncBlobsV1(event, userId)

  const existing = await findExistingSyncBlob(event, userId, itemId, logicalVersion, {
    sha256,
    sizeBytes,
  })
  if (existing) {
    return {
      action: 'reuse' as const,
      blob_id: existing.blobId,
      object_key: existing.objectKey,
      sha256: existing.sha256,
      size_bytes: existing.sizeBytes,
      session_id: undefined,
      missing: [],
    }
  }

  // Validate quota BEFORE persisting any upload session or chunk ref rows to D1.
  const quotaCheck = await validateQuota(event, userId, {
    storageDelta: sizeBytes,
    objectsDelta: 1,
    itemSize: sizeBytes,
  })
  if (!quotaCheck.ok)
    throw createSyncError(quotaCheck.code!, 403, 'Quota exceeded')

  const result = await prepareSyncBlobChunks(event, userId, {
    itemId,
    logicalVersion,
    sha256,
    sizeBytes,
    chunkSize,
    chunks
  })
  return {
    action: result.action,
    blob_id: result.blob?.blobId,
    object_key: result.blob?.objectKey,
    sha256: result.blob?.sha256,
    size_bytes: result.blob?.sizeBytes,
    session_id: result.sessionId,
    missing: result.missing.map(chunk => ({
      index: chunk.index,
      sha256: chunk.sha256,
      size_bytes: chunk.sizeBytes
    }))
  }
})
