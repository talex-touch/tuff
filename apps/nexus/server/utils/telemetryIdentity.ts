import type { H3Event } from 'h3'
import { requireAppAuth, requireSessionAuth } from './auth'

/**
 * Who a telemetry event belongs to, according to the request's own credentials.
 *
 * The telemetry endpoints are unauthenticated — an IP guard only — and used to take `userId`
 * straight from the body. Anyone could POST `{eventType: 'search', userId: '<victim>'}` and
 * have it stored as that person's activity, which then surfaced in the per-user dashboard and
 * in admin analytics (#901).
 *
 * Attribution that anyone can forge is worse than no attribution: it does not merely fail to
 * inform an abuse investigation, it actively misleads one. So a body-supplied userId is now
 * ignored outright, and an event is attributed only when the caller proved who it is.
 *
 * Both credential shapes are tried because the desktop app authenticates with a bearer app
 * token while the web dashboard uses a session cookie; checking only one would silently
 * anonymise the other.
 */
export async function resolveTelemetryUserId(event: H3Event): Promise<string | null> {
  try {
    const { userId } = await requireAppAuth(event)
    if (userId) return userId
  }
  catch {
    // No bearer token, or not a valid one. Fall through to the session check.
  }

  try {
    const { userId } = await requireSessionAuth(event)
    return userId || null
  }
  catch {
    return null
  }
}
