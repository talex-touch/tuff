import type { H3Event } from 'h3'
import { ensurePilotDeviceId } from './pilot-device'
import { readPilotSessionUserId } from './pilot-session'

const GUEST_USER_PREFIX = 'pilot_guest_'

export interface PilotAuthContext {
  userId: string
  source: 'session-cookie' | 'device-cookie'
  isAuthenticated: boolean
  deviceId?: string
}

export function toGuestUserId(deviceId: string): string {
  return `${GUEST_USER_PREFIX}${deviceId}`
}

export function requirePilotAuth(event: H3Event): PilotAuthContext {
  const sessionUserId = readPilotSessionUserId(event)
  if (sessionUserId) {
    return {
      userId: sessionUserId,
      source: 'session-cookie',
      isAuthenticated: true,
    }
  }

  const deviceId = ensurePilotDeviceId(event)
  return {
    userId: toGuestUserId(deviceId),
    source: 'device-cookie',
    isAuthenticated: false,
    deviceId,
  }
}
