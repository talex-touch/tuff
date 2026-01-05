import { recordTelemetryEvent } from '../../utils/telemetryStore'
import { guardTelemetryIp } from '../../utils/ipSecurityStore'

export default defineEventHandler(async (event) => {
  await guardTelemetryIp(event, { weight: 1, action: 'telemetry.record' })

  const body = await readBody(event)

  if (!body || typeof body !== 'object') {
    throw createError({ statusCode: 400, statusMessage: 'Invalid request body' })
  }

  const {
    eventType,
    userId,
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

  await recordTelemetryEvent(event, {
    eventType,
    userId: userId || undefined,
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
    isAnonymous: isAnonymous !== false,
  })

  return { success: true }
})
