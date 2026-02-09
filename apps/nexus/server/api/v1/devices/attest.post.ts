import { readBody } from 'h3'
import type { paths } from '../../../../types/sync-api'
import { requireAppAuth } from '../../../utils/auth'
import { readDeviceId } from '../../../utils/authStore'
import { createSyncError } from '../../../utils/syncErrors'
import { upsertDeviceAttestation } from '../../../utils/deviceAttestStore'

type AttestBody = paths['/api/v1/devices/attest']['post']['requestBody']['content']['application/json']
type AttestResponse = paths['/api/v1/devices/attest']['post']['responses']['200']['content']['application/json']

export default defineEventHandler(async (event) => {
  const { userId } = await requireAppAuth(event)
  const deviceId = readDeviceId(event)
  if (!deviceId)
    throw createSyncError('SYNC_INVALID_PAYLOAD', 400, 'Missing device id')

  const body = await readBody<AttestBody>(event)
  const machineCodeHash = typeof body?.machine_code_hash === 'string' ? body.machine_code_hash.trim() : ''
  if (!machineCodeHash)
    throw createSyncError('SYNC_INVALID_PAYLOAD', 400, 'Invalid payload')

  const result = await upsertDeviceAttestation(event, userId, deviceId, machineCodeHash)

  const response: AttestResponse = {
    ok: true,
    device_id: result.deviceId,
    updated_at: result.updatedAt,
  }
  return response
})

