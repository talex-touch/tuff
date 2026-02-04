import { readFormData } from 'h3'
import type { paths } from '../../../../../types/sync-api'
import { requireAuth } from '../../../../utils/auth'
import { readDeviceId } from '../../../../utils/authStore'
import { createSyncError } from '../../../../utils/syncErrors'
import { applyQuotaDelta, uploadSyncBlob, validateQuota } from '../../../../utils/syncStoreV1'

type UploadResponse = paths['/api/v1/sync/blobs/upload']['post']['responses']['200']['content']['application/json']

const isFile = (value: unknown): value is File => typeof File !== 'undefined' && value instanceof File

export default defineEventHandler(async (event) => {
  const { userId } = await requireAuth(event)
  const deviceId = readDeviceId(event)
  if (!deviceId)
    throw createSyncError('SYNC_INVALID_PAYLOAD', 400, 'Missing device id')

  const formData = await readFormData(event)
  const file = formData.get('file')
  if (!file || !isFile(file))
    throw createSyncError('SYNC_INVALID_PAYLOAD', 400, 'No file provided')

  const quotaCheck = await validateQuota(event, userId, { storageDelta: Number(file.size), objectsDelta: 1, itemSize: Number(file.size) })
  if (!quotaCheck.ok)
    throw createSyncError(quotaCheck.code!, 403, 'Quota exceeded')

  const result = await uploadSyncBlob(event, userId, file)
  await applyQuotaDelta(event, userId, { storageDelta: result.sizeBytes, objectsDelta: 1 })

  const response: UploadResponse = {
    blob_id: result.blobId,
    object_key: result.objectKey,
    sha256: result.sha256,
    size_bytes: result.sizeBytes,
  }
  return response
})
