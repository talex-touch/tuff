import type { H3Event } from 'h3'
import type { PilotAuthContext } from './auth'
import process from 'node:process'
import { createError } from 'h3'
import { requirePilotAuth } from './auth'
import { getPilotLocalUserByUserId, isPilotLocalUserId, normalizePilotLocalEmail } from './pilot-local-auth'

function resolveBootstrapAdminEmailFromEnv(): string {
  return normalizePilotLocalEmail(
    process.env.PILOT_BOOTSTRAP_ADMIN_EMAIL
    || 'admin@pilot.local',
  )
}

export interface PilotAdminResolution {
  auth: PilotAuthContext
  isAdmin: boolean
  reason: 'bootstrap-email' | 'none'
}

export async function resolvePilotAdmin(event: H3Event): Promise<PilotAdminResolution> {
  const auth = requirePilotAuth(event)
  if (!auth.isAuthenticated) {
    return {
      auth,
      isAdmin: false,
      reason: 'none',
    }
  }

  const bootstrapEmail = resolveBootstrapAdminEmailFromEnv()
  if (bootstrapEmail && isPilotLocalUserId(auth.userId)) {
    try {
      const profile = await getPilotLocalUserByUserId(event, auth.userId)
      if (profile && normalizePilotLocalEmail(profile.email) === bootstrapEmail) {
        return {
          auth,
          isAdmin: true,
          reason: 'bootstrap-email',
        }
      }
    }
    catch {
      // ignore lookup errors and fallback to non-admin
    }
  }

  return {
    auth,
    isAdmin: false,
    reason: 'none',
  }
}

export async function requirePilotAdmin(event: H3Event): Promise<PilotAdminResolution> {
  const resolved = await resolvePilotAdmin(event)
  if (!resolved.isAdmin) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Pilot admin permission required.',
    })
  }
  return resolved
}
