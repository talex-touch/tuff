import { readBody } from 'h3'
import type { paths } from '../../../../types/sync-api'
import { requireAppAuth } from '../../../utils/auth'
import { readDeviceId } from '../../../utils/authStore'
import { createSyncError } from '../../../utils/syncErrors'
import { validateQuota } from '../../../utils/syncStoreV1'

type ValidateBody = paths['/api/v1/quotas/validate']['post']['requestBody']['content']['application/json']
type ValidateResponse = paths['/api/v1/quotas/validate']['post']['responses']['200']['content']['application/json']

export default defineEventHandler(async (event) => {
  const { userId } = await requireAppAuth(event)
  const deviceId = readDeviceId(event)
  if (!deviceId)
    throw createSyncError('SYNC_INVALID_PAYLOAD', 400, 'Missing device id')

  const body = await readBody<ValidateBody>(event)
  const storageDelta = Number(body?.storage_bytes_delta ?? 0)
  const objectsDelta = Number(body?.objects_delta ?? 0)
  if (!Number.isFinite(storageDelta) || !Number.isFinite(objectsDelta))
    throw createSyncError('SYNC_INVALID_PAYLOAD', 400, 'Invalid payload')

  const result = await validateQuota(event, userId, { storageDelta, objectsDelta })
  const response: ValidateResponse = {
    ok: result.ok,
    code: result.ok ? null : result.code,
  }
  return response
})
