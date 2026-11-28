import type { H3Event } from 'h3'
import { readDeviceId } from './authStore'
import { createSyncError } from './syncErrors'

/**
 * Resolves the authoritative device id for device-scoped `/v1/` endpoints.
 *
 * Always binds to the JWT-authenticated `deviceId` returned by `requireAppAuth(event)` and
 * rejects requests whose `x-device-id` header disagrees (or whose token has no bound device id),
 * preventing cross-device keyring/attestation tampering and trusted-device step-up bypass.
 */
export function resolveBoundAppDeviceId(
  event: H3Event,
  tokenDeviceId: string | null | undefined,
): string {
  const boundDeviceId = typeof tokenDeviceId === 'string' ? tokenDeviceId.trim() : ''
  if (!boundDeviceId) {
    throw createSyncError('DEVICE_NOT_AUTHORIZED', 403, 'Device-bound app token required')
  }

  const headerDeviceId = readDeviceId(event)
  if (headerDeviceId && headerDeviceId !== boundDeviceId) {
    throw createSyncError('DEVICE_NOT_AUTHORIZED', 403, 'Device id mismatch')
  }

  return boundDeviceId
}
