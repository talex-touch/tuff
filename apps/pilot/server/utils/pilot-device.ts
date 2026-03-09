import type { H3Event } from 'h3'
import { randomBytes } from 'node:crypto'
import { getCookie, getRequestURL, setCookie } from 'h3'

const DEFAULT_DEVICE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30
const DEVICE_ID_PATTERN = /^[a-z0-9]{16,64}$/i

export const PILOT_DEVICE_COOKIE_NAME = 'pilot_device_id'

function createPilotDeviceId(): string {
  return randomBytes(16).toString('hex')
}

export function readPilotDeviceId(event: H3Event): string | null {
  const raw = String(getCookie(event, PILOT_DEVICE_COOKIE_NAME) || '').trim()
  if (!raw) {
    return null
  }
  if (!DEVICE_ID_PATTERN.test(raw)) {
    return null
  }
  return raw
}

export function ensurePilotDeviceId(event: H3Event): string {
  const existing = readPilotDeviceId(event)
  if (existing) {
    return existing
  }

  const deviceId = createPilotDeviceId()
  const secure = getRequestURL(event).protocol === 'https:'

  setCookie(event, PILOT_DEVICE_COOKIE_NAME, deviceId, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure,
    maxAge: DEFAULT_DEVICE_COOKIE_MAX_AGE_SECONDS,
  })

  return deviceId
}
