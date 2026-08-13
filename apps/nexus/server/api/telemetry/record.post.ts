import { guardTelemetryIp } from '../../utils/ipSecurityStore'
import { recordTelemetryEvent } from '../../utils/telemetryStore'
import { resolveTelemetryUserId } from '../../utils/telemetryIdentity'

export default defineEventHandler(async (event) => {
  await guardTelemetryIp(event, { weight: 1, action: 'telemetry.record' })

  const body = await readBody(event)

  if (!body || typeof body !== 'object') {
    throw createError({ statusCode: 400, statusMessage: 'Invalid request body' })
  }

  const {
    eventType,
    clientId,
    deviceFingerprint,
    platform,
    version,
    region,
    searchQuery,
    searchDurationMs,
    searchResultCount,
    providerTimings,
    inputTypes,
    metadata,
    isAnonymous = true,
  } = body

  if (!eventType || !['search', 'visit', 'error', 'feature_use', 'performance'].includes(eventType)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid event type' })
  }

  // Deliberately not read from the body: this route is unauthenticated, so a body userId is a
  // claim anyone can make about anyone (#901). Null here means the event is anonymous.
  const resolvedUserId = await resolveTelemetryUserId(event)

  await recordTelemetryEvent(event, {
    eventType,
    userId: resolvedUserId || undefined,
    clientId: clientId || undefined,
    deviceFingerprint: deviceFingerprint || undefined,
    platform: platform || undefined,
    version: version || undefined,
    region: region || undefined,
    searchQuery: searchQuery || undefined,
    searchDurationMs: typeof searchDurationMs === 'number' ? searchDurationMs : undefined,
    searchResultCount: typeof searchResultCount === 'number' ? searchResultCount : undefined,
    providerTimings: providerTimings || undefined,
    inputTypes: Array.isArray(inputTypes) ? inputTypes : undefined,
    metadata: metadata || undefined,
    // An event with no proven owner is anonymous whatever the body claims.
    isAnonymous: resolvedUserId ? isAnonymous !== false : true,
  })

  return { success: true }
})
