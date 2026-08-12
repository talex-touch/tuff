import { getHeader, readBody } from 'h3'
import type { H3Event } from 'h3'
import type { paths } from '../../../../types/sync-api'
import { requireAppAuth } from '../../../utils/auth'
import { consumeLoginToken, evaluateRecoveryRateLimit, getDevice, listPasskeys, readDeviceId, recordDeviceAuthAudit } from '../../../utils/authStore'
import { createSyncError } from '../../../utils/syncErrors'
import { recoverKeyrings } from '../../../utils/syncStoreV1'

type RecoverBody = paths['/api/v1/keys/recover-device']['post']['requestBody']['content']['application/json']
type RecoverResponse = paths['/api/v1/keys/recover-device']['post']['responses']['200']['content']['application/json']

async function requireStepUpIfPasskeyEnabled(event: H3Event, userId: string, deviceId: string) {
  const device = await getDevice(event, userId, deviceId)
  if (device?.trusted && !device.revokedAt)
    return

  const passkeys = await listPasskeys(event, userId)
  if (!passkeys || passkeys.length === 0)
    return

  const token = getHeader(event, 'x-login-token')
  if (!token)
    throw createSyncError('DEVICE_NOT_AUTHORIZED', 403, 'MF2A required')

  const user = await consumeLoginToken(event, token, 'passkey')
  if (!user || user.id !== userId)
    throw createSyncError('DEVICE_NOT_AUTHORIZED', 403, 'MF2A required')
}

export default defineEventHandler(async (event) => {
  const { userId } = await requireAppAuth(event)
  const deviceId = readDeviceId(event)
  if (!deviceId)
    throw createSyncError('SYNC_INVALID_PAYLOAD', 400, 'Missing device id')

  await requireStepUpIfPasskeyEnabled(event, userId, deviceId)

  const body = await readBody<RecoverBody>(event)
  const recoveryCode = typeof body?.recovery_code === 'string' ? body.recovery_code.trim() : ''
  if (!recoveryCode)
    throw createSyncError('SYNC_INVALID_PAYLOAD', 400, 'Invalid payload')

  // Nothing bounded guessing before this: the route called recoverKeyrings on every request,
  // and the step-up above returns early when the device is already trusted or the user has no
  // passkeys, so an app token for the account was enough to try codes indefinitely (#904).
  const rateLimit = await evaluateRecoveryRateLimit(event, { userId, deviceId })
  if (!rateLimit.allowed) {
    await recordDeviceAuthAudit(event, {
      action: 'recover',
      status: 'blocked',
      userId,
      deviceId,
      reason: 'rate_limited',
    })
    throw createSyncError('DEVICE_NOT_AUTHORIZED', 429, 'Too many recovery attempts')
  }

  let keyrings
  try {
    keyrings = await recoverKeyrings(event, userId, { recoveryCode })
  }
  catch (error) {
    // Only failures are counted, so a legitimate recovery never consumes anyone's budget.
    await recordDeviceAuthAudit(event, {
      action: 'recover',
      status: 'failed',
      userId,
      deviceId,
    })
    throw error
  }

  await recordDeviceAuthAudit(event, {
    action: 'recover',
    status: 'success',
    userId,
    deviceId,
  })

  const response: RecoverResponse = { keyrings }
  return response
})
